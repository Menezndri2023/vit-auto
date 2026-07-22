import logger from "../utils/logger.js";
import PricingConfig from "../models/PricingConfig.js";
import ExchangeRate from "../models/ExchangeRate.js";
import CountryConfig from "../models/CountryConfig.js";

// ═══════════════════════════════════════════════════════════════════════════
// PricingConfig — patch par section (jamais le document entier d'un coup, pour
// éviter qu'un formulaire partiel n'écrase involontairement les autres
// sections — même whitelist-par-section que ImportCostConfig/COST_CONFIG_FIELDS).
// ═══════════════════════════════════════════════════════════════════════════
const SECTIONS = ["commissions", "foundingPartner", "serviceFee", "boosts", "subscriptions", "services", "ads", "rentalOptions"];

export const getPricingConfig = async (_req, res) => {
  try {
    const config = await PricingConfig.findOne({ key: "global" }).lean();
    if (!config) return res.status(404).json({ message: "Configuration non initialisée." });
    res.json({ config });
  } catch (err) {
    logger.error("getPricingConfig:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const updatePricingSection = async (req, res) => {
  try {
    const { section } = req.params;
    if (!SECTIONS.includes(section)) {
      return res.status(400).json({ message: `Section inconnue. Attendu : ${SECTIONS.join(", ")}.` });
    }
    const config = await PricingConfig.findOneAndUpdate(
      { key: "global" },
      { $set: { [section]: req.body, updatedBy: req.user._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ config });
  } catch (err) {
    logger.error("updatePricingSection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ExchangeRate
// ═══════════════════════════════════════════════════════════════════════════
export const getExchangeRates = async (_req, res) => {
  try {
    const rates = await ExchangeRate.find().sort({ code: 1 }).lean();
    res.json({ rates });
  } catch (err) {
    logger.error("getExchangeRates:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

const RATE_FIELDS = ["code", "name", "symbol", "rateFromUSD", "active"];

export const upsertExchangeRate = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code devise requis." });
    const payload = {};
    for (const key of RATE_FIELDS) if (req.body[key] !== undefined) payload[key] = req.body[key];
    payload.updatedBy = req.user._id;

    const rate = await ExchangeRate.findOneAndUpdate(
      { code: code.toUpperCase() },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ rate });
  } catch (err) {
    logger.error("upsertExchangeRate:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Cette devise existe déjà." });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deleteExchangeRate = async (req, res) => {
  try {
    await ExchangeRate.findByIdAndDelete(req.params.id);
    res.json({ message: "Devise supprimée." });
  } catch (err) {
    logger.error("deleteExchangeRate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CountryConfig
// ═══════════════════════════════════════════════════════════════════════════
export const getCountryConfigs = async (_req, res) => {
  try {
    const countries = await CountryConfig.find().sort({ name: 1 }).lean();
    res.json({ countries });
  } catch (err) {
    logger.error("getCountryConfigs:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

const COUNTRY_FIELDS = [
  "code", "name", "flag", "defaultCurrency", "locale", "phone", "languages", "paymentMethods",
  "deliveryRatePerKm", "deliveryBaseRate", "deliveryMaxKm", "taxPercent", "active",
];

export const upsertCountryConfig = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code pays requis." });
    const payload = {};
    for (const key of COUNTRY_FIELDS) if (req.body[key] !== undefined) payload[key] = req.body[key];
    payload.updatedBy = req.user._id;

    const country = await CountryConfig.findOneAndUpdate(
      { code: code.toUpperCase() },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ country });
  } catch (err) {
    logger.error("upsertCountryConfig:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Ce pays existe déjà." });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deleteCountryConfig = async (req, res) => {
  try {
    await CountryConfig.findByIdAndDelete(req.params.id);
    res.json({ message: "Pays supprimé." });
  } catch (err) {
    logger.error("deleteCountryConfig:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
