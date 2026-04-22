import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  plan: {
    type: String,
    enum: ["free", "pro"],
    default: "free",
  },

  // Détails du plan Pro
  proDetails: {
    startDate:  { type: Date },
    endDate:    { type: Date },
    isActive:   { type: Boolean, default: false },
    priceXOF:   { type: Number, default: 25000 }, // 25 000 FCFA/mois
  },

  // Mises en avant (boosts d'annonces)
  boosts: [
    {
      vehicle:   { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
      startDate: { type: Date },
      endDate:   { type: Date },
      isActive:  { type: Boolean, default: false },
      priceXOF:  { type: Number, default: 5000 }, // 5 000 FCFA / boost
      paidAt:    { type: Date },
    },
  ],

  // Historique des paiements d'abonnement
  paymentHistory: [
    {
      amount:  { type: Number },
      method:  { type: String },
      paidAt:  { type: Date, default: Date.now },
      status:  { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
      period:  { type: String }, // ex: "2026-04"
    },
  ],

  // Statistiques cumulées
  stats: {
    totalRevenue:      { type: Number, default: 0 }, // revenus bruts
    totalCommission:   { type: Number, default: 0 }, // commissions versées à VIT AUTO
    totalPayout:       { type: Number, default: 0 }, // net perçu
    totalBookings:     { type: Number, default: 0 },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Vérifie si le plan Pro est actif en ce moment
subscriptionSchema.virtual("isProActive").get(function () {
  if (this.plan !== "pro") return false;
  if (!this.proDetails?.isActive) return false;
  if (!this.proDetails?.endDate) return false;
  return new Date() < this.proDetails.endDate;
});

subscriptionSchema.set("toJSON", { virtuals: true });

subscriptionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
