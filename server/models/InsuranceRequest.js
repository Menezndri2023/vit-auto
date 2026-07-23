import mongoose from "mongoose";

// Demande d'assurance (auto / location / import-export) — décision manuelle
// admin pour l'instant : aucun assureur partenaire n'est intégré via API
// (partie technique à raccorder plus tard, voir PartnerOnboarding.partnerType
// "assurance" pour les partenaires assureurs déjà référencés côté programme
// Founding Partner).
const insuranceRequestSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["auto", "location", "import_export"],
    required: true,
  },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  vehicleInfo: { type: String, trim: true, default: "" }, // saisie libre si pas de véhicule référencé
  coveragePeriodMonths: { type: Number, default: 12 },
  notes: { type: String, trim: true, maxlength: 1000, default: "" },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  premium:       { type: Number, default: null },      // prime proposée, en USD
  devise:        { type: String, default: "USD" },
  commission: {
    rate:   { type: Number, default: null }, // depuis PricingConfig.services.assurance
    amount: { type: Number, default: null },
  },
  decisionNote:  { type: String, default: null },
  decisionAt:    { type: Date,   default: null },
  decisionBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assignedPartner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // partenaire assureur

  // Paiement de la prime — voir paymentController.js (Payment.insuranceRequest),
  // même passerelle (Stripe/Orange Money/Wave) que les réservations.
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

insuranceRequestSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

insuranceRequestSchema.index({ status: 1 });
insuranceRequestSchema.index({ client: 1 });

const InsuranceRequest =
  mongoose.models.InsuranceRequest ||
  mongoose.model("InsuranceRequest", insuranceRequestSchema);

export default InsuranceRequest;
