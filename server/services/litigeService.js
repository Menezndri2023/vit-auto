import Litige, { MOTIFS_LITIGE, TRANSITIONS_LITIGE, ETATS_LITIGE_OUVERTS } from "../models/Litige.js";
import IETransaction from "../models/IETransaction.js";
import Notification from "../models/Notification.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { prochainNumero, formatReference } from "../utils/sequence.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { uploadDocument, signedDocumentUrl, FOLDERS } from "../config/imagekit.js";
import { partieDe, etatConditions } from "./conditionsLiberationService.js";

// ═══════════════════════════════════════════════════════════════════════════
// LITIGES (conception validée le 2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Un litige ne modifie JAMAIS le statut commercial, le règlement direct, un
// paiement ni la logistique : la transaction n'est touchée que pour pointer
// vers le litige en cours. Ouvert, il interdit à VIT AUTO de DEMANDER une
// libération (liberationDemandable) — règle de la plateforme, pas un blocage
// de fonds, et aucun texte ne le présente ainsi. Aucune décision financière
// automatique : l'issue est une décision écrite de l'équipe.

export class LitigeError extends Error {
  constructor(status, message, code = null) { super(message); this.status = status; this.code = code; }
}

// Après l'acceptation de l'offre, y compris après livraison ou règlement.
// « disputed » (ancien mécanisme) et « cancelled » exclus.
const STATUTS_OUVRABLES = ["offer_accepted", "payment_pending", "payment_submitted", "in_escrow", "preparing", "shipped", "in_transit", "delivered", "funds_released", "completed"];
const MAX_PIECE_OCTETS = 8 * 1024 * 1024;
const MAX_PIECES = 20;
const DOSSIER_PIECES = `${FOLDERS.docs}/litiges`;

const notifier = async (userId, titre, message, lien) => {
  if (!userId) return;
  const notif = await Notification.create({ user: userId, type: "ie_dispute", titre, message, lien }).catch(() => null);
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", { _id: notif._id, type: "ie_dispute", titre, message, lien, lu: false, createdAt: notif.createdAt });
  }
};

// VIT AUTO détient-elle des fonds de cette transaction ? (ancien séquestre
// uniquement : payé chez VIT AUTO et pas encore reversé). Sinon, les textes
// disent qu'elle ne les détient pas et ne peut pas les récupérer.
const fondsDetenusParVitAuto = (tx) => !!(tx.payment?.paidAt && !tx.payment?.releasedAt);
const fondsLiberes = (tx) => !!(tx.payment?.releasedAt || tx.status === "funds_released" || tx.reglementDirect?.etat === "payment_confirmed" || tx.reglementDirect?.confirmeParExportateurLe);

export async function litigeOuvertPour(txId) {
  return Litige.findOne({ "transaction.type": "ie", "transaction.id": txId, ouvert: true });
}

/** VIT AUTO peut-elle DEMANDER une libération ? Non si un litige est ouvert. */
export async function liberationDemandable(txId) {
  const ouvert = await litigeOuvertPour(txId);
  return ouvert ? { ok: false, raison: `Litige ${ouvert.reference} ouvert : VIT AUTO ne demande pas de libération tant qu'il n'est pas clos.` } : { ok: true };
}

