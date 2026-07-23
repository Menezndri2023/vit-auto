import mongoose from "mongoose";

// Document singleton (key: "global", toujours récupéré/mis à jour via upsert)
// portant TOUTES les règles commerciales éditables depuis l'admin sans
// redéploiement — remplace les constantes en dur dispersées dans
// bookingController.js, ieTransactionController.js, subscriptionController.js
// et server/utils/foundingPartnerRates.js. Tous les montants sont en USD.
// Taux exprimés en fraction (0.03 = 3 %) — bornés [0, 1] pour empêcher une
// saisie admin erronée (ex: "3" au lieu de "0.03") de produire une commission
// négative ou supérieure au montant de la transaction.
const rateByType = {
  vente:         { type: Number, required: true, min: 0, max: 1 },
  location:      { type: Number, required: true, min: 0, max: 1 },
  chauffeur:     { type: Number, required: true, min: 0, max: 1 },
  import_export: { type: Number, required: true, min: 0, max: 1 },
  leasing:       { type: Number, required: true, min: 0, max: 1 },
};

const foundingRateByType = {
  location:      { type: Number, required: true, min: 0, max: 1 },
  vente:         { type: Number, required: true, min: 0, max: 1 },
  import_export: { type: Number, default: null, min: 0, max: 1 }, // seul le profil "entreprise" l'utilise
};

const serviceEntry = {
  enabled:        { type: Boolean, default: true },
  commissionRate: { type: Number, default: 0, min: 0, max: 1 },   // % prélevé sur le montant du service
  fixedFeeUSD:    { type: Number, default: 0, min: 0 },    // frais fixe alternatif/additionnel
};

const adEntry = {
  priceUSD:     { type: Number, default: 0, min: 0 },
  durationDays: { type: Number, default: 7, min: 1 },
};

const pricingConfigSchema = new mongoose.Schema({
  key: { type: String, default: "global", unique: true },

  commissions: {
    standard: rateByType,
    premium:  rateByType,
  },

  foundingPartner: {
    durationMonths: { type: Number, default: 12, min: 1 },
    entreprise:     foundingRateByType,
    particulier:    foundingRateByType,
  },

  // max(minUSD, montant × percent), plafonné à maxUSD.
  serviceFee: {
    minUSD:  { type: Number, default: 1, min: 0 },
    percent: { type: Number, default: 0.005, min: 0, max: 1 },
    maxUSD:  { type: Number, default: 25, min: 0 },
  },

  // Frais de service de l'estimateur de coût d'import (distinct de la
  // commission import_export ci-dessus, prélevée elle à la libération des
  // fonds — voir server/services/importCostEngine.js) : même formule
  // plancher/plafond, appliquée au prix du véhicule estimé.
  importEstimateFee: {
    percent: { type: Number, default: 0.03, min: 0, max: 1 },
    minUSD:  { type: Number, default: 333, min: 0 },
    maxUSD:  { type: Number, default: 1666, min: 0 },
  },

  boosts: {
    "24h":         { type: Number, required: true, min: 0 },
    "7d":          { type: Number, required: true, min: 0 },
    "30d":         { type: Number, required: true, min: 0 },
    international: { type: Number, required: true, min: 0 },
  },

  // Options de location véhicule (GPS, siège bébé, assurance, chauffeur en
  // sus) — remplace PRIX_OPTIONS en dur dans bookingController.js. Prix fixe
  // par jour de location, en USD.
  rentalOptions: {
    gps:       { type: Number, default: 0, min: 0 },
    babySeat:  { type: Number, default: 0, min: 0 },
    insurance: { type: Number, default: 0, min: 0 },
    driver:    { type: Number, default: 0, min: 0 },
  },

  subscriptions: {
    individuel_plus: { priceUSD: { type: Number, required: true, min: 0 } },
    business:         { priceUSD: { type: Number, required: true, min: 0 } },
    exportateur:       { priceUSD: { type: Number, required: true, min: 0 } },
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
