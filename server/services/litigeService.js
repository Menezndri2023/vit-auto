import Litige, { MOTIFS_LITIGE, TRANSITIONS_LITIGE, ETATS_LITIGE_OUVERTS } from "../models/Litige.js";
import IETransaction from "../models/IETransaction.js";
import Notification from "../models/Notification.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { prochainNumero, formatReference } from "../utils/sequence.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { uploadDocument, signedDocumentUrl, FOLDERS } from "../config/imagekit.js";
import { partieDe, etatConditions } from "./conditionsLiberationService.js";
import { cible, partieSur, adminPeutInstruire } from "./litigeCibles.js";

// ═══════════════════════════════════════════════════════════════════════════
// LITIGES (conception validée le 2026-10-31, étendue le 2026-11-01)
// ═══════════════════════════════════════════════════════════════════════════
// Un litige ne modifie JAMAIS le statut commercial, le règlement direct, un
// paiement ni la logistique : la transaction Import/Export n'est touchée que
// pour pointer vers le litige en cours. Ouvert, il interdit à VIT AUTO de
// DEMANDER une libération (liberationDemandable) — règle de la plateforme, pas
// un blocage de fonds, et aucun texte ne le présente ainsi. Aucune décision
// financière automatique : l'issue est une décision écrite de l'équipe.
//
// Réservations et demandes logistiques (2026-11-01) : même modèle, mêmes
// échanges, pièces et décisions. Leurs étapes existantes (« contestée » /
// « litige ») restent posées par leurs propres écrans ; la réclamation en est
// le dossier, clos par la décision de l'équipe (cloturerParDecision).

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

export async function litigeOuvertPour(txId, type = "ie") {
  return Litige.findOne({ "transaction.type": type, "transaction.id": txId, ouvert: true });
}

/** VIT AUTO peut-elle DEMANDER une libération ? Non si un litige est ouvert. */
export async function liberationDemandable(txId) {
  const ouvert = await litigeOuvertPour(txId);
  return ouvert ? { ok: false, raison: `Litige ${ouvert.reference} ouvert : VIT AUTO ne demande pas de libération tant qu'il n'est pas clos.` } : { ok: true };
}

// Notifie les parties d'une cible, chacune vers sa propre page.
async function notifierParties(type, objet, { sauf = null, titre, message }) {
  const c = cible(type);
  const parties = await c.parties(objet);
  const liens = c.lien(objet);
  for (const p of ["acheteur", "vendeur"]) {
    if (p !== sauf) await notifier(parties[p], titre, message, liens[p]);
  }
}

async function creer(type, objet, user, partie, { motif, description, ouvertLe, extra = {} }) {
  const maintenant = ouvertLe || new Date();
  const annee = maintenant.getFullYear();
  const numero = await prochainNumero(`litige-${annee}`, () => Litige.countDocuments({ reference: new RegExp(`^VA-LIT-${annee}-`) }));
  try {
    return await Litige.create({
      reference: formatReference("VA-LIT", annee, numero),
      transaction: { type, id: objet._id },
      ouvertPar: user._id, partieOuvrante: partie, motif, description: description.slice(0, 4000), ouvertLe: maintenant,
      actions: [{ qui: user._id, quoi: "ouverture", vers: "opened", le: maintenant }],
      ...extra,
    });
  } catch (err) {
    if (err?.code === 11000) throw new LitigeError(409, "Une réclamation est déjà en cours sur cette transaction.", "LITIGE_DEJA_OUVERT");
    throw err;
  }
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
  const litige = await creer("ie", tx, user, partie, {
    motif, description: desc, ouvertLe: maintenant,
    extra: {
      echeanceReponse: delai != null ? new Date(maintenant.getTime() + delai * 86400000) : null,
      conditions: cond.accepteeParLesDeux ? { id: cond.courante._id, version: cond.courante.version } : {},
      contexte: { statutCommercial: tx.status, reglementDirect: tx.reglementDirect?.etat || null, fondsLiberes: fondsLiberes(tx) },
    },
  });

  // Seul lien posé sur la transaction : AUCUN autre champ n'est modifié.
  await IETransaction.updateOne({ _id: tx._id }, {
    $set: { litigeEnCours: litige._id },
    $push: { statusHistory: { status: tx.status, changedAt: maintenant, changedBy: user._id, note: `Réclamation ${litige.reference} ouverte (statut inchangé).` } },
  });

  const mentionFonds = fondsDetenusParVitAuto(tx) ? "" : " VIT AUTO ne détient pas les fonds de cette transaction et ne peut pas les récupérer.";
  if (partie === "admin") {
    await notifierParties("ie", tx, { titre: "Réclamation ouverte", message: `L'équipe VIT AUTO a ouvert la réclamation ${litige.reference}.${mentionFonds}` });
  } else {
    await notifierParties("ie", tx, { sauf: partie, titre: "Réclamation ouverte", message: `Une réclamation (${litige.reference}) a été ouverte sur la transaction. L'équipe VIT AUTO l'instruit avec les deux parties.${mentionFonds}` });
  }
  await notifyAdmins("ie_dispute", "⚖️ Réclamation ouverte", `${litige.reference} — transaction ${cible("ie").reference(tx)} (${motif}).`, "/admin?tab=litiges").catch(() => {});
  return litige;
}