export async function ouvrirLitige(tx, user, { motif, description } = {}) {
  const partie = partieDe(tx, user);
  if (!partie) throw new LitigeError(403, "Accès refusé.");
  if (!STATUTS_OUVRABLES.includes(tx.status)) throw new LitigeError(409, "Une réclamation peut être ouverte après l'acceptation de l'offre, sur une transaction non annulée.");
  if (!MOTIFS_LITIGE.includes(motif)) throw new LitigeError(400, "Motif de réclamation inconnu.");
  const desc = String(description || "").trim();
  if (desc.length < 10) throw new LitigeError(400, "Décrivez le problème (10 caractères au moins).");
  // Contrôle explicite ; l'index unique partiel reste le filet contre deux ouvertures simultanées.
  if (await litigeOuvertPour(tx._id)) throw new LitigeError(409, "Une réclamation est déjà en cours sur cette transaction.", "LITIGE_DEJA_OUVERT");

  // Échéance de réponse : seulement si les DEUX parties ont accepté un délai.
  const cond = await etatConditions(tx._id);
  const delai = cond.accepteeParLesDeux ? cond.courante?.contenu?.delaiReponseLitigeJours : null;
  const maintenant = new Date();
  const annee = maintenant.getFullYear();
  const numero = await prochainNumero(`litige-${annee}`, () => Litige.countDocuments({ reference: new RegExp(`^VA-LIT-${annee}-`) }));

  let litige;
  try {
    litige = await Litige.create({
      reference: formatReference("VA-LIT", annee, numero),
      transaction: { type: "ie", id: tx._id },
      ouvertPar: user._id, partieOuvrante: partie, motif, description: desc.slice(0, 4000), ouvertLe: maintenant,
      echeanceReponse: delai != null ? new Date(maintenant.getTime() + delai * 86400000) : null,
      conditions: cond.accepteeParLesDeux ? { id: cond.courante._id, version: cond.courante.version } : {},
      contexte: { statutCommercial: tx.status, reglementDirect: tx.reglementDirect?.etat || null, fondsLiberes: fondsLiberes(tx) },
      actions: [{ qui: user._id, quoi: "ouverture", vers: "opened" }],
    });
  } catch (err) {
    if (err?.code === 11000) throw new LitigeError(409, "Une réclamation est déjà en cours sur cette transaction.", "LITIGE_DEJA_OUVERT");
    throw err;
  }

  // Seul lien posé sur la transaction : AUCUN autre champ n'est modifié.
  await IETransaction.updateOne({ _id: tx._id }, {
    $set: { litigeEnCours: litige._id },
    $push: { statusHistory: { status: tx.status, changedAt: maintenant, changedBy: user._id, note: `Réclamation ${litige.reference} ouverte (statut inchangé).` } },
  });

  const mentionFonds = fondsDetenusParVitAuto(tx) ? "" : " VIT AUTO ne détient pas les fonds de cette transaction et ne peut pas les récupérer.";
  const lien = `/import-export/transaction/${tx._id}`;
  const autre = partie === "acheteur" ? tx.partner : partie === "vendeur" ? tx.client : null;
  if (partie === "admin") {
    await notifier(tx.client, "Réclamation ouverte", `L'équipe VIT AUTO a ouvert la réclamation ${litige.reference}.${mentionFonds}`, lien);
    await notifier(tx.partner, "Réclamation ouverte", `L'équipe VIT AUTO a ouvert la réclamation ${litige.reference}.${mentionFonds}`, lien);
  } else {
    await notifier(autre, "Réclamation ouverte", `Une réclamation (${litige.reference}) a été ouverte sur la transaction. L'équipe VIT AUTO l'instruit avec les deux parties.${mentionFonds}`, lien);
  }
  await notifyAdmins("ie_dispute", "⚖️ Réclamation ouverte", `${litige.reference} — transaction ${referenceCourte(tx)} (${motif}).`, "/admin?tab=litiges").catch(() => {});
  return litige;
}

const referenceCourte = (tx) => String(tx._id).slice(-8).toUpperCase();

async function chargerPourPartie(litigeId, user) {
  const litige = await Litige.findById(litigeId);
  if (!litige) throw new LitigeError(404, "Réclamation introuvable.");
  const tx = await IETransaction.findById(litige.transaction.id).select("client partner status");
  const partie = tx ? partieDe(tx, user) : (user?.role === "admin" ? "admin" : null);
  if (!partie) throw new LitigeError(403, "Accès refusé.");
  return { litige, tx, partie };
}

export async function ajouterMessage(litigeId, user, texte) {
  const { litige, tx, partie } = await chargerPourPartie(litigeId, user);
  if (litige.etat === "closed") throw new LitigeError(409, "Réclamation close.");
  const t = String(texte || "").trim();
  if (!t) throw new LitigeError(400, "Message vide.");
  const maj = await Litige.findOneAndUpdate({ _id: litige._id, etat: { $ne: "closed" } },
    { $push: { messages: { auteur: user._id, partie, texte: t.slice(0, 4000) } } }, { new: true });
  if (!maj) throw new LitigeError(409, "Réclamation close.");
  const destinataires = partie === "acheteur" ? [tx?.partner] : partie === "vendeur" ? [tx?.client] : [tx?.client, tx?.partner];
  for (const d of destinataires) await notifier(d, "Réclamation : nouveau message", `Nouveau message sur la réclamation ${litige.reference}.`, `/import-export/transaction/${litige.transaction.id}`);
  return maj;
}

