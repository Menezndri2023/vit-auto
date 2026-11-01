import mongoose from "mongoose";
import IETransaction from "../models/IETransaction.js";
import Litige, { ETATS_LITIGE } from "../models/Litige.js";
import logger from "../utils/logger.js";
import { captureException } from "../config/sentry.js";
import Booking from "../models/Booking.js";
import DemandeLogistique from "../models/DemandeLogistique.js";
import {
  LitigeError, ouvrirLitige, ajouterMessage, ajouterPiece, changerEtat, litigesDeTransaction, litigesDeCible,
} from "../services/litigeService.js";
import { TYPES_CIBLE, cible, adminPeutInstruire } from "../services/litigeCibles.js";
import {
  ConditionsError, partieDe, proposerConditions, accepterConditions, etatConditions,
} from "../services/conditionsLiberationService.js";

// Litiges et conditions de libération des transactions Import/Export
// (conception validée le 2026-10-31, docs/import-export-paiement-securise.md).

const repondreErreur = (res, err, ou) => {
  if (err instanceof LitigeError || err instanceof ConditionsError) {
    return res.status(err.status).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  logger.error(`${ou}:`, err);
  captureException(err, { controller: `litigeController.${ou}` });
  return res.status(500).json({ message: "Erreur serveur." });
};

async function transactionAccessible(req) {
  const tx = await IETransaction.findById(req.params.id);
  if (!tx) throw new LitigeError(404, "Transaction introuvable.");
  if (!partieDe(tx, req.user)) throw new LitigeError(403, "Accès refusé.");
  return tx;
}

// ── Litiges ────────────────────────────────────────────────────────────────

// GET /api/import-export/transactions/:id/litiges
export const listerLitigesTransaction = async (req, res) => {
  try {
    const tx = await transactionAccessible(req);
    res.json({ litiges: await litigesDeTransaction(tx, req.user) });
  } catch (err) { repondreErreur(res, err, "listerLitigesTransaction"); }
};

// POST /api/import-export/transactions/:id/litiges  { motif, description }
export const ouvrir = async (req, res) => {
  try {
    const tx = await transactionAccessible(req);
    const litige = await ouvrirLitige(tx, req.user, req.body || {});
    res.status(201).json({ message: `Réclamation ${litige.reference} ouverte. L'équipe VIT AUTO l'instruit avec les deux parties.`, litige });
  } catch (err) { repondreErreur(res, err, "ouvrir"); }
};

// POST /api/import-export/litiges/:litigeId/messages  { texte }
export const message = async (req, res) => {
  try {
    res.json({ litige: await ajouterMessage(req.params.litigeId, req.user, req.body?.texte) });
  } catch (err) { repondreErreur(res, err, "message"); }
};

// POST /api/import-export/litiges/:litigeId/pieces  { nom, fichier (data URI image/PDF) }
export const piece = async (req, res) => {
  try {
    res.status(201).json({ litige: await ajouterPiece(req.params.litigeId, req.user, req.body || {}) });
  } catch (err) { repondreErreur(res, err, "piece"); }
};

// PATCH /api/import-export/litiges/:litigeId/etat  (admin)  { vers, note, decision, justification }
export const transition = async (req, res) => {
  try {
    const { vers, ...reste } = req.body || {};
    res.json({ litige: await changerEtat(req.params.litigeId, req.user, vers, reste) });
  } catch (err) { repondreErreur(res, err, "transition"); }
};

// GET /api/litiges/cible/:type/:id — réclamations d'une réservation, d'une
// demande logistique ou d'une transaction Import/Export (parties, admin du secteur).
export const listerLitigesCible = async (req, res) => {
  try {
    if (!TYPES_CIBLE.includes(req.params.type)) throw new LitigeError(400, "Type de transaction inconnu.");
    if (!mongoose.isValidObjectId(req.params.id)) throw new LitigeError(400, "Identifiant invalide.");
    res.json(await litigesDeCible(req.params.type, req.params.id, req.user));
  } catch (err) { repondreErreur(res, err, "listerLitigesCible"); }
};

// Référence lisible de chaque cible, pour la liste admin (une requête par type).
async function referencesCibles(litiges) {
  const ids = (type) => litiges.filter((l) => l.transaction?.type === type).map((l) => l.transaction.id);
  const [bookings, demandes] = await Promise.all([
    Booking.find({ _id: { $in: ids("reservation") } }).select("reference status").lean(),
    DemandeLogistique.find({ _id: { $in: ids("logistique") } }).select("reference statut").lean(),
  ]);
  const refs = new Map();
  for (const b of bookings) refs.set(String(b._id), { reference: b.reference, statut: b.status });
  for (const d of demandes) refs.set(String(d._id), { reference: d.reference, statut: d.statut });
  return litiges.map((l) => ({
    ...l,
    cible: {
      libelle: cible(l.transaction.type)?.libelle || l.transaction.type,
      ...(l.transaction.type === "ie" ? { reference: String(l.transaction.id).slice(-8).toUpperCase() } : refs.get(String(l.transaction.id)) || {}),
    },
  }));
}

// GET /api/litiges  et  GET /api/import-export/litiges  (admin)  ?etat=opened&type=reservation
// Un admin à accès assigné ne voit que les types de ses secteurs.
export const listerLitiges = async (req, res) => {
  try {
    const types = TYPES_CIBLE.filter((t) => adminPeutInstruire(req.user, t));
    if (req.query.type && !types.includes(req.query.type)) return res.status(400).json({ message: "Type inconnu ou hors de vos secteurs." });
    const filtre = { "transaction.type": req.query.type ? req.query.type : { $in: types } };
    if (req.query.etat) {
      if (!ETATS_LITIGE.includes(req.query.etat)) return res.status(400).json({ message: "État inconnu." });
      filtre.etat = req.query.etat;
    } else if (req.query.ouverts !== "0") {
      filtre.ouvert = true;
    }
    const litiges = await Litige.find(filtre).sort({ ouvertLe: -1 }).limit(200)
      .populate("ouvertPar", "firstName lastName").lean();
    res.json({ litiges: await referencesCibles(litiges) });
  } catch (err) { repondreErreur(res, err, "listerLitiges"); }
};

// ── Conditions de libération ───────────────────────────────────────────────

// GET /api/import-export/transactions/:id/conditions
export const lireConditions = async (req, res) => {
  try {
    const tx = await transactionAccessible(req);
    res.json(await etatConditions(tx._id));
  } catch (err) { repondreErreur(res, err, "lireConditions"); }
};

// POST /api/import-export/transactions/:id/conditions  (nouvelle version)
export const proposer = async (req, res) => {
  try {
    const tx = await transactionAccessible(req);
    const conditions = await proposerConditions(tx, req.user, req.body || {});
    res.status(201).json({ message: `Conditions version ${conditions.version} proposées : elles doivent être acceptées par l'acheteur et le vendeur.`, conditions });
  } catch (err) { repondreErreur(res, err, "proposer"); }
};

// POST /api/import-export/transactions/:id/conditions/accepter  { version, hash }
export const accepter = async (req, res) => {
  try {
    const tx = await transactionAccessible(req);
    const acceptation = await accepterConditions(tx, req.user, req.body || {});
    res.status(201).json({ message: `Version ${acceptation.version} acceptée.`, acceptation, ...(await etatConditions(tx._id)) });
  } catch (err) { repondreErreur(res, err, "accepter"); }
};

export const idLitigeValide = (req, res, next) =>
  (mongoose.isValidObjectId(req.params.litigeId) ? next() : res.status(400).json({ message: "Identifiant invalide." }));
