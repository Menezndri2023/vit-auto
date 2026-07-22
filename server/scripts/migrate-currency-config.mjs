/**
 * Script : Seed initial ExchangeRate / CountryConfig / PricingConfig
 * Usage  : cd server && node scripts/migrate-currency-config.mjs
 *
 * Réconcilie les 3 tables de taux de change en dur qui coexistaient avant
 * (src/context/CurrencyContext.jsx, server/config/countries.js,
 * server/utils/exchangeRates.js) en une seule source de vérité, pivot USD.
 * Idempotent : upsert par code, peut être relancé sans dupliquer.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

const { default: ExchangeRate } = await import("../models/ExchangeRate.js");
const { default: CountryConfig } = await import("../models/CountryConfig.js");
const { default: PricingConfig } = await import("../models/PricingConfig.js");
const { DEFAULT_PRICING_CONFIG } = await import("../config/defaultPricingConfig.js");

// ── Taux de change (base : server/utils/exchangeRates.js, XOF-pivot, converti
// en rateFromUSD = 600 / XOF_pivot puisque 1 USD ≈ 600 XOF à date de rédaction) ──
const CURRENCIES = [
  { code: "USD", name: "Dollar US",         symbol: "$",    rateFromUSD: 1 },
  { code: "XOF", name: "Franc CFA (UEMOA)", symbol: "FCFA", rateFromUSD: 600 },
  { code: "XAF", name: "Franc CFA (CEMAC)", symbol: "FCFA", rateFromUSD: 600 },
  { code: "MAD", name: "Dirham marocain",   symbol: "DH",   rateFromUSD: 9.9174 },
  { code: "EUR", name: "Euro",              symbol: "€",    rateFromUSD: 0.9147 },
  { code: "GBP", name: "Livre sterling",    symbol: "£",    rateFromUSD: 0.7843 },
  { code: "CAD", name: "Dollar canadien",   symbol: "CA$",  rateFromUSD: 1.3333 },
  { code: "CHF", name: "Franc suisse",      symbol: "CHF",  rateFromUSD: 0.8824 },
  { code: "TND", name: "Dinar tunisien",    symbol: "DT",   rateFromUSD: 3.0769 },
  { code: "DZD", name: "Dinar algérien",    symbol: "DA",   rateFromUSD: 136.3636 },
  { code: "GNF", name: "Franc guinéen",     symbol: "GNF",  rateFromUSD: 9230.7692 },
  { code: "CNY", name: "Yuan chinois",      symbol: "¥",    rateFromUSD: 7.1006 },
  { code: "AED", name: "Dirham EAU",        symbol: "AED",  rateFromUSD: 3.6810 },
  { code: "GHS", name: "Cedi ghanéen",      symbol: "GH₵",  rateFromUSD: 15 },
  { code: "NGN", name: "Naira nigérian",    symbol: "₦",    rateFromUSD: 1500 },
];

// ── Pays (union des 3 listes : server/config/countries.js — la plus riche,
// 21 pays avec tarifs de livraison — + les pays connus uniquement par
// COUNTRY_TO_CURRENCY côté frontend, jamais proposés dans un sélecteur avant) ──
const COUNTRIES = [
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", defaultCurrency: "XOF", locale: "fr-CI", phone: "+225", languages: ["fr"], paymentMethods: ["orange_money", "mtn", "moov", "wave", "card", "cash"], deliveryRatePerKm: 200, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "SN", name: "Sénégal",       flag: "🇸🇳", defaultCurrency: "XOF", locale: "fr-SN", phone: "+221", languages: ["fr"], paymentMethods: ["orange_money", "wave", "free_money", "card", "cash"], deliveryRatePerKm: 180, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "ML", name: "Mali",          flag: "🇲🇱", defaultCurrency: "XOF", locale: "fr-ML", phone: "+223", languages: ["fr"], paymentMethods: ["orange_money", "moov", "card", "cash"], deliveryRatePerKm: 180, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "BF", name: "Burkina Faso",  flag: "🇧🇫", defaultCurrency: "XOF", locale: "fr-BF", phone: "+226", languages: ["fr"], paymentMethods: ["orange_money", "moov", "card", "cash"], deliveryRatePerKm: 180, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "NE", name: "Niger",         flag: "🇳🇪", defaultCurrency: "XOF", locale: "fr-NE", phone: "+227", languages: ["fr"], paymentMethods: ["orange_money", "card", "cash"], deliveryRatePerKm: 180, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "TG", name: "Togo",          flag: "🇹🇬", defaultCurrency: "XOF", locale: "fr-TG", phone: "+228", languages: ["fr"], paymentMethods: ["tmoney", "flooz", "orange_money", "card", "cash"], deliveryRatePerKm: 180, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "BJ", name: "Bénin",         flag: "🇧🇯", defaultCurrency: "XOF", locale: "fr-BJ", phone: "+229", languages: ["fr"], paymentMethods: ["mtn", "moov", "card", "cash"], deliveryRatePerKm: 180, deliveryBaseRate: 1000, deliveryMaxKm: 100 },
  { code: "GN", name: "Guinée",        flag: "🇬🇳", defaultCurrency: "GNF", locale: "fr-GN", phone: "+224", languages: ["fr"], paymentMethods: ["orange_money", "mtn", "card", "cash"], deliveryRatePerKm: 200, deliveryBaseRate: 1000, deliveryMaxKm: 80 },
  { code: "GH", name: "Ghana",         flag: "🇬🇭", defaultCurrency: "GHS", locale: "en-GH", phone: "+233", languages: ["en"], paymentMethods: ["mtn", "vodafone_cash", "airteltigo", "card", "cash"], deliveryRatePerKm: 2, deliveryBaseRate: 10, deliveryMaxKm: 150 },
  { code: "NG", name: "Nigeria",       flag: "🇳🇬", defaultCurrency: "NGN", locale: "en-NG", phone: "+234", languages: ["en"], paymentMethods: ["flutterwave", "paystack", "mtn", "airtel", "card", "cash"], deliveryRatePerKm: 150, deliveryBaseRate: 1000, deliveryMaxKm: 200 },
  { code: "CM", name: "Cameroun",      flag: "🇨🇲", defaultCurrency: "XAF", locale: "fr-CM", phone: "+237", languages: ["fr"], paymentMethods: ["orange_money", "mtn", "card", "cash"], deliveryRatePerKm: 200, deliveryBaseRate: 1000, deliveryMaxKm: 150 },
  { code: "AE", name: "Émirats Arabes Unis", flag: "🇦🇪", defaultCurrency: "AED", locale: "ar-AE", phone: "+971", languages: ["ar", "en"], paymentMethods: ["stripe", "paypal", "card", "apple_pay", "google_pay"], deliveryRatePerKm: 1.5, deliveryBaseRate: 10, deliveryMaxKm: 500 },
  { code: "CN", name: "Chine",         flag: "🇨🇳", defaultCurrency: "CNY", locale: "zh-CN", phone: "+86", languages: ["zh"], paymentMethods: ["alipay", "wechat_pay", "card", "unionpay"], deliveryRatePerKm: 4, deliveryBaseRate: 20, deliveryMaxKm: 1000 },
  { code: "MA", name: "Maroc",         flag: "🇲🇦", defaultCurrency: "MAD", locale: "fr-MA", phone: "+212", languages: ["fr", "ar"], paymentMethods: ["cmi", "cih", "banque_populaire", "card", "cash"], deliveryRatePerKm: 3, deliveryBaseRate: 15, deliveryMaxKm: 200 },
  { code: "DZ", name: "Algérie",       flag: "🇩🇿", defaultCurrency: "DZD", locale: "fr-DZ", phone: "+213", languages: ["fr", "ar"], paymentMethods: ["ccp", "card", "cash"], deliveryRatePerKm: 25, deliveryBaseRate: 200, deliveryMaxKm: 200 },
  { code: "TN", name: "Tunisie",       flag: "🇹🇳", defaultCurrency: "TND", locale: "fr-TN", phone: "+216", languages: ["fr", "ar"], paymentMethods: ["flouci", "card", "cash"], deliveryRatePerKm: 0.5, deliveryBaseRate: 3, deliveryMaxKm: 200 },
  { code: "FR", name: "France",        flag: "🇫🇷", defaultCurrency: "EUR", locale: "fr-FR", phone: "+33", languages: ["fr"], paymentMethods: ["stripe", "paypal", "card", "sepa"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "BE", name: "Belgique",      flag: "🇧🇪", defaultCurrency: "EUR", locale: "fr-BE", phone: "+32", languages: ["fr"], paymentMethods: ["stripe", "paypal", "card", "bancontact"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 300 },
  { code: "ES", name: "Espagne",       flag: "🇪🇸", defaultCurrency: "EUR", locale: "es-ES", phone: "+34", languages: ["fr", "es"], paymentMethods: ["stripe", "paypal", "card", "bizum"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "PT", name: "Portugal",      flag: "🇵🇹", defaultCurrency: "EUR", locale: "pt-PT", phone: "+351", languages: ["pt"], paymentMethods: ["stripe", "paypal", "card"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "IT", name: "Italie",        flag: "🇮🇹", defaultCurrency: "EUR", locale: "it-IT", phone: "+39", languages: ["it"], paymentMethods: ["stripe", "paypal", "card"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "DE", name: "Allemagne",     flag: "🇩🇪", defaultCurrency: "EUR", locale: "de-DE", phone: "+49", languages: ["de"], paymentMethods: ["stripe", "paypal", "card", "sepa"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "NL", name: "Pays-Bas",      flag: "🇳🇱", defaultCurrency: "EUR", locale: "nl-NL", phone: "+31", languages: ["nl"], paymentMethods: ["stripe", "paypal", "card", "ideal"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "LU", name: "Luxembourg",    flag: "🇱🇺", defaultCurrency: "EUR", locale: "fr-LU", phone: "+352", languages: ["fr"], paymentMethods: ["stripe", "paypal", "card"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 300 },
  { code: "GB", name: "Royaume-Uni",   flag: "🇬🇧", defaultCurrency: "GBP", locale: "en-GB", phone: "+44", languages: ["en"], paymentMethods: ["stripe", "paypal", "card"], deliveryRatePerKm: 0.8, deliveryBaseRate: 5, deliveryMaxKm: 500 },
  { code: "CH", name: "Suisse",        flag: "🇨🇭", defaultCurrency: "CHF", locale: "fr-CH", phone: "+41", languages: ["fr"], paymentMethods: ["stripe", "twint", "card", "paypal"], deliveryRatePerKm: 1.2, deliveryBaseRate: 8, deliveryMaxKm: 300 },
  { code: "US", name: "États-Unis",    flag: "🇺🇸", defaultCurrency: "USD", locale: "en-US", phone: "+1", languages: ["en"], paymentMethods: ["stripe", "paypal", "card", "apple_pay", "google_pay"], deliveryRatePerKm: 1.2, deliveryBaseRate: 8, deliveryMaxKm: 500 },
  { code: "CA", name: "Canada",        flag: "🇨🇦", defaultCurrency: "CAD", locale: "fr-CA", phone: "+1", languages: ["fr", "en"], paymentMethods: ["stripe", "paypal", "card", "interac"], deliveryRatePerKm: 1.0, deliveryBaseRate: 7, deliveryMaxKm: 500 },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connecté à MongoDB.");

  let ratesUpserted = 0;
  for (const c of CURRENCIES) {
    await ExchangeRate.findOneAndUpdate({ code: c.code }, c, { upsert: true, setDefaultsOnInsert: true });
    ratesUpserted++;
  }
  console.log(`✅ ${ratesUpserted} devises upsertées dans ExchangeRate.`);

  let countriesUpserted = 0;
  for (const c of COUNTRIES) {
    await CountryConfig.findOneAndUpdate({ code: c.code }, c, { upsert: true, setDefaultsOnInsert: true });
    countriesUpserted++;
  }
  console.log(`✅ ${countriesUpserted} pays upsertés dans CountryConfig.`);

  await PricingConfig.findOneAndUpdate({ key: "global" }, DEFAULT_PRICING_CONFIG, { upsert: true, setDefaultsOnInsert: true });
  console.log("✅ PricingConfig (global) initialisée.");

  await mongoose.disconnect();
  console.log("Terminé.");
}

run().catch((err) => {
  console.error("Erreur de migration:", err);
  process.exit(1);
});
