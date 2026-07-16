import logger from "../utils/logger.js";
import ImportExportListing from "../models/ImportExportListing.js";
import ImportCostConfig from "../models/ImportCostConfig.js";
import ShippingLaneRate from "../models/ShippingLaneRate.js";
import { computeImportCost } from "../services/importCostEngine.js";

// ── GET /api/import-cost/listings/:id/estimate — devis acheteur (public) ────
// L'acheteur choisit un pays (et éventuellement une ville) de destination sur
// la fiche annonce — voir IEListingDetail.jsx. Réservé aux annonces déjà
// approuvées (même règle de visibilité que getListingById).
export const getListingCostEstimate = async (req, res) => {
  try {
    const { destCountry, destCity } = req.query;
    if (!destCountry) return res.status(400).json({ message: "Pays de destination requis." });

    const listing = await ImportExportListing.findById(req.params.id).select("price currency sourceCountry year status").lean();
    if (!listing) return res.status(404).json({ message: "Annonce introuvable." });
    if (listing.status !== "approved") return res.status(404).json({ message: "Annonce introuvable." });

    const result = await computeImportCost({
      vehiclePrice:  listing.price,
      currency:      listing.currency,
      sourceCountry: listing.sourceCountry,
      vehicleYear:   listing.year,
      destCountry,
      destCity,
    });
    res.json(result);
  } catch (err) {
    logger.error("getListingCostEstimate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Barèmes pays (ImportCostConfig)
// ═══════════════════════════════════════════════════════════════════════════
export const getCostConfigs = async (req, res) => {
  try {
    const configs = await ImportCostConfig.find().sort({ country: 1 }).lean();
    res.json({ configs });
  } catch (err) {
    logger.error("getCostConfigs:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

const COST_CONFIG_FIELDS = [
  "country", "customsDutyPercent", "vatPercent", "transitFixedFeeUSD", "redevancesFixedFeeUSD",
  "portFeesFixedUSD", "deliveryFixedFeeUSD", "insurancePercent", "defaultSeaFreightUSD",
  "ageSurchargeThresholdYears", "ageSurchargePercent", "active",
];

export const upsertCostConfig = async (req, res) => {
  try {
    const { country } = req.body;
    if (!country) return res.status(400).json({ message: "Pays requis." });

    const payload = {};
    for (const key of COST_CONFIG_FIELDS) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    payload.updatedBy = req.user._id;

    const config = await ImportCostConfig.findOneAndUpdate(
      { country: new RegExp(`^${country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      payload,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ config });
  } catch (err) {
    logger.error("upsertCostConfig:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Un barème existe déjà pour ce pays." });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deleteCostConfig = async (req, res) => {
  try {
    await ImportCostConfig.findByIdAndDelete(req.params.id);
    res.json({ message: "Barème supprimé." });
  } catch (err) {
    logger.error("deleteCostConfig:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — Liaisons de fret (ShippingLaneRate)
// ═══════════════════════════════════════════════════════════════════════════
export const getLaneRates = async (req, res) => {
  try {
    const lanes = await ShippingLaneRate.find().sort({ sourceCountry: 1, destCountry: 1 }).lean();
    res.json({ lanes });
  } catch (err) {
    logger.error("getLaneRates:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const createLaneRate = async (req, res) => {
  try {
    const { sourceCountry, destCountry, seaFreightUSD } = req.body;
    if (!sourceCountry || !destCountry || !seaFreightUSD) {
      return res.status(400).json({ message: "Pays d'origine, pays de destination et tarif de fret requis." });
    }
    const lane = await ShippingLaneRate.create({
      sourceCountry, destCountry,
      seaFreightUSD: Number(seaFreightUSD),
      inlandTransportUSD: req.body.inlandTransportUSD != null ? Number(req.body.inlandTransportUSD) : undefined,
      carrier: req.body.carrier || null,
      estimatedDelayDays: req.body.estimatedDelayDays ? Number(req.body.estimatedDelayDays) : null,
      updatedBy: req.user._id,
    });
    res.status(201).json({ lane });
  } catch (err) {
    logger.error("createLaneRate:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Cette liaison existe déjà." });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

const LANE_FIELDS = ["seaFreightUSD", "inlandTransportUSD", "carrier", "estimatedDelayDays", "active"];

export const updateLaneRate = async (req, res) => {
  try {
    const payload = {};
    for (const key of LANE_FIELDS) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    payload.updatedBy = req.user._id;
    const lane = await ShippingLaneRate.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!lane) return res.status(404).json({ message: "Liaison introuvable." });
    res.json({ lane });
  } catch (err) {
    logger.error("updateLaneRate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const deleteLaneRate = async (req, res) => {
  try {
    await ShippingLaneRate.findByIdAndDelete(req.params.id);
    res.json({ message: "Liaison supprimée." });
  } catch (err) {
    logger.error("deleteLaneRate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