/**
 * Dossier de réclamation d'une réservation ou d'une demande logistique, ouvert
 * par l'écran existant (contestation d'une réservation, litige logistique) qui
 * a déjà vérifié l'étape. Les notifications restent celles de cet écran. Si une
 * réclamation est déjà ouverte, elle est rendue telle quelle (jamais de doublon).
 */
export async function ouvrirLitigeCible(type, objet, user, { motif = "autre", description, ouvertLe } = {}) {
  if (type === "ie") throw new LitigeError(400, "Utilisez ouvrirLitige pour l'Import/Export.");
  const partie = await partieSur(type, objet, user);
  if (!partie) throw new LitigeError(403, "Accès refusé.");
  const existant = await litigeOuvertPour(objet._id, type);
  if (existant) return existant;
  const desc = String(description || "").trim() || "Problème signalé sans détail.";
  try {
    return await creer(type, objet, user, partie, {
      motif: MOTIFS_LITIGE.includes(motif) ? motif : "autre", description: desc, ouvertLe,
      extra: { contexte: { statutCommercial: cible(type).statut(objet), reglementDirect: null, fondsLiberes: false } },
    });
  } catch (err) {
    // Deux ouvertures simultanées : l'index unique a tranché, on rend celle qui existe.
    if (err instanceof LitigeError && err.code === "LITIGE_DEJA_OUVERT") return litigeOuvertPour(objet._id, type);
    throw err;
  }
}

async function chargerPourPartie(litigeId, user) {
  const litige = await Litige.findById(litigeId);
  if (!litige) throw new LitigeError(404, "Réclamation introuvable.");
  const type = litige.transaction.type;
  const objet = await cible(type).charger(litige.transaction.id);
  let partie = objet ? await partieSur(type, objet, user) : (user?.role === "admin" ? "admin" : null);
  if (partie === "admin" && !adminPeutInstruire(user, type)) partie = null;
  if (!partie) throw new LitigeError(403, "Accès refusé.");
  return { litige, objet, partie, type };
}

