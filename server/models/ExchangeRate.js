import mongoose from "mongoose";

// Source de vérité UNIQUE des taux de change — remplace les 3 tables en dur et
// non synchronisées qui coexistaient avant (src/context/CurrencyContext.jsx
// ×2, server/config/countries.js, server/utils/exchangeRates.js). Pivot USD :
// rateFromUSD = combien d'unités de `code` pour 1 USD (ex. MAD: rateFromUSD≈9.9).
const exchangeRateSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, uppercase: true, trim: true }, // ISO 4217
  name:        { type: String, required: true, trim: true },
  symbol:      { type: String, required: true, trim: true },
  rateFromUSD: { type: Number, required: true, min: 0 },
  active:      { type: Boolean, default: true },
  updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const ExchangeRate = mongoose.models.ExchangeRate || mongoose.model("ExchangeRate", exchangeRateSchema);
export default ExchangeRate;
