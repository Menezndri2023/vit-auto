import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  // "entreprise" est volontairement absent — tarification personnalisée /
  // devis manuel (hors self-service), voir Plans.jsx.
  plan: {
    type: String,
    enum: ["free", "individuel_plus", "business", "exportateur"],
    default: "free",
  },

  // Détails du plan payant actif (un seul à la fois par vendeur) — prix figé
  // au moment de l'activation (voir pricingEngine.getSubscriptionPrice()),
  // pour ne jamais faire varier rétroactivement le montant déjà facturé si
  // l'admin modifie PricingConfig.subscriptions ensuite.
  planDetails: {
    startDate: { type: Date },
    endDate:   { type: Date },
    isActive:  { type: Boolean, default: false },
    priceUSD:  { type: Number, default: 0 },
  },

  // Mises en avant (boosts d'annonces) — 4 paliers, voir PricingConfig.boosts.
  boosts: [
    {
      vehicle:   { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
      tier:      { type: String, enum: ["24h", "7d", "30d", "international"], default: "30d" },
      startDate: { type: Date },
      endDate:   { type: Date },
      isActive:  { type: Boolean, default: false },
      priceUSD:  { type: Number, default: 0 },
      paidAt:    { type: Date },
      promoCode: { type: String, default: null }, // code DiscountCampaign appliqué, le cas échéant
    },
  ],

  // Historique des paiements d'abonnement
  paymentHistory: [
    {
      planTier: { type: String, enum: ["individuel_plus", "business", "exportateur"] },
      amount:  { type: Number },
      method:  { type: String },
      paidAt:  { type: Date, default: Date.now },
      status:  { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
      period:  { type: String }, // ex: "2026-04"
      promoCode: { type: String, default: null }, // code DiscountCampaign appliqué, le cas échéant
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

// Vérifie si un plan payant est actif en ce moment (n'importe lequel des 3 —
// remplace l'ancien isProActive spécifique au plan "pro" unique).
subscriptionSchema.virtual("isPlanActive").get(function () {
  if (this.plan === "free") return false;
  if (!this.planDetails?.isActive) return false;
  if (!this.planDetails?.endDate) return false;
  return new Date() < this.planDetails.endDate;
});

subscriptionSchema.set("toJSON", { virtuals: true });

subscriptionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
