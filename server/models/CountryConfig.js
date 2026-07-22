import mongoose from "mongoose";

// Source de vérité UNIQUE des pays supportés — remplace les 3 listes qui
// coexistaient avant (COUNTRIES_CONFIG frontend 13 pays, VALID_COUNTRY_CODES
// serveur 13 pays, server/config/countries.js 21 pays avec les tarifs de
// livraison). Union des 3, complétable par l'admin sans redéploiement.
const countryConfigSchema = new mongoose.Schema({
  code:            { type: String, required: true, unique: true, uppercase: true, trim: true }, // ISO-2
  name:            { type: String, required: true, trim: true },
  flag:            { type: String, default: "🌍" },
  defaultCurrency: { type: String, required: true, uppercase: true, trim: true }, // ref ExchangeRate.code
  locale:          { type: String, default: "fr-FR" },
  phone:           { type: String, default: null },
  languages:       { type: [String], default: ["fr"] },
  paymentMethods:  { type: [String], default: [] },

  // Frais de livraison locaux (voir server/services/deliveryFee.js) — dans la
  // devise locale du pays (defaultCurrency), pas en USD : ce sont des tarifs
  // logistiques fixés par zone, pas un montant à convertir.
  deliveryRatePerKm: { type: Number, default: 200 },
  deliveryBaseRate:  { type: Number, default: 1000 },
  deliveryMaxKm:     { type: Number, default: 100 },

  // Taux de taxe locale (TVA/équivalent) applicable aux transactions dans ce
  // pays — configurable indépendamment par pays (cahier des charges "règles
  // par pays"/"taxes"). 0 = pas de taxe appliquée (comportement par défaut).
  taxPercent: { type: Number, default: 0 },

  active:    { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const CountryConfig = mongoose.models.CountryConfig || mongoose.model("CountryConfig", countryConfigSchema);
export default CountryConfig;
