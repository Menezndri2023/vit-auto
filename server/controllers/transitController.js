import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Prestataire, { TYPES_PRESTATAIRE } from "../models/Prestataire.js";
import InvitationPrestataire from "../models/InvitationPrestataire.js";
import DossierImport from "../models/DossierImport.js";
import logger from "../utils/logger.js";
import { PASSWORD_ROUNDS } from "../config/security.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { deposerPiece } from "../utils/deposerPiece.js";
import { FOLDERS } from "../config/imagekit.js";
import { avancerDossier } from "../services/dossierImportService.js";
import { ETAPES, rangEtape, PORTS, codesOrigines, codesDestinations } from "../constants/dossierImport.js";

// ── Zone Transit (2026-10-07) ───────────────────────────────────────────────
// Les prestataires (transitaires, commissionnaires en douane, inspecteurs…)
// ont leur espace, mais l'inscription n'est PAS ouverte au public : seul un
// lien d'invitation envoyé par l'admin permet de créer un compte. Le
// prestataire ne voit que les dossiers d'import qui lui sont affectés et ne
// fait avancer que les étapes logistiques.

const VALIDITE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const hacher = (jeton) => crypto.createHash("sha256").update(String(jeton)).digest("hex");
const ETAPES_TRANSIT = ETAPES.filter((e) => e.transit).map((e) => e.code);
// Documents qu'un prestataire peut déposer (jamais valider : c'est l'admin).
const DOCUMENTS_TRANSIT = ["connaissement", "bsc_ectn", "declaration_douane", "quittance_droits", "mainlevee", "attestation_assurance", "rapport_inspection"];
const PAYS_OUVERTS = () => [...codesOrigines(), ...codesDestinations()];
const CODES_PORTS = PORTS.map((p) => p.code);

const listeFiltree = (valeurs, permis) => [...new Set((Array.isArray(valeurs) ? valeurs : []).map((v) => String(v).trim().toUpperCase()).filter((v) => permis.includes(v)))];
const typesValides = (valeurs) => [...new Set((Array.isArray(valeurs) ? valeurs : []).filter((v) => TYPES_PRESTATAIRE.includes(v)))];
const lienInvitation = (jeton) => `/transit/inscription?jeton=${jeton}`;

