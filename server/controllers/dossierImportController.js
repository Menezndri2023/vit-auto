import DossierImport from "../models/DossierImport.js";
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { deposerPiece } from "../utils/deposerPiece.js";
import { FOLDERS } from "../config/imagekit.js";
import { avancerDossier, prevenirClient, bloqueParInspection, MESSAGE_NON_CONFORME, CLES_DEVIS, poserLigneDevis } from "../services/dossierImportService.js";
import Prestataire from "../models/Prestataire.js";
import {
  CODES_ETAPES, CODES_DOCUMENTS, PACKS, codesOrigines, codesDestinations, PORTS, libelleEtape,
  FORMULES_INSPECTION, prixInspection, GARANTIES_ASSURANCE,
  primeIndicative, DUREES_FINANCEMENT, SITUATIONS_PRO, mensualite,
} from "../constants/dossierImport.js";

const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 Mo, comme les documents d'export
const estAdmin = (req) => req.user?.role === "admin";

// Ce que le client voit de son dossier : ni les notes internes, ni les étapes
// marquées non visibles par l'admin.
function vueClient(dossier) {
  const d = dossier.toObject ? dossier.toObject() : dossier;
  delete d.notesInternes;
  delete d.prestataires;
  d.historique = (d.historique || []).filter((h) => h.visibleClient !== false);
  return d;
}

async function chargerPourLecture(req, res) {
  const dossier = await DossierImport.findById(req.params.id)
    .populate("client", "firstName lastName email phone")
    .populate("conseiller", "firstName lastName email phone")
    .populate("prestataires.user", "firstName lastName email");
  if (!dossier) { res.status(404).json({ message: "Dossier introuvable." }); return null; }
  const proprietaire = String(dossier.client?._id || dossier.client) === String(req.user._id);
  if (!proprietaire && !estAdmin(req)) { res.status(403).json({ message: "Accès refusé." }); return null; }
  return dossier;
}

