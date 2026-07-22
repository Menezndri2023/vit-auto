import mongoose from "mongoose";

// Document singleton (key: "global", toujours récupéré/mis à jour via upsert)
// portant TOUTES les règles commerciales éditables depuis l'admin sans
// redéploiement — remplace les constantes en dur dispersées dans
// bookingController.js, ieTransactionController.js, subscriptionController.js
// et server/utils/foundingPartnerRates.js. Tous les montants sont en USD.
const rateByType = {
  vente:         { type: Number, required: true },
  location:      { type: Number, required: true },
  chauffeur:     { type: Number, required: true },
  import_export: { type: Number, required: true },
  leasing:       { type: Number, required: true },
};

const foundingRateByType = {
  location:      { type: Number, required: true },
  vente:         { type: Number, required: true },
  import_export: { type: Number, default: null }, // seul le profil "entreprise" l'utilise
};

const serviceEntry = {
  enabled:        { type: Boolean, default: true },
  commissionRate: { type: Number, default: 0 },   // % prélevé sur le montant du service
  fixedFeeUSD:    { type: Number, default: 0 },    // frais fixe alternatif/additionnel
};

const adEntry = {
  priceUSD:     { type: Number, default: 0 },
  durationDays: { type: Number, default: 7 },
};

const pricingConfigSchema = new mongoose.Schema({
  key: { type: String, default: "global", unique: true },

  commissions: {
    standard: rateByType,
    premium:  rateByType,
  },

  foundingPartner: {
    durationMonths: { type: Number, default: 12 },
    entreprise:     foundingRateByType,
    particulier:    foundingRateByType,
  },

  // max(minUSD, montant × percent), plafonné à maxUSD.
  serviceFee: {
    minUSD:  { type: Number, default: 1 },
    percent: { type: Number, default: 0.005 },
    maxUSD:  { type: Number, default: 25 },
  },

  boosts: {
    "24h":         { type: Number, required: true },
    "7d":          { type: Number, required: true },
    "30d":         { type: Number, required: true },
    international: { type: Number, required: true },
  },

  // Options de location véhicule (GPS, siège bébé, assurance, chauffeur en
  // sus) — remplace PRIX_OPTIONS en dur dans bookingController.js. Prix fixe
  // par jour de location, en USD.
  rentalOptions: {
    gps:       { type: Number, default: 0 },
    babySeat:  { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    driver:    { type: Number, default: 0 },
  },

  subscriptions: {
    individuel_plus: { priceUSD: { type: Number, required: true } },
    business:         { priceUSD: { type: Number, required: true } },
    exportateur:       { priceUSD: { type: Number, required: true } },
    // "entreprise" = devis manuel, volontairement absent d'ici (pas de self-service).
  },

  services: {
    inspection:      serviceEntry,
    assurance:        serviceEntry,
    transport:        serviceEntry,
    transit:          serviceEntry,
    douanes:          serviceEntry,
    immatriculation:  serviceEntry,
    garantie:         serviceEntry,
    financement:      serviceEntry,
    sequestre:        serviceEntry,
    change_devises:   serviceEntry,
  },

  ads: {
    banner:           adEntry,
    homepage_feature:  adEntry,
    category_promo:    adEntry,
    seo:               adEntry,
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const PricingConfig = mongoose.models.PricingConfig || mongoose.model("PricingConfig", pricingConfigSchema);
export default PricingConfig;
