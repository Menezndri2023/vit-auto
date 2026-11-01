import mongoose from "mongoose";

// ── Litige (réclamation) sur une transaction — conception validée le 2026-10-31 ──
//
// Un litige se pose À CÔTÉ de la transaction : il ne modifie jamais son statut
// commercial, le règlement direct, un paiement ni la logistique (l'ancien
// mécanisme remplaçait `status` par « disputed »). Son état est l'instruction
// menée par VIT AUTO ; il est distinct de toute contestation confirmée par un
// prestataire de paiement (PaiementSecurise.contestationPrestataire). Ouvrir un
// litige ne bloque aucun fonds. Voir docs/import-export-paiement-securise.md §8 et §10.

export const MOTIFS_LITIGE = [
  "non_recu", "endommage", "non_conforme", "quantite_incorrecte",
  "documents_manquants", "retard_important", "paiement_conteste", "autre",
];

export const ETATS_LITIGE = ["opened", "evidence_requested", "under_review", "resolved", "rejected", "closed"];
// Un litige est « ouvert » tant qu'il n'est pas clos : il empêche alors VIT AUTO
// de DEMANDER une libération (règle de la plateforme, pas un blocage de fonds).
export const ETATS_LITIGE_OUVERTS = ["opened", "evidence_requested", "under_review", "resolved", "rejected"];

// Transitions décidées par l'admin (l'ouverture est faite par une partie ou l'admin).
export const TRANSITIONS_LITIGE = {
  opened:             ["evidence_requested", "under_review"],
  evidence_requested: ["under_review"],
  under_review:       ["evidence_requested", "resolved", "rejected"],
  resolved:           ["closed"],
  rejected:           ["closed"],
  closed:             [],
};

const PARTIES = ["acheteur", "vendeur", "admin"];

const pieceSchema = new mongoose.Schema({
  nom:       { type: String, required: true, maxlength: 200 },
  url:       { type: String, required: true },           // dossier PRIVÉ, lu par URL signée
  type:      { type: String, default: null },
  deposePar: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  partie:    { type: String, enum: PARTIES, required: true },
  le:        { type: Date, default: Date.now },
}, { _id: true });

const messageSchema = new mongoose.Schema({
  auteur: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  partie: { type: String, enum: PARTIES, required: true },
  texte:  { type: String, required: true, maxlength: 4000 },
  le:     { type: Date, default: Date.now },
}, { _id: true });

const actionSchema = new mongoose.Schema({
  qui:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  quoi: { type: String, required: true },
  de:   { type: String, default: null },
  vers: { type: String, default: null },
  note: { type: String, default: null, maxlength: 2000 },
  le:   { type: Date, default: Date.now },
}, { _id: false });

const litigeSchema = new mongoose.Schema({
  // Ex. : VA-LIT-2026-000012
  reference: { type: String, unique: true, sparse: true },

  transaction: {
    // "reservation" et "logistique" ajoutés le 2026-11-01 (voir services/litigeCibles.js).
    type: { type: String, enum: ["ie", "reservation", "logistique"], required: true },
    id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  },

  ouvertPar:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  partieOuvrante: { type: String, enum: PARTIES, required: true },
  motif:          { type: String, enum: MOTIFS_LITIGE, required: true },
  description:    { type: String, required: true, trim: true, maxlength: 4000 },
  ouvertLe:       { type: Date, default: Date.now },

  etat: { type: String, enum: ETATS_LITIGE, default: "opened", index: true },
  // Recopié de `etat` à chaque enregistrement (voir pre("validate")) : sert
  // d'index partiel portable (un `$in` n'y est pas accepté partout).
  ouvert: { type: Boolean, default: true },

  // Repris des conditions acceptées (delaiReponseLitigeJours) ; sinon null =
  // « non définie ». Jamais de délai imposé par défaut.
  echeanceReponse: { type: Date, default: null },
  conditions:      { id: { type: mongoose.Schema.Types.ObjectId, ref: "ConditionsLiberation", default: null }, version: { type: Number, default: null } },

  // Instantané à l'ouverture, pour mémoire : rien de ceci n'est modifié par le litige.
  contexte: {
    statutCommercial: { type: String, default: null },
    reglementDirect:  { type: String, default: null },
    fondsLiberes:     { type: Boolean, default: false },
  },

  pieces:   { type: [pieceSchema], default: [] },
  messages: { type: [messageSchema], default: [] },
  actions:  { type: [actionSchema], default: [] },

  issue: {
    decision:      { type: String, default: null, maxlength: 2000 },
    justification: { type: String, default: null, maxlength: 4000 },
    decidePar:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    le:            { type: Date, default: null },
  },
  clotureLe: { type: Date, default: null },
}, { timestamps: true });

litigeSchema.index({ "transaction.type": 1, "transaction.id": 1, ouvertLe: -1 });
// Un seul litige ouvert à la fois par transaction, garanti par la base.
litigeSchema.index(
  { "transaction.type": 1, "transaction.id": 1 },
  { unique: true, partialFilterExpression: { ouvert: true }, name: "un_litige_ouvert_par_transaction" },
);

litigeSchema.pre("validate", function (next) {
  this.ouvert = ETATS_LITIGE_OUVERTS.includes(this.etat);
  next();
});

const Litige = mongoose.models.Litige || mongoose.model("Litige", litigeSchema);
export default Litige;