// `notifier: false` quand l'écran appelant prévient déjà les intéressés.
export async function ajouterMessage(litigeId, user, texte, { notifier: prevenir = true } = {}) {
  const { litige, objet, partie, type } = await chargerPourPartie(litigeId, user);
  if (litige.etat === "closed") throw new LitigeError(409, "Réclamation close.");
  const t = String(texte || "").trim();
  if (!t) throw new LitigeError(400, "Message vide.");
  const maj = await Litige.findOneAndUpdate({ _id: litige._id, etat: { $ne: "closed" } },
    { $push: { messages: { auteur: user._id, partie, texte: t.slice(0, 4000) } } }, { new: true });
  if (!maj) throw new LitigeError(409, "Réclamation close.");
  if (!prevenir) return maj;
  if (objet) await notifierParties(type, objet, { sauf: partie, titre: "Réclamation : nouveau message", message: `Nouveau message sur la réclamation ${litige.reference}.` });
  if (partie !== "admin") await notifyAdmins("ie_dispute", "💬 Réclamation : nouveau message", `${litige.reference} — message de ${partie === "acheteur" ? "l'acheteur" : "le vendeur"}.`, "/admin?tab=litiges").catch(() => {});
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

const LIBELLES_ETAT = { evidence_requested: "pièces demandées", under_review: "en cours d'examen", resolved: "décision rendue", rejected: "réclamation rejetée", closed: "close" };

/** Instruction par l'admin : transitions de TRANSITIONS_LITIGE uniquement. */
export async function changerEtat(litigeId, admin, vers, { note, decision, justification } = {}) {
  if (admin?.role !== "admin") throw new LitigeError(403, "Réservé à l'équipe VIT AUTO.");
  const litige = await Litige.findById(litigeId);
  if (!litige) throw new LitigeError(404, "Réclamation introuvable.");
  const type = litige.transaction.type;
  if (!adminPeutInstruire(admin, type)) throw new LitigeError(403, "Ce secteur ne fait pas partie de vos accès.");
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
  if (vers === "closed" && type === "ie") await IETransaction.updateOne({ _id: litige.transaction.id, litigeEnCours: litige._id }, { $set: { litigeEnCours: null } });

  const objet = await cible(type).charger(litige.transaction.id);
  if (objet) await notifierParties(type, objet, { titre: "Réclamation : mise à jour", message: `Réclamation ${litige.reference} : ${LIBELLES_ETAT[vers] || vers}.` });
  return maj;
}

/**
 * Clôt la réclamation ouverte d'une réservation ou d'une demande logistique
 * quand l'équipe tranche depuis l'écran de cette cible (résolution de la
 * contestation, intervention logistique). La décision écrite y est recopiée ;
 * rien n'est fait s'il n'y a pas de réclamation ouverte.
 */
export async function cloturerParDecision(type, objetId, admin, { decision, justification }) {
  const litige = await litigeOuvertPour(objetId, type);
  if (!litige) return null;
  const maintenant = new Date();
  const $set = { etat: "closed", ouvert: false, clotureLe: maintenant };
  if (!litige.issue?.decision) {
    Object.assign($set, {
      "issue.decision": String(decision || "Décision de l'équipe VIT AUTO").slice(0, 2000),
      "issue.justification": String(justification || decision || "—").slice(0, 4000),
      "issue.decidePar": admin?._id || null, "issue.le": maintenant,
    });
  }
  return Litige.findOneAndUpdate({ _id: litige._id, ouvert: true },
    { $set, $push: { actions: { qui: admin?._id || null, quoi: "cloture_par_decision", de: litige.etat, vers: "closed", note: String(justification || "").slice(0, 2000) || null } } },
    { new: true });
}

const avecPiecesSignees = (l) => ({ ...l, pieces: l.pieces.map((p) => ({ ...p, url: signedDocumentUrl(p.url) })) });

/** Litiges d'une transaction Import/Export, pièces lisibles par URL signée (jamais stockée). */
export async function litigesDeTransaction(tx, user) {
  if (!partieDe(tx, user)) throw new LitigeError(403, "Accès refusé.");
  const litiges = await Litige.find({ "transaction.type": "ie", "transaction.id": tx._id }).sort({ ouvertLe: -1 }).lean();
  return litiges.map(avecPiecesSignees);
}

/** Litiges d'une cible quelconque, pour l'une de ses parties ou un admin du secteur. */
export async function litigesDeCible(type, objetId, user) {
  const c = cible(type);
  if (!c) throw new LitigeError(400, "Type de transaction inconnu.");
  const objet = await c.charger(objetId);
  if (!objet) throw new LitigeError(404, "Transaction introuvable.");
  const partie = await partieSur(type, objet, user);
  if (!partie || (partie === "admin" && !adminPeutInstruire(user, type))) throw new LitigeError(403, "Accès refusé.");
  const litiges = await Litige.find({ "transaction.type": type, "transaction.id": objet._id }).sort({ ouvertLe: -1 }).lean();
  return { partie, litiges: litiges.map(avecPiecesSignees) };
}

/**
 * Reprise (une fois, au démarrage) des contestations de réservation et des
 * litiges logistiques ouverts avant le 2026-11-01 : chacun reçoit son dossier
 * de réclamation, daté de son ouverture réelle. Les réservations et demandes
 * elles-mêmes ne sont pas modifiées.
 */
export async function reprendreLitigesExistants() {
  const { default: Booking } = await import("../models/Booking.js");
  const { default: DemandeLogistique } = await import("../models/DemandeLogistique.js");
  let reservations = 0; let logistique = 0;
  for (const b of await Booking.find({ status: "disputed" }).populate("vehicle", "owner").populate("driver", "owner").populate("activity", "owner").populate("part", "owner")) {
    if (!b.client) continue;
    const l = await ouvrirLitigeCible("reservation", b, { _id: b.client, role: "client" }, {
      description: b.clientValidation?.disputeReason, ouvertLe: b.clientValidation?.disputedAt || b.updatedAt || new Date(),
    });
    const reponse = b.partnerDisputeResponse?.message;
    const vendeur = (await cible("reservation").parties(b)).vendeur;
    if (l && reponse && vendeur && !l.messages.length) {
      await Litige.updateOne({ _id: l._id }, { $push: { messages: { auteur: vendeur, partie: "vendeur", texte: reponse.slice(0, 4000), le: b.partnerDisputeResponse.respondedAt || new Date() } } });
    }
    if (l) reservations += 1;
  }
  for (const d of await DemandeLogistique.find({ statut: "litige" })) {
    const l = await ouvrirLitigeCible("logistique", d, { _id: d.client, role: "client" }, {
      description: d.litige?.motif, ouvertLe: d.jalons?.litigeOuvertLe || d.updatedAt || new Date(),
    });
    if (l) logistique += 1;
  }
  return { reservations, logistique };
}
