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
const { CURRENCIES, COUNTRIES } = await import("../config/defaultCurrencies.js");


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
