import logger from "../utils/logger.js";
import { getActiveRates, getActiveCountries } from "../services/currencyEngine.js";
import { getConfig } from "../services/pricingEngine.js";

// ── GET /api/pricing/currencies (public) ────────────────────────────────────
export const getCurrencies = async (_req, res) => {
  try {
    const rates = await getActiveRates();
    res.json({ currencies: rates.map((r) => ({ code: r.code, name: r.name, symbol: r.symbol, rateFromUSD: r.rateFromUSD })) });
  } catch (err) {
    logger.error("getCurrencies:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/pricing/countries (public) ─────────────────────────────────────
export const getCountries = async (_req, res) => {
  try {
    const countries = await getActiveCountries();
    res.json({
      countries: countries.map((c) => ({
        code: c.code, name: c.name, flag: c.flag, currency: c.defaultCurrency,
        locale: c.locale, phone: c.phone, languages: c.languages, paymentMethods: c.paymentMethods,
      })),
    });
  } catch (err) {
    logger.error("getCountries:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/pricing/config (public — sous-ensemble visiteur) ───────────────
// Expose uniquement ce qui sert à afficher des tarifs au public (Plans.jsx,
// VendorDashboard.jsx) — pas de champ interne (updatedBy, timestamps Mongoose).
export const getPublicConfig = async (_req, res) => {
  try {
    const config = await getConfig();
    res.json({
      commissions:     config.commissions,
      foundingPartner: config.foundingPartner,
      serviceFee:      config.serviceFee,
      boosts:          config.boosts,
      subscriptions:   config.subscriptions,
      services:        config.services,
      ads:             config.ads,
      rentalOptions:   config.rentalOptions,
    });
  } catch (err) {
    logger.error("getPublicConfig:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
