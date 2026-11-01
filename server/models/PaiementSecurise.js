import mongoose from "mongoose";

// ── Paiement sécurisé par séquestre — PRÉPARÉ, INACTIF (2026-10-31) ────────
//
// Modèle du futur circuit via un prestataire habilité : aucune route, aucun
// prestataire branché, aucune écriture aujourd'hui. Il ne représente JAMAIS le
// règlement direct actuel (IETransaction.reglementDirect, purement déclaratif).
// Les états marqués « prestataire » ne peuvent être atteints que sur un
// événement signé et journalisé du prestataire ; VIT AUTO ne fait que DEMANDER
// une libération ou un remboursement. Livraison et libération sont
// indépendantes ; un litige VIT AUTO ouvert interdit de demander la libération.
// Voir docs/import-export-paiement-securise.md §7 et §8.

export const ETATS_PAIEMENT = [
  "not_started", "payment_initiated", "pending_provider_confirmation", "funds_secured",
  "payment_failed", "payment_cancelled", "release_pending", "released_to_seller",
  "refund_pending", "refunded",
];

// de → { vers: sources autorisées }
export const TRANSITIONS_PAIEMENT = {
  not_started:                   { payment_initiated: ["acheteur"] },
  payment_initiated:             { pending_provider_confirmation: ["prestataire"], payment_cancelled: ["acheteur", "prestataire"] },
  pending_provider_confirmation: { funds_secured: ["prestataire"], payment_failed: ["prestataire"] },
  funds_secured:                 { release_pending: ["plateforme"], refund_pending: ["plateforme"] },
  release_pending:               { released_to_seller: ["prestataire"] },
  refund_pending:                { refunded: ["prestataire"] },
  payment_failed: {}, payment_cancelled: {}, released_to_seller: {}, refunded: {},
};

/**
 * Une transition est-elle permise ? Règles métier comprises :
 * - initier exige des conditions acceptées par les deux parties ;
 * - demander la libération exige l'absence de litige ouvert (règle de la
 *   plateforme, pas un blocage des fonds chez le prestataire).
 * @returns {{ ok: boolean, raison?: string }}
 */
export function transitionAutorisee(de, vers, source, { conditionsAcceptees = false, litigeOuvert = false } = {}) {
  const sources = TRANSITIONS_PAIEMENT[de]?.[vers];
  if (!sources) return { ok: false, raison: `Transition ${de} → ${vers} inexistante.` };
  if (!sources.includes(source)) return { ok: false, raison: `${vers} ne peut être établi que par : ${sources.join(", ")}.` };
  if (vers === "payment_initiated" && !conditionsAcceptees) {
    return { ok: false, raison: "Conditions de libération non acceptées par les deux parties." };
  }
  if (vers === "release_pending" && litigeOuvert) {
    return { ok: false, raison: "Un litige est ouvert : VIT AUTO ne peut pas demander la libération." };
  }
  return { ok: true };
}

const paiementSecuriseSchema = new mongoose.Schema({
  transaction: {
    type: { type: String, enum: ["ie"], required: true },
    id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  prestataire:      { type: String, default: null },
  referenceExterne: { type: String, default: null },
  montant:          { type: Number, required: true, min: 0 },
  devise:           { type: String, required: true },
  conditions: {
    id:      { type: mongoose.Schema.Types.ObjectId, ref: "ConditionsLiberation", required: true },
    version: { type: Number, required: true },
    hash:    { type: String, required: true },
  },
  etat: { type: String, enum: ETATS_PAIEMENT, default: "not_started" },
  // Contestation CONFIRMÉE par le prestataire (rétrofacturation…), distincte
  // du litige instruit par VIT AUTO (models/Litige.js).
  contestationPrestataire: {
    etat:        { type: String, enum: ["aucune", "signalee", "confirmee", "levee"], default: "aucune" },
    evenementId: { type: String, default: null },
    le:          { type: Date, default: null },
  },
  historique: [{
    _id: false,
    de:          { type: String, default: null },
    vers:        { type: String, required: true },
    source:      { type: String, enum: ["acheteur", "plateforme", "prestataire"], required: true },
    evenementId: { type: String, default: null },
    le:          { type: Date, default: Date.now },
  }],
}, { timestamps: true });

paiementSecuriseSchema.index({ "transaction.type": 1, "transaction.id": 1 }, { unique: true });

const PaiementSecurise = mongoose.models.PaiementSecurise || mongoose.model("PaiementSecurise", paiementSecuriseSchema);
export default PaiementSecurise;
