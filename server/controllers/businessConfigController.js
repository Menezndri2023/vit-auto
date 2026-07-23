import logger from "../utils/logger.js";
import PricingConfig from "../models/PricingConfig.js";
import ExchangeRate from "../models/ExchangeRate.js";
import CountryConfig from "../models/CountryConfig.js";
import DiscountCampaign from "../models/DiscountCampaign.js";
import { logAction } from "../middleware/auditLog.js";

// ═══════════════════════════════════════════════════════════════════════════
// PricingConfig — patch par section (jamais le document entier d'un coup, pour
// éviter qu'un formulaire partiel n'écrase involontairement les autres
// sections — même whitelist-par-section que ImportCostConfig/COST_CONFIG_FIELDS).
// ═══════════════════════════════════════════════════════════════════════════
const SECTIONS = ["commissions", "foundingPartner", "serviceFee", "importEstimateFee", "boosts", "subscriptions", "services", "ads", "rentalOptions"];

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
    const before = await PricingConfig.findOne({ key: "global" }).select(section).lean();
    const config = await PricingConfig.findOneAndUpdate(
      { key: "global" },
      { $set: { [section]: req.body, updatedBy: req.user._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await logAction(req, `business_config.pricing.${section}`, "PricingConfig", config._id, {
      before: before?.[section] ?? null, after: config[section],
    });
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

    const before = await ExchangeRate.findOne({ code: code.toUpperCase() }).lean();
    const rate = await ExchangeRate.findOneAndUpdate(
      { code: code.toUpperCase() },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await logAction(req, before ? "business_config.exchange_rate.update" : "business_config.exchange_rate.create", "ExchangeRate", rate._id, { before, after: rate });
    res.json({ rate });
  } catch (err) {
    logger.error("upsertExchangeRate:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Cette devise existe déjà." });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deleteExchangeRate = async (req, res) => {
  try {
    const deleted = await ExchangeRate.findByIdAndDelete(req.params.id);
    await logAction(req, "business_config.exchange_rate.delete", "ExchangeRate", req.params.id, { before: deleted });
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

// Moyens de paiement réels disponibles sur la plateforme (voir paymentController
// .ALLOWED_METHODS) — CountryConfig.paymentMethods n'a pas d'enum au niveau schéma
// (tableau de strings libre), donc rien n'empêchait une faute de frappe admin
// ("Cash", "carte"...) de faire disparaître silencieusement TOUS les moyens de
// paiement du checkout pour ce pays (Checkout.jsx compare en exact/sensible à la
// casse). Faille réelle trouvée en audit de sécurité (2026-07) — normalisée ici,
// à l'écriture, plutôt que dans le schéma pour rester tolérant à la casse en saisie.
const VALID_PAYMENT_METHODS = ["card", "cash", "orange_money", "wave", "mtn", "moov", "paypal"];
function normalizePaymentMethods(list) {
  if (!Array.isArray(list)) return list;
  return [...new Set(list.map((m) => String(m).trim().toLowerCase()).filter((m) => VALID_PAYMENT_METHODS.includes(m)))];
}

export const upsertCountryConfig = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code pays requis." });
    const payload = {};
    for (const key of COUNTRY_FIELDS) if (req.body[key] !== undefined) payload[key] = req.body[key];
    if (payload.paymentMethods !== undefined) payload.paymentMethods = normalizePaymentMethods(payload.paymentMethods);
    payload.updatedBy = req.user._id;

    const before = await CountryConfig.findOne({ code: code.toUpperCase() }).lean();
    const country = await CountryConfig.findOneAndUpdate(
      { code: code.toUpperCase() },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await logAction(req, before ? "business_config.country.update" : "business_config.country.create", "CountryConfig", country._id, { before, after: country });
    res.json({ country });
  } catch (err) {
    logger.error("upsertCountryConfig:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Ce pays existe déjà." });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deleteCountryConfig = async (req, res) => {
  try {
    const deleted = await CountryConfig.findByIdAndDelete(req.params.id);
    await logAction(req, "business_config.country.delete", "CountryConfig", req.params.id, { before: deleted });
    res.json({ message: "Pays supprimé." });
  } catch (err) {
    logger.error("deleteCountryConfig:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DiscountCampaign — codes promo abonnements/boosts (cahier des charges
// "discount campaigns"), appliqués via subscriptionController.applyDiscountCode.
// ═══════════════════════════════════════════════════════════════════════════
export const getDiscountCampaigns = async (_req, res) => {
  try {
    const campaigns = await DiscountCampaign.find().sort({ createdAt: -1 }).lean();
    res.json({ campaigns });
  } catch (err) {
    logger.error("getDiscountCampaigns:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

const DISCOUNT_FIELDS = ["code", "label", "discountPercent", "appliesTo", "startDate", "endDate", "active", "maxRedemptions"];

export const upsertDiscountCampaign = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code promo requis." });
    const payload = {};
    for (const key of DISCOUNT_FIELDS) if (req.body[key] !== undefined) payload[key] = req.body[key];
    payload.updatedBy = req.user._id;

    const before = await DiscountCampaign.findOne({ code: code.toUpperCase() }).lean();
    const campaign = await DiscountCampaign.findOneAndUpdate(
      { code: code.toUpperCase() },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await logAction(req, before ? "business_config.discount_campaign.update" : "business_config.discount_campaign.create", "DiscountCampaign", campaign._id, { before, after: campaign });
    res.json({ campaign });
  } catch (err) {
    logger.error("upsertDiscountCampaign:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Ce code promo existe déjà." });
    res.status(500).json({ message: err.message || "Erreur serveur." });
  }
};

export const deleteDiscountCampaign = async (req, res) => {
  try {
    const deleted = await DiscountCampaign.findByIdAndDelete(req.params.id);
    await logAction(req, "business_config.discount_campaign.delete", "DiscountCampaign", req.params.id, { before: deleted });
    res.json({ message: "Campagne supprimée." });
  } catch (err) {
    logger.error("deleteDiscountCampaign:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
