import mongoose from "mongoose";

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONS DE LA GRILLE DE COMMISSIONS (exploitant, 2026-10-30)
// ═══════════════════════════════════════════════════════════════════════════
// Toute modification des sections `commissions` ou `foundingPartner` de
// PricingConfig passe par une version : programmée avec une date d'effet,
// notifiée aux partenaires, puis appliquée à cette date. PricingConfig reste
// la grille EN VIGUEUR ; ce journal dit quand et pourquoi elle a changé.
// Préavis : au moins 30 jours pour toute hausse (services/grilleTarifaire.js),
// sous réserve des contrats et du droit applicable.

const changementSchema = new mongoose.Schema({
  chemin: { type: String, required: true },   // ex. "foundingPartner.entreprise.piece_import"
  avant:  { type: Number, default: null },
  apres:  { type: Number, default: null },
}, { _id: false });

const grilleTarifaireSchema = new mongoose.Schema({
  version:     { type: Number, required: true, unique: true },
  statut:      { type: String, enum: ["programmee", "appliquee", "annulee"], default: "programmee", index: true },
  section:     { type: String, enum: ["commissions", "foundingPartner"], required: true },
  valeur:      { type: mongoose.Schema.Types.Mixed, required: true },   // section complète à appliquer
  changements: { type: [changementSchema], default: [] },
  hausse:      { type: Boolean, default: false },
  dateEffet:   { type: Date, required: true, index: true },
  motif:       { type: String, trim: true, default: "" },
  creePar:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  appliqueeLe: { type: Date, default: null },
  annuleeLe:   { type: Date, default: null },
  annuleePar:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  motifAnnulation: { type: String, trim: true, default: null },
  notification: {
    envoyeeLe:    { type: Date, default: null },
    destinataires: { type: Number, default: 0 },
    fondateurs:   { type: Number, default: 0 },
    emails:       { type: Number, default: 0 },
  },
}, { timestamps: true });

export default mongoose.models.GrilleTarifaire || mongoose.model("GrilleTarifaire", grilleTarifaireSchema);