// ── Admin : invitations ─────────────────────────────────────────────────────
export const creerInvitation = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const raisonSociale = String(req.body?.raisonSociale || "").trim().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Adresse e-mail invalide." });
    if (!raisonSociale) return res.status(400).json({ message: "Raison sociale requise." });
    const types = typesValides(req.body?.types);
    if (!types.length) return res.status(400).json({ message: "Choisissez au moins un métier (transitaire, douane…)." });
    if (await User.exists({ email })) return res.status(409).json({ message: "Un compte existe déjà avec cette adresse." });

    // Une seule invitation active par adresse : les précédentes sont révoquées.
    await InvitationPrestataire.updateMany({ email, utiliseeLe: null, revoqueeLe: null }, { $set: { revoqueeLe: new Date() } });
    const jeton = crypto.randomBytes(32).toString("hex");
    const invitation = await InvitationPrestataire.create({
      email, raisonSociale, types,
      pays: listeFiltree(req.body?.pays, PAYS_OUVERTS()),
      ports: listeFiltree(req.body?.ports, CODES_PORTS),
      jetonHache: hacher(jeton),
      expireLe: new Date(Date.now() + VALIDITE_INVITATION_MS),
      creePar: req.user._id,
    });

    try {
      const { enqueue } = await import("../queue/index.js");
      const { QUEUE_NAMES } = await import("../queue/definitions.js");
      await enqueue(QUEUE_NAMES.EMAIL, "generic_notification_email", {
        type: "generic_notification", to: email,
        data: {
          firstName: raisonSociale,
          titre: "Invitation à la zone Transit VIT AUTO",
          message: "VIT AUTO vous invite à rejoindre son réseau de prestataires logistiques pour suivre les importations qui vous sont confiées. Le lien ci-dessous est personnel et valable 7 jours.",
          lien: lienInvitation(jeton),
        },
      });
    } catch (e) {
      logger.warn("[Transit] e-mail d'invitation non envoyé (non bloquant) :", e.message);
    }

    // Le lien est rendu une seule fois à l'admin (à transmettre par WhatsApp si
    // l'e-mail tarde) ; il n'est plus jamais lisible ensuite.
    res.status(201).json({ invitation: { _id: invitation._id, email, raisonSociale, expireLe: invitation.expireLe }, lien: lienInvitation(jeton) });
  } catch (err) {
    logger.error("creerInvitation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const listerInvitations = async (_req, res) => {
  try {
    const invitations = await InvitationPrestataire.find({}).select("-jetonHache").sort({ createdAt: -1 }).limit(200).lean();
    res.json({ invitations });
  } catch (err) {
    logger.error("listerInvitations:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const revoquerInvitation = async (req, res) => {
  try {
    const inv = await InvitationPrestataire.findOneAndUpdate(
      { _id: req.params.id, utiliseeLe: null, revoqueeLe: null }, { $set: { revoqueeLe: new Date() } }, { new: true });
    if (!inv) return res.status(404).json({ message: "Invitation introuvable, déjà utilisée ou révoquée." });
    res.json({ ok: true });
  } catch (err) {
    logger.error("revoquerInvitation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Admin : prestataires ────────────────────────────────────────────────────
export const listerPrestataires = async (_req, res) => {
  try {
    const prestataires = await Prestataire.find({}).populate("user", "firstName lastName email phone").sort({ createdAt: -1 }).lean();
    const ids = prestataires.map((p) => p.user?._id).filter(Boolean);
    const charges = await DossierImport.aggregate([
      { $match: { "prestataires.user": { $in: ids }, statut: "en_cours" } },
      { $unwind: "$prestataires" }, { $match: { "prestataires.user": { $in: ids } } },
      { $group: { _id: "$prestataires.user", n: { $sum: 1 } } },
    ]);
    const parUser = Object.fromEntries(charges.map((c) => [String(c._id), c.n]));
    res.json({ prestataires: prestataires.map((p) => ({ ...p, dossiersEnCours: parUser[String(p.user?._id)] || 0 })) });
  } catch (err) {
    logger.error("listerPrestataires:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const changerStatutPrestataire = async (req, res) => {
  try {
    const { statut } = req.body || {};
    if (!["actif", "suspendu"].includes(statut)) return res.status(400).json({ message: "Statut invalide." });
    const p = await Prestataire.findByIdAndUpdate(req.params.id, { $set: { statut } }, { new: true });
    if (!p) return res.status(404).json({ message: "Prestataire introuvable." });
    // Un compte suspendu ne peut plus se connecter.
    await User.updateOne({ _id: p.user }, { $set: { isActive: statut === "actif" } });
    res.json({ prestataire: p });
  } catch (err) {
    logger.error("changerStatutPrestataire:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Affecte (ou retire) un prestataire actif à un dossier d'import.
export const affecterPrestataire = async (req, res) => {
  try {
    const { prestataireUserId, retirer } = req.body || {};
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    if (retirer) {
      dossier.prestataires = dossier.prestataires.filter((p) => String(p.user) !== String(prestataireUserId));
    } else {
      const p = await Prestataire.findOne({ user: prestataireUserId, statut: "actif" }).lean();
      if (!p) return res.status(400).json({ message: "Prestataire introuvable ou suspendu." });
      if (!dossier.prestataires.some((x) => String(x.user) === String(prestataireUserId))) {
        dossier.prestataires.push({ user: p.user, type: p.types?.[0] || "transitaire" });
      }
    }
    await dossier.save();
    res.json({ dossier });
  } catch (err) {
    logger.error("affecterPrestataire:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Public : inscription par invitation ─────────────────────────────────────
async function invitationValide(jeton) {
  if (!jeton || String(jeton).length < 32) return null;
  return InvitationPrestataire.findOne({
    jetonHache: hacher(jeton), utiliseeLe: null, revoqueeLe: null, expireLe: { $gt: new Date() },
  });
}

export const lireInvitation = async (req, res) => {
  try {
    const inv = await invitationValide(req.params.jeton);
    if (!inv) return res.status(404).json({ message: "Invitation invalide, expirée ou déjà utilisée." });
    res.json({ email: inv.email, raisonSociale: inv.raisonSociale, types: inv.types });
  } catch (err) {
    logger.error("lireInvitation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const inscrirePrestataire = async (req, res) => {
  try {
    const { jeton, firstName, lastName, password, telephone } = req.body || {};
    const inv = await invitationValide(jeton);
    if (!inv) return res.status(404).json({ message: "Invitation invalide, expirée ou déjà utilisée." });
    const prenom = String(firstName || "").trim().slice(0, 100);
    const nom = String(lastName || "").trim().slice(0, 100);
    if (!prenom || !nom) return res.status(400).json({ message: "Prénom et nom requis." });
    if (!password || String(password).length < 8 || String(password).length > 128) {
      return res.status(400).json({ message: "Le mot de passe doit contenir entre 8 et 128 caractères." });
    }
    if (await User.exists({ email: inv.email })) return res.status(409).json({ message: "Un compte existe déjà avec cette adresse." });

    // L'invitation est consommée AVANT la création : deux envois simultanés du
    // même lien ne créent jamais deux comptes.
    const prise = await InvitationPrestataire.findOneAndUpdate(
      { _id: inv._id, utiliseeLe: null }, { $set: { utiliseeLe: new Date() } }, { new: true });
    if (!prise) return res.status(409).json({ message: "Invitation déjà utilisée." });

    const tel = String(telephone || "").trim().slice(0, 30) || null;
    const user = await User.create({
      firstName: prenom, lastName: nom, email: inv.email,
      password: await bcrypt.hash(String(password), PASSWORD_ROUNDS),
      role: "prestataire",
      // L'adresse est prouvée : le lien n'a pu être reçu que dans cette boîte.
      emailVerified: true,
    });
    await Prestataire.create({
      user: user._id, raisonSociale: inv.raisonSociale, types: inv.types,
      pays: inv.pays, ports: inv.ports, telephone: tel,
    });
    await InvitationPrestataire.updateOne({ _id: inv._id }, { $set: { compte: user._id } });
    res.status(201).json({ message: "Compte créé. Connectez-vous avec votre adresse e-mail.", email: inv.email });
  } catch (err) {
    logger.error("inscrirePrestataire:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Prestataire : ses dossiers ──────────────────────────────────────────────
function vuePrestataire(dossier) {
  const d = dossier.toObject ? dossier.toObject() : dossier;
  delete d.notesInternes;
  delete d.pack;
  delete d.devis;
  delete d.budget;
  d.historique = (d.historique || []).filter((h) => h.visibleClient !== false);
  return d;
}

async function dossierAffecte(req, res) {
  const dossier = await DossierImport.findOne({ _id: req.params.id, "prestataires.user": req.user._id })
    .populate("client", "firstName lastName phone");
  if (!dossier) { res.status(404).json({ message: "Dossier introuvable." }); return null; }
  return dossier;
}

export const mesDossiersTransit = async (req, res) => {
  try {
    const dossiers = await DossierImport.find({ "prestataires.user": req.user._id })
      .sort({ updatedAt: -1 }).limit(200).populate("client", "firstName lastName phone");
    res.json({ dossiers: dossiers.map(vuePrestataire), etapes: ETAPES_TRANSIT, documents: DOCUMENTS_TRANSIT });
  } catch (err) {
    logger.error("mesDossiersTransit:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const lireDossierTransit = async (req, res) => {
  try {
    const dossier = await dossierAffecte(req, res);
    if (!dossier) return;
    res.json({ dossier: vuePrestataire(dossier), etapes: ETAPES_TRANSIT, documents: DOCUMENTS_TRANSIT });
  } catch (err) {
    logger.error("lireDossierTransit:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Le prestataire fait avancer les étapes logistiques, jamais en arrière.
export const avancerEtapeTransit = async (req, res) => {
  try {
    const dossier = await dossierAffecte(req, res);
    if (!dossier) return;
    if (dossier.statut !== "en_cours") return res.status(400).json({ message: "Dossier clos." });
    const { etape, note } = req.body || {};
    if (!ETAPES_TRANSIT.includes(etape)) return res.status(400).json({ message: "Étape réservée à VIT AUTO." });
    if (rangEtape(etape) <= rangEtape(dossier.etape)) return res.status(400).json({ message: "Le dossier a déjà dépassé cette étape." });
    await avancerDossier(dossier, etape, { note: String(note || "").trim().slice(0, 1000), par: req.user._id });
    res.json({ dossier: vuePrestataire(dossier) });
  } catch (err) {
    logger.error("avancerEtapeTransit:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deposerDocumentTransit = async (req, res) => {
  try {
    const dossier = await dossierAffecte(req, res);
    if (!dossier) return;
    const { code } = req.params;
    if (!DOCUMENTS_TRANSIT.includes(code)) return res.status(400).json({ message: "Document réservé à VIT AUTO." });
    const { fichier } = req.body || {};
    const check = validateDocumentDataUri(fichier, MAX_DOC_BYTES);
    if (!fichier || !check.ok) return res.status(400).json({ message: check.message || "Joignez le fichier." });
    let doc = dossier.documents.find((d) => d.code === code);
    if (!doc) { dossier.documents.push({ code, libelle: code }); doc = dossier.documents[dossier.documents.length - 1]; }
    if (doc.statut === "valide") return res.status(400).json({ message: "Document déjà validé par VIT AUTO." });
    doc.url = await deposerPiece(fichier, `${FOLDERS.docs}/import/${dossier.reference}`, `${dossier.reference}-${code}`);
    doc.statut = "fourni";
    doc.deposePar = req.user._id;
    doc.deposeLe = new Date();
    await dossier.save();
    res.json({ dossier: vuePrestataire(dossier) });
  } catch (err) {
    logger.error("deposerDocumentTransit:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const majExpeditionTransit = async (req, res) => {
  try {
    const dossier = await dossierAffecte(req, res);
    if (!dossier) return;
    const b = req.body || {};
    for (const k of ["compagnie", "navire", "numeroConteneur", "numeroBL"]) {
      if (b[k] !== undefined) dossier.expedition[k] = String(b[k] || "").trim().slice(0, 80) || null;
    }
    if (b.mode !== undefined) dossier.expedition.mode = ["roro", "conteneur"].includes(b.mode) ? b.mode : null;
    for (const k of ["departLe", "arriveePrevueLe"]) {
      if (b[k] !== undefined) { const d = b[k] ? new Date(b[k]) : null; dossier.expedition[k] = d && !isNaN(d) ? d : null; }
    }
    await dossier.save();
    res.json({ dossier: vuePrestataire(dossier) });
  } catch (err) {
    logger.error("majExpeditionTransit:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