// ── Client ──────────────────────────────────────────────────────────────────
export const mesDossiers = async (req, res) => {
  try {
    const dossiers = await DossierImport.find({ client: req.user._id }).sort({ updatedAt: -1 }).limit(100);
    res.json({ dossiers: dossiers.map(vueClient) });
  } catch (err) {
    logger.error("mesDossiers:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const lireDossier = async (req, res) => {
  try {
    const dossier = await chargerPourLecture(req, res);
    if (!dossier) return;
    res.json({ dossier: estAdmin(req) ? dossier : vueClient(dossier) });
  } catch (err) {
    logger.error("lireDossier:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Le client déclare avoir réglé ses frais d'accompagnement (paiement en ligne
// fermé) ; l'admin confirme à réception.
export const declarerReglementPack = async (req, res) => {
  try {
    const dossier = await DossierImport.findOne({ _id: req.params.id, client: req.user._id });
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    if (!["a_regler", "declare"].includes(dossier.pack?.statut)) {
      return res.status(400).json({ message: "Aucun règlement attendu sur ce dossier." });
    }
    const reference = String(req.body?.reference || "").trim().slice(0, 120);
    if (!reference) return res.status(400).json({ message: "Indiquez la référence de votre virement ou paiement." });
    dossier.pack.statut = "declare";
    dossier.pack.referenceReglement = reference;
    dossier.pack.declareLe = new Date();
    await dossier.save();
    notifyAdmins("ie_request", "💳 Règlement d'accompagnement déclaré",
      `${dossier.reference} — référence ${reference}. À confirmer à réception.`, "/admin?tab=dossiers_import").catch(() => {});
    res.json({ dossier: vueClient(dossier) });
  } catch (err) {
    logger.error("declarerReglementPack:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Admin ───────────────────────────────────────────────────────────────────
export const listerDossiers = async (req, res) => {
  try {
    const filtre = {};
    const { statut, etape, destination, q } = req.query;
    if (statut) filtre.statut = String(statut);
    if (etape && CODES_ETAPES.includes(etape)) filtre.etape = etape;
    if (destination) filtre["destination.pays"] = String(destination).toUpperCase();
    if (q) {
      const motif = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60), "i");
      filtre.$or = [{ reference: motif }, { "vehicule.titre": motif }, { "vehicule.marque": motif }];
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const [dossiers, total] = await Promise.all([
      DossierImport.find(filtre).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)
        .select("-notesInternes -historique")
        .populate("client", "firstName lastName email phone")
        .populate("conseiller", "firstName lastName"),
      DossierImport.countDocuments(filtre),
    ]);
    res.json({ dossiers, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("listerDossiers:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Référentiel pour les formulaires (trajets, ports, étapes, packs).
export const referentiel = (_req, res) => {
  res.json({ origines: codesOrigines(), destinations: codesDestinations(), ports: PORTS, etapes: CODES_ETAPES.map((c) => ({ code: c, libelle: libelleEtape(c) })), packs: PACKS,
    formulesInspection: FORMULES_INSPECTION, garanties: GARANTIES_ASSURANCE, dureesFinancement: DUREES_FINANCEMENT });
};

const texte = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);
const dateOuNull = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };

export const modifierDossier = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    const b = req.body || {};
    if (b.origine) {
      if (b.origine.pays !== undefined) {
        const p = texte(b.origine.pays, 2)?.toUpperCase() || null;
        if (p && !codesOrigines().includes(p)) return res.status(400).json({ message: "Pays d'origine hors des trajets ouverts." });
        dossier.origine.pays = p;
      }
      if (b.origine.port !== undefined) dossier.origine.port = texte(b.origine.port, 10);
    }
    if (b.destination) {
      if (b.destination.pays !== undefined) {
        const p = texte(b.destination.pays, 2)?.toUpperCase() || null;
        if (p && !codesDestinations().includes(p)) return res.status(400).json({ message: "Pays de destination hors des trajets ouverts." });
        dossier.destination.pays = p;
      }
      if (b.destination.ville !== undefined) dossier.destination.ville = texte(b.destination.ville, 80);
      if (b.destination.port !== undefined) dossier.destination.port = texte(b.destination.port, 10);
    }
    if (b.vehicule) {
      for (const k of ["titre", "type", "marque", "modele", "vin"]) if (b.vehicule[k] !== undefined) dossier.vehicule[k] = texte(b.vehicule[k], 120);
      if (b.vehicule.annee !== undefined) dossier.vehicule.annee = Number(b.vehicule.annee) || null;
    }
    if (b.expedition) {
      for (const k of ["compagnie", "navire", "numeroConteneur", "numeroBL"]) if (b.expedition[k] !== undefined) dossier.expedition[k] = texte(b.expedition[k], 80);
      if (b.expedition.mode !== undefined) dossier.expedition.mode = ["roro", "conteneur"].includes(b.expedition.mode) ? b.expedition.mode : null;
      if (b.expedition.departLe !== undefined) dossier.expedition.departLe = dateOuNull(b.expedition.departLe);
      if (b.expedition.arriveePrevueLe !== undefined) dossier.expedition.arriveePrevueLe = dateOuNull(b.expedition.arriveePrevueLe);
    }
    if (b.conseiller !== undefined) {
      if (b.conseiller) {
        const admin = await User.findOne({ _id: b.conseiller, role: "admin" }).select("_id");
        if (!admin) return res.status(400).json({ message: "Conseiller introuvable (doit être un administrateur)." });
        dossier.conseiller = admin._id;
      } else dossier.conseiller = null;
    }
    if (b.pack) {
      if (b.pack.code !== undefined) {
        if (b.pack.code && !PACKS[b.pack.code]) return res.status(400).json({ message: "Pack inconnu." });
        dossier.pack.code = b.pack.code || null;
        if (b.pack.prix === undefined && b.pack.code) dossier.pack.prix = PACKS[b.pack.code].prix;
      }
      if (b.pack.prix !== undefined) dossier.pack.prix = b.pack.prix == null ? null : Math.max(0, Number(b.pack.prix) || 0);
    }
    if (Array.isArray(b.devis?.lignes)) {
      const lignes = b.devis.lignes
        .map((l) => ({ libelle: texte(l.libelle, 120), montant: Math.round(Number(l.montant) * 100) / 100, cle: CLES_DEVIS.includes(l.cle) ? l.cle : null }))
        .filter((l) => l.libelle && Number.isFinite(l.montant));
      dossier.devis.lignes = lignes;
      dossier.devis.total = Math.round(lignes.reduce((s, l) => s + l.montant, 0) * 100) / 100;
      if (b.devis.devise) dossier.devis.devise = texte(b.devis.devise, 3).toUpperCase();
    }
    await dossier.save();
    res.json({ dossier });
  } catch (err) {
    logger.error("modifierDossier:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const changerEtape = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    if (dossier.statut === "annule") return res.status(400).json({ message: "Dossier annulé." });
    const { etape, note, visibleClient = true } = req.body || {};
    if (!CODES_ETAPES.includes(etape)) return res.status(400).json({ message: "Étape inconnue." });
    if (etape === "devis_envoye" && !dossier.devis?.lignes?.length) {
      return res.status(400).json({ message: "Rédigez d'abord le devis (au moins une ligne)." });
    }
    if (bloqueParInspection(dossier, etape)) return res.status(409).json({ message: MESSAGE_NON_CONFORME });
    if (etape === "devis_envoye") dossier.devis.envoyeLe = new Date();
    await avancerDossier(dossier, etape, { note: texte(note, 1000) || "", visibleClient: visibleClient !== false, par: req.user._id });
    res.json({ dossier });
  } catch (err) {
    logger.error("changerEtape:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const confirmerPack = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    const { statut } = req.body || {};
    if (!["regle", "offert", "a_regler"].includes(statut)) return res.status(400).json({ message: "Statut de règlement invalide." });
    dossier.pack.statut = statut;
    dossier.pack.regleLe = statut === "regle" ? new Date() : null;
    await dossier.save();
    if (statut === "regle" && dossier.etape !== "pack_regle") {
      await avancerDossier(dossier, "pack_regle", { note: "Frais d'accompagnement reçus — votre conseiller lance les recherches.", par: req.user._id });
    }
    res.json({ dossier });
  } catch (err) {
    logger.error("confirmerPack:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deposerDocument = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    const { code } = req.params;
    if (!CODES_DOCUMENTS.includes(code)) return res.status(400).json({ message: "Document inconnu." });
    let doc = dossier.documents.find((d) => d.code === code);
    if (!doc) {
      dossier.documents.push({ code, libelle: code, statut: "a_fournir" });
      doc = dossier.documents[dossier.documents.length - 1];
    }
    const { fichier, statut, note } = req.body || {};
    if (fichier) {
      const check = validateDocumentDataUri(fichier, MAX_DOC_BYTES);
      if (!check.ok) return res.status(400).json({ message: check.message });
      doc.url = await deposerPiece(fichier, `${FOLDERS.docs}/import/${dossier.reference}`, `${dossier.reference}-${code}`);
      doc.deposePar = req.user._id;
      doc.deposeLe = new Date();
      if (!statut) doc.statut = "fourni";
    }
    if (statut) {
      if (!["a_fournir", "fourni", "valide", "refuse", "non_requis"].includes(statut)) return res.status(400).json({ message: "Statut de document invalide." });
      if (["fourni", "valide"].includes(statut) && !doc.url) return res.status(400).json({ message: "Joignez le fichier avant de le marquer fourni ou validé." });
      doc.statut = statut;
    }
    if (note !== undefined) doc.note = texte(note, 500) || "";
    await dossier.save();
    res.json({ dossier });
  } catch (err) {
    logger.error("deposerDocument:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const ajouterNote = async (req, res) => {
  try {
    const t = texte(req.body?.texte, 2000);
    if (!t) return res.status(400).json({ message: "Note vide." });
    const dossier = await DossierImport.findByIdAndUpdate(req.params.id,
      { $push: { notesInternes: { texte: t, par: req.user._id, date: new Date() } } }, { new: true });
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    res.json({ dossier });
  } catch (err) {
    logger.error("ajouterNote:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const annulerDossier = async (req, res) => {
  try {
    const motif = texte(req.body?.motif, 500);
    if (!motif) return res.status(400).json({ message: "Indiquez le motif de l'annulation." });
    const dossier = await DossierImport.findOneAndUpdate({ _id: req.params.id, statut: "en_cours" },
      { $set: { statut: "annule", motifAnnulation: motif } }, { new: true });
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable ou déjà clos." });
    await prevenirClient(dossier, `Import ${dossier.reference} annulé`, motif);
    res.json({ dossier });
  } catch (err) {
    logger.error("annulerDossier:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Étape 3 (2026-10-09) : inspection indépendante, assurance transport,
// financement. Le client demande, VIT AUTO instruit ; rien n'est payé en ligne.
// ════════════════════════════════════════════════════════════════════════════
const montant = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n > 0 ? n : null; };
const dossierClient = (req) => DossierImport.findOne({ _id: req.params.id, client: req.user._id, statut: "en_cours" });
const prevenirAdmins = (titre, message) =>
  notifyAdmins("ie_request", titre, message, "/admin?tab=dossiers_import").catch(() => {});

function demanderInspectionSur(dossier, formule) {
  const prix = prixInspection(formule, dossier.pack?.code);
  dossier.inspection.statut = "demandee";
  dossier.inspection.formule = formule;
  dossier.inspection.prix = prix;
  dossier.inspection.demandeeLe = new Date();
  dossier.inspection.verdict = null;
  dossier.inspection.realiseeLe = null;
  dossier.inspection.points = [];
  dossier.inspection.synthese = "";
  poserLigneDevis(dossier, "inspection", `${FORMULES_INSPECTION[formule].libelle}${prix === 0 ? " (incluse dans le pack)" : ""}`, prix);
}

// ── Client ──────────────────────────────────────────────────────────────────
export const demanderInspection = async (req, res) => {
  try {
    const dossier = await dossierClient(req);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable ou clos." });
    const { formule } = req.body || {};
    if (!FORMULES_INSPECTION[formule]) return res.status(400).json({ message: "Formule d'inspection inconnue." });
    if (dossier.inspection?.statut === "demandee") return res.status(409).json({ message: "Une inspection est déjà demandée." });
    if (dossier.inspection?.statut === "realisee" && dossier.inspection.verdict !== "non_conforme") {
      return res.status(409).json({ message: "Le véhicule a déjà été inspecté." });
    }
    demanderInspectionSur(dossier, formule);
    await dossier.save();
    prevenirAdmins("🛠️ Inspection demandée", `${dossier.reference} — ${FORMULES_INSPECTION[formule].libelle}. Affectez un inspecteur de la zone Transit.`);
    res.json({ dossier: vueClient(dossier) });
  } catch (err) {
    logger.error("demanderInspection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const demanderAssurance = async (req, res) => {
  try {
    const dossier = await dossierClient(req);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable ou clos." });
    const { garantie } = req.body || {};
    const valeur = montant(req.body?.valeur);
    if (!GARANTIES_ASSURANCE[garantie]) return res.status(400).json({ message: "Garantie inconnue." });
    if (!valeur) return res.status(400).json({ message: "Indiquez la valeur du véhicule à assurer." });
    if (["acceptee", "souscrite"].includes(dossier.assurance?.statut)) return res.status(409).json({ message: "L'assurance est déjà engagée sur ce dossier." });
    Object.assign(dossier.assurance, {
      statut: "demandee", garantie, valeurAssuree: valeur, prime: null, assureur: null,
      devise: dossier.devis?.devise || "USD", demandeeLe: new Date(), proposeeLe: null,
    });
    await dossier.save();
    prevenirAdmins("🛡️ Assurance transport demandée", `${dossier.reference} — ${GARANTIES_ASSURANCE[garantie].libelle}, valeur ${valeur}. Prime indicative : ${primeIndicative(valeur, garantie)}.`);
    res.json({ dossier: vueClient(dossier) });
  } catch (err) {
    logger.error("demanderAssurance:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const accepterAssurance = async (req, res) => {
  try {
    const dossier = await dossierClient(req);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable ou clos." });
    if (dossier.assurance?.statut !== "proposee") return res.status(400).json({ message: "Aucune proposition d'assurance en attente." });
    dossier.assurance.statut = "acceptee";
    dossier.assurance.accepteeLe = new Date();
    poserLigneDevis(dossier, "assurance", `Assurance transport — ${GARANTIES_ASSURANCE[dossier.assurance.garantie]?.libelle || ""}`, dossier.assurance.prime);
    await dossier.save();
    prevenirAdmins("🛡️ Assurance acceptée", `${dossier.reference} — prime ${dossier.assurance.prime} ${dossier.assurance.devise}. À souscrire auprès de ${dossier.assurance.assureur || "l'assureur"}.`);
    res.json({ dossier: vueClient(dossier) });
  } catch (err) {
    logger.error("accepterAssurance:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const demanderFinancement = async (req, res) => {
  try {
    const dossier = await dossierClient(req);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable ou clos." });
    const b = req.body || {};
    const montantDemande = montant(b.montantDemande);
    const dureeMois = Number(b.dureeMois);
    if (!montantDemande) return res.status(400).json({ message: "Indiquez le montant à financer." });
    if (!DUREES_FINANCEMENT.includes(dureeMois)) return res.status(400).json({ message: "Durée de remboursement invalide." });
    if (!SITUATIONS_PRO.includes(b.situationPro)) return res.status(400).json({ message: "Indiquez votre situation professionnelle." });
    const revenus = montant(b.revenusMensuels);
    if (!revenus) return res.status(400).json({ message: "Indiquez vos revenus mensuels nets." });
    if (["demande", "en_etude", "accorde"].includes(dossier.financement?.statut)) return res.status(409).json({ message: "Une demande de financement est déjà en cours." });
    Object.assign(dossier.financement, {
      statut: "demande", montantDemande, dureeMois, revenusMensuels: revenus, situationPro: b.situationPro,
      apport: montant(b.apport) || 0, devise: dossier.devis?.devise || "USD", demandeLe: new Date(),
      organisme: null, montantAccorde: null, tauxAnnuel: null, mensualite: null, fraisDossier: null, note: "", decideLe: null,
    });
    await dossier.save();
    prevenirAdmins("🏦 Demande de financement", `${dossier.reference} — ${montantDemande} ${dossier.financement.devise} sur ${dureeMois} mois.`);
    res.json({ dossier: vueClient(dossier) });
  } catch (err) {
    logger.error("demanderFinancement:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const annulerFinancement = async (req, res) => {
  try {
    const dossier = await dossierClient(req);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable ou clos." });
    if (!["demande", "en_etude", "accorde"].includes(dossier.financement?.statut)) return res.status(400).json({ message: "Aucun financement en cours." });
    dossier.financement.statut = "annule";
    await dossier.save();
    prevenirAdmins("🏦 Financement retiré par le client", dossier.reference);
    res.json({ dossier: vueClient(dossier) });
  } catch (err) {
    logger.error("annulerFinancement:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Admin ───────────────────────────────────────────────────────────────────
// Affecte l'inspecteur (prestataire actif de type « inspecteur ») ; demande
// l'inspection si le client ne l'a pas fait, ou en relance une nouvelle après
// un verdict « non conforme ».
export const piloterInspection = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    if (dossier.statut !== "en_cours") return res.status(400).json({ message: "Dossier clos." });
    const { formule, inspecteur, nouvelle } = req.body || {};
    if (formule !== undefined && !FORMULES_INSPECTION[formule]) return res.status(400).json({ message: "Formule d'inspection inconnue." });
    const aDemander = dossier.inspection.statut === "non_demandee" || (nouvelle && dossier.inspection.statut === "realisee");
    if (aDemander || (formule && formule !== dossier.inspection.formule && dossier.inspection.statut === "demandee")) {
      const f = formule || dossier.inspection.formule;
      if (!f) return res.status(400).json({ message: "Choisissez la formule d'inspection." });
      demanderInspectionSur(dossier, f);
    }
    if (inspecteur !== undefined) {
      if (dossier.inspection.statut !== "demandee") return res.status(400).json({ message: "L'inspection est déjà réalisée : relancez-en une nouvelle d'abord." });
      if (inspecteur) {
        const profil = await Prestataire.findOne({ user: inspecteur, statut: "actif", types: "inspecteur" }).select("user");
        if (!profil) return res.status(400).json({ message: "Choisissez un prestataire actif de la zone Transit, de métier « inspecteur »." });
        dossier.inspection.inspecteur = profil.user;
        if (!dossier.prestataires.some((p) => String(p.user) === String(profil.user))) {
          dossier.prestataires.push({ user: profil.user, type: "inspecteur", affecteLe: new Date() });
        }
      } else dossier.inspection.inspecteur = null;
    }
    await dossier.save();
    await dossier.populate("prestataires.user", "firstName lastName email");
    res.json({ dossier });
  } catch (err) {
    logger.error("piloterInspection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const piloterAssurance = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    const b = req.body || {};
    const a = dossier.assurance;
    if (b.note !== undefined) a.note = texte(b.note, 1000) || "";
    if (b.statut === "proposee") {
      if (!["demandee", "proposee"].includes(a.statut)) return res.status(400).json({ message: "Aucune demande d'assurance à chiffrer." });
      const prime = montant(b.prime);
      if (!prime) return res.status(400).json({ message: "Indiquez la prime proposée par l'assureur." });
      a.prime = prime;
      a.assureur = texte(b.assureur, 120);
      a.statut = "proposee";
      a.proposeeLe = new Date();
      await dossier.save();
      await prevenirClient(dossier, `🛡️ Assurance transport — ${dossier.reference}`,
        `Proposition : ${prime} ${a.devise} (${GARANTIES_ASSURANCE[a.garantie]?.libelle || "assurance"}). Acceptez-la depuis votre dossier.`);
    } else if (b.statut === "souscrite") {
      if (a.statut !== "acceptee") return res.status(400).json({ message: "Le client n'a pas encore accepté la proposition." });
      const police = texte(b.numeroPolice, 80);
      if (!police) return res.status(400).json({ message: "Indiquez le numéro de police." });
      a.numeroPolice = police;
      a.statut = "souscrite";
      a.souscriteLe = new Date();
      await dossier.save();
      await prevenirClient(dossier, `🛡️ Véhicule assuré — ${dossier.reference}`, `Police n° ${police}. L'attestation sera jointe à vos documents.`);
    } else if (b.statut === "refusee") {
      if (a.statut === "souscrite") return res.status(400).json({ message: "Assurance déjà souscrite." });
      a.statut = "refusee";
      poserLigneDevis(dossier, "assurance", null, null);
      await dossier.save();
      await prevenirClient(dossier, `🛡️ Assurance transport — ${dossier.reference}`, a.note || "Votre demande d'assurance n'a pas pu aboutir ; votre conseiller vous propose une autre solution.");
    } else if (b.statut !== undefined) {
      return res.status(400).json({ message: "Statut d'assurance invalide." });
    } else await dossier.save();
    res.json({ dossier });
  } catch (err) {
    logger.error("piloterAssurance:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const piloterFinancement = async (req, res) => {
  try {
    const dossier = await DossierImport.findById(req.params.id);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable." });
    const b = req.body || {};
    const f = dossier.financement;
    if (!["demande", "en_etude", "accorde", "refuse"].includes(f.statut)) return res.status(400).json({ message: "Aucune demande de financement sur ce dossier." });
    if (b.note !== undefined) f.note = texte(b.note, 1000) || "";
    if (b.organisme !== undefined) f.organisme = texte(b.organisme, 120);
    if (b.statut === "en_etude") {
      f.statut = "en_etude";
      await dossier.save();
      await prevenirClient(dossier, `🏦 Financement — ${dossier.reference}`, "Votre demande de financement est à l'étude.");
    } else if (b.statut === "accorde") {
      const capital = montant(b.montantAccorde);
      const taux = Number(b.tauxAnnuel);
      const duree = Number(b.dureeMois ?? f.dureeMois);
      if (!capital) return res.status(400).json({ message: "Indiquez le montant accordé." });
      if (!Number.isFinite(taux) || taux < 0 || taux > 60) return res.status(400).json({ message: "Taux annuel invalide." });
      if (!DUREES_FINANCEMENT.includes(duree)) return res.status(400).json({ message: "Durée invalide." });
      Object.assign(f, {
        statut: "accorde", montantAccorde: capital, tauxAnnuel: taux, dureeMois: duree,
        mensualite: mensualite(capital, taux, duree), fraisDossier: b.fraisDossier == null ? f.fraisDossier : (montant(b.fraisDossier) || 0),
        decideLe: new Date(),
      });
      await dossier.save();
      await prevenirClient(dossier, `🏦 Financement accordé — ${dossier.reference}`,
        `${capital} ${f.devise} sur ${duree} mois, soit ${f.mensualite} ${f.devise} par mois${f.organisme ? ` (${f.organisme})` : ""}.`);
    } else if (b.statut === "refuse") {
      f.statut = "refuse";
      f.decideLe = new Date();
      await dossier.save();
      await prevenirClient(dossier, `🏦 Financement — ${dossier.reference}`, f.note || "Votre demande de financement n'a pas été acceptée ; votre conseiller vous recontacte.");
    } else if (b.statut !== undefined) {
      return res.status(400).json({ message: "Statut de financement invalide." });
    } else await dossier.save();
    res.json({ dossier });
  } catch (err) {
    logger.error("piloterFinancement:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