export async function ajouterPiece(litigeId, user, { nom, fichier } = {}) {
  const { litige, partie } = await chargerPourPartie(litigeId, user);
  if (litige.etat === "closed") throw new LitigeError(409, "Réclamation close.");
  if (litige.pieces.length >= MAX_PIECES) throw new LitigeError(409, `${MAX_PIECES} pièces au plus par réclamation.`);
  if (!fichier) throw new LitigeError(400, "Joignez un fichier (image ou PDF).");
  const check = validateDocumentDataUri(fichier, MAX_PIECE_OCTETS);
  if (!check.ok) throw new LitigeError(400, check.message);
  const envoi = await uploadDocument(fichier, DOSSIER_PIECES, `${litige.reference}_${Date.now()}`);
  if (!envoi?.url) throw new LitigeError(503, "Dépôt de pièce indisponible pour le moment, réessayez plus tard.", "DEPOT_INDISPONIBLE");
  const maj = await Litige.findOneAndUpdate({ _id: litige._id, etat: { $ne: "closed" } },
    { $push: { pieces: { nom: String(nom || "Pièce").trim().slice(0, 200), url: envoi.url, type: check.detectedType || null, deposePar: user._id, partie } } }, { new: true });
  if (!maj) throw new LitigeError(409, "Réclamation close.");
  return maj;
}

/** Instruction par l'admin : transitions de TRANSITIONS_LITIGE uniquement. */
export async function changerEtat(litigeId, admin, vers, { note, decision, justification } = {}) {
  if (admin?.role !== "admin") throw new LitigeError(403, "Réservé à l'équipe VIT AUTO.");
  const litige = await Litige.findById(litigeId);
  if (!litige) throw new LitigeError(404, "Réclamation introuvable.");
  const de = litige.etat;
  if (!TRANSITIONS_LITIGE[de]?.includes(vers)) throw new LitigeError(409, `Passage de « ${de} » à « ${vers} » impossible.`, "TRANSITION_INTERDITE");
  const $set = { etat: vers, ouvert: ETATS_LITIGE_OUVERTS.includes(vers) };
  if (vers === "resolved" || vers === "rejected") {
    const d = String(decision || "").trim(); const j = String(justification || "").trim();
    if (!d || !j) throw new LitigeError(400, "Décision et justification sont obligatoires.");
    Object.assign($set, { "issue.decision": d.slice(0, 2000), "issue.justification": j.slice(0, 4000), "issue.decidePar": admin._id, "issue.le": new Date() });
  }
  if (vers === "closed") $set.clotureLe = new Date();
  // Filtre sur l'état source : deux admins simultanés ne s'écrasent pas.
  const maj = await Litige.findOneAndUpdate({ _id: litige._id, etat: de },
    { $set, $push: { actions: { qui: admin._id, quoi: "transition", de, vers, note: note ? String(note).slice(0, 2000) : null } } }, { new: true, runValidators: true });
  if (!maj) throw new LitigeError(409, "La réclamation vient d'être modifiée : rechargez.");
  if (vers === "closed") await IETransaction.updateOne({ _id: litige.transaction.id, litigeEnCours: litige._id }, { $set: { litigeEnCours: null } });

  const tx = await IETransaction.findById(litige.transaction.id).select("client partner");
  const libelles = { evidence_requested: "pièces demandées", under_review: "en cours d'examen", resolved: "décision rendue", rejected: "réclamation rejetée", closed: "close" };
  for (const d of [tx?.client, tx?.partner]) {
    await notifier(d, "Réclamation : mise à jour", `Réclamation ${litige.reference} : ${libelles[vers] || vers}.`, `/import-export/transaction/${litige.transaction.id}`);
  }
  return maj;
}

/** Litiges d'une transaction, pièces lisibles par URL signée (jamais stockée). */
export async function litigesDeTransaction(tx, user) {
  if (!partieDe(tx, user)) throw new LitigeError(403, "Accès refusé.");
  const litiges = await Litige.find({ "transaction.type": "ie", "transaction.id": tx._id }).sort({ ouvertLe: -1 }).lean();
  return litiges.map((l) => ({ ...l, pieces: l.pieces.map((p) => ({ ...p, url: signedDocumentUrl(p.url) })) }));
}
