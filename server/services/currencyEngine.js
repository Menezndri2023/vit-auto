import ExchangeRate from "../models/ExchangeRate.js";
import CountryConfig from "../models/CountryConfig.js";

// Remplace server/utils/exchangeRates.js (table XOF-pivot en dur) et
// server/config/countries.js (liste de pays + tarifs en dur) — source unique,
// éditable depuis l'admin (voir routes/businessConfig.js), pivot USD partout.

export async function getActiveRates() {
  const rates = await ExchangeRate.find({ active: true }).lean();
  return rates;
}

export async function getActiveCountries() {
  const countries = await CountryConfig.find({ active: true }).sort({ name: 1 }).lean();
  return countries;
}

// Taux brut (unités de `code` pour 1 USD) — utile pour convertir plusieurs
// montants dans un même appelant sans refaire une requête par montant (voir
// server/services/importCostEngine.js).
export async function getRateFromUSD(code) {
  if (code === "USD") return 1;
  const rate = await ExchangeRate.findOne({ code, active: true }).lean();
  return rate?.rateFromUSD ?? null;
}

// Convertit un montant USD vers `toCode`. Retourne null si la devise est
// inconnue/inactive plutôt que de deviner un taux (mieux vaut un affichage
// visiblement cassé qu'un montant silencieusement faux).
export async function convertFromUSD(amountUSD, toCode) {
  if (amountUSD == null || isNaN(amountUSD)) return null;
  if (toCode === "USD") return amountUSD;
  const rate = await ExchangeRate.findOne({ code: toCode, active: true }).lean();
  if (!rate) return null;
  return Math.round(amountUSD * rate.rateFromUSD * 100) / 100;
}

// Convertit entre deux devises arbitraires, en repassant par USD comme pivot
// (équivalent de convertAmount() dans l'ancien server/utils/exchangeRates.js).
export async function convertAmount(amount, fromCode, toCode) {
  if (amount == null || isNaN(amount)) return null;
  if (fromCode === toCode) return amount;
  const [fromRate, toRate] = await Promise.all([
    fromCode === "USD" ? Promise.resolve({ rateFromUSD: 1 }) : ExchangeRate.findOne({ code: fromCode, active: true }).lean(),
    toCode === "USD"   ? Promise.resolve({ rateFromUSD: 1 }) : ExchangeRate.findOne({ code: toCode, active: true }).lean(),
  ]);
  if (!fromRate || !toRate) return null;
  const amountUSD = amount / fromRate.rateFromUSD;
  return Math.round(amountUSD * toRate.rateFromUSD * 100) / 100;
}

// ── Frais de livraison locaux (voir server/services/deliveryFee.js) ─────────
// Port de calculateDeliveryFee() (ex server/config/countries.js), même
// comportement : tarifs dans la devise locale du pays, pas convertis.
export async function calculateDeliveryFee(countryCode, distanceKm) {
  const country = (await CountryConfig.findOne({ code: countryCode, active: true }).lean())
    || (await CountryConfig.findOne({ active: true }).sort({ name: 1 }).lean());
  if (!country) return { fee: null, currency: "USD", feeDisplay: "Livraison non disponible." };

  const km = Math.max(0, distanceKm);
  if (km > country.deliveryMaxKm) {
    return { fee: null, currency: country.defaultCurrency, feeDisplay: "Livraison non disponible pour cette distance" };
  }

  const rate = await ExchangeRate.findOne({ code: country.defaultCurrency }).lean();
  const fee = Math.round(country.deliveryBaseRate + km * country.deliveryRatePerKm);
  const display = fee.toLocaleString("fr-FR") + " " + (rate?.symbol || country.defaultCurrency);
  return { fee, currency: country.defaultCurrency, feeDisplay: display };
}

export async function getCountry(code) {
  return (await CountryConfig.findOne({ code, active: true }).lean())
    || (await CountryConfig.findOne({ active: true }).sort({ name: 1 }).lean());
}
