import mongoose from "mongoose";
import crypto from "crypto";

// ── Conditions de libération versionnées — conception validée le 2026-10-31 ──
//
// Un document par (transaction, version), IMMUABLE : aucun champ ne change
// après sa création (écritures refusées ci-dessous). Toute modification crée la
// version N+1 ; la version en vigueur est la plus haute — pas de « remplacePar »,
// qui obligerait à réécrire un document déclaré immuable. Le hash SHA-256 du
// contenu canonique prouve que le texte accepté n'a pas bougé. Les acceptations
// vivent dans AcceptationConditions.js.
//
// Circuit « reglement_direct » : les conditions encadrent livraison, conformité
// et réclamation — PAS des fonds, que VIT AUTO ne détient pas. Circuit
// « sequestre_prestataire » : futur, obligatoire avant tout paiement sécurisé.
// L'Incoterm® 2020 est une clause de livraison, jamais une règle de libération.

export const CIRCUITS = ["reglement_direct", "sequestre_prestataire"];

const contenuSchema = new mongoose.Schema({
  parties: {
    acheteur: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    vendeur:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  reference:               { type: String, required: true },
  montant:                 { type: Number, required: true, min: 0 },
  devise:                  { type: String, required: true },
  livraison: {
    incoterm:   { type: String, default: null },
    lieuNomme:  { type: String, default: null, maxlength: 300 },
    modalites:  { type: String, default: null, maxlength: 2000 },
  },
  conformite:              { type: String, default: null, maxlength: 4000 },
  documentsRequis:         { type: [String], default: [] },
  evenementsLiberation:    { type: [String], default: [] },
  delaiValidationJours:    { type: Number, default: null, min: 0, max: 365 },
  delaiReclamationJours:   { type: Number, default: null, min: 0, max: 365 },
  delaiReponseLitigeJours: { type: Number, default: null, min: 0, max: 365 },
  remboursement:           { type: String, default: null, maxlength: 4000 },
  liberationPartielle:     { type: String, default: null, maxlength: 2000 },
  rolePrestataire:         { type: String, default: null, maxlength: 2000 },
  roleVitAuto:             { type: String, default: null, maxlength: 2000 },
}, { _id: false });

const conditionsSchema = new mongoose.Schema({
  transaction: {
    type: { type: String, enum: ["ie"], required: true },
    id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  version:    { type: Number, required: true, min: 1 },
  circuit:    { type: String, enum: CIRCUITS, required: true },
  contenu:    { type: contenuSchema, required: true },
  hash:       { type: String, required: true },
  // Version 1 créée par la plateforme quand la transaction devient payable
  // (origine « plateforme », proposePar vide) ; les suivantes par une partie.
  origine:    { type: String, enum: ["partie", "plateforme"], default: "partie" },
  proposePar: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  creeLe:     { type: Date, default: Date.now },
}, { versionKey: false });

conditionsSchema.index({ "transaction.type": 1, "transaction.id": 1, version: 1 }, { unique: true });

// Contenu canonique : clés triées récursivement, identifiants en chaînes.
export function canonique(valeur) {
  if (valeur == null) return null;
  if (valeur instanceof mongoose.Types.ObjectId) return String(valeur);
  if (valeur instanceof Date) return valeur.toISOString();
  if (Array.isArray(valeur)) return valeur.map(canonique);
  if (typeof valeur === "object") {
    const src = typeof valeur.toObject === "function" ? valeur.toObject() : valeur;
    return Object.keys(src).sort().reduce((o, k) => { if (k !== "_id") o[k] = canonique(src[k]); return o; }, {});
  }
  return valeur;
}

export const hashContenu = (contenu) =>
  crypto.createHash("sha256").update(JSON.stringify(canonique(contenu))).digest("hex");

// Le hash est calculé ici, jamais fourni par l'appelant.
conditionsSchema.pre("validate", function (next) {
  if (this.isNew) this.hash = hashContenu(this.contenu);
  next();
});

const refuser = (next) => next(new Error("Conditions de libération immuables : créez une nouvelle version."));
conditionsSchema.pre("save", function (next) { return this.isNew ? next() : refuser(next); });
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"]) {
  conditionsSchema.pre(op, function (next) { refuser(next); });
}

// Le contenu stocké correspond-il toujours à son hash ?
conditionsSchema.methods.estIntegre = function () {
  return hashContenu(this.contenu) === this.hash;
};

const ConditionsLiberation = mongoose.models.ConditionsLiberation || mongoose.model("ConditionsLiberation", conditionsSchema);
export default ConditionsLiberation;
