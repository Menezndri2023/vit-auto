import DossierImport from "../models/DossierImport.js";
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { deposerPiece } from "../utils/deposerPiece.js";
import { FOLDERS } from "../config/imagekit.js";
import { avancerDossier, prevenirClient } from "../services/dossierImportService.js";
import {
  CODES_ETAPES, CODES_DOCUMENTS, PACKS, codesOrigines, codesDestinations, PORTS, libelleEtape,
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
  res.json({ origines: codesOrigines(), destinations: codesDestinations(), ports: PORTS, etapes: CODES_ETAPES.map((c) => ({ code: c, libelle: libelleEtape(c) })), packs: PACKS });
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
        .map((l) => ({ libelle: texte(l.libelle, 120), montant: Math.round(Number(l.montant) * 100) / 100 }))
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
