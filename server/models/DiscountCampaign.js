import mongoose from "mongoose";

// Campagnes de réduction configurables depuis l'admin (cahier des charges
// "discount campaigns") — appliquées via un code promo optionnel à
// l'activation d'un abonnement ou d'un boost (voir subscriptionController.js
// activatePlan/purchaseBoost). Distinct de Vehicle.promotion (remise
// vendeur sur un véhicule précis, voir server/utils/promotion.js).
const discountCampaignSchema = new mongoose.Schema({
  code:  { type: String, required: true, unique: true, uppercase: true, trim: true },
  label: { type: String, trim: true, default: "" },

  discountPercent: { type: Number, required: true, min: 1, max: 100 },

  // Produits éligibles à ce code — "subscriptions" et/ou "boosts".
  appliesTo: {
    type: [String],
    enum: ["subscriptions", "boosts"],
    default: ["subscriptions", "boosts"],
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: "Au moins un type de produit requis." },
  },

  startDate: { type: Date, default: null },
  endDate:   { type: Date, default: null },
  active:    { type: Boolean, default: true },

  // null = illimité.
  maxRedemptions: { type: Number, default: null, min: 1 },
  redemptionCount: { type: Number, default: 0, min: 0 },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const DiscountCampaign = mongoose.models.DiscountCampaign || mongoose.model("DiscountCampaign", discountCampaignSchema);
export default DiscountCampaign;
