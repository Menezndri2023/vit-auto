import mongoose from "mongoose";

// Demandes pour les catégories de la "plateforme de services" qui n'ont pas
// encore de flux dédié (contrairement à l'assurance — voir InsuranceRequest.js
// — ou à l'inspection/séquestre, déjà couverts par des mécanismes propres à
// Import/Export). Même gabarit que InsuranceRequest (décision manuelle admin,
// pas de prestataire tiers intégré), généralisé par `category` pour éviter de
// dupliquer 7 modèles/controllers/routes quasi identiques.
export const SERVICE_REQUEST_CATEGORIES = [
  "transport", "transit", "douanes", "immatriculation", "garantie", "financement", "change_devises",
];

const serviceRequestSchema = new mongoose.Schema({
  client:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, enum: SERVICE_REQUEST_CATEGORIES, required: true },

  vehicle:     { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  vehicleInfo: { type: String, trim: true, default: "" }, // saisie libre si pas de véhicule référencé

  // Champs propres à chaque catégorie (ex. pays/mode pour transport, devises
  // pour change_devises) — volontairement libre plutôt que 7 schémas dédiés.
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes:   { type: String, trim: true, maxlength: 1000, default: "" },

  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },

  // Devis proposé par l'admin à l'approbation, en USD (source de vérité de la
  // plateforme depuis la refonte du modèle économique).
  quotedAmountUSD: { type: Number, default: null },
  commission: {
    rate:   { type: Number, default: null }, // depuis PricingConfig.services.<category>
    amount: { type: Number, default: null },
  },

  decisionNote: { type: String, default: null },
  decisionAt:   { type: Date, default: null },
  decisionBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

serviceRequestSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

serviceRequestSchema.index({ status: 1 });
serviceRequestSchema.index({ client: 1 });
serviceRequestSchema.index({ category: 1 });

const ServiceRequest =
  mongoose.models.ServiceRequest || mongoose.model("ServiceRequest", serviceRequestSchema);

export default ServiceRequest;
