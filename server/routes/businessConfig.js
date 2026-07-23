import express from "express";
import * as bc from "../controllers/businessConfigController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();
const financeOnly = [authenticate, authorizeAdmin, requireAdminScope("finance")];

// ── PricingConfig (commissions, abonnements, boosts, frais de service, services, pubs) ──
router.get   ("/pricing",           ...financeOnly, bc.getPricingConfig);
router.patch ("/pricing/:section",  ...financeOnly, bc.updatePricingSection);

// ── ExchangeRate ──────────────────────────────────────────────────────────
router.get   ("/exchange-rates",     ...financeOnly, bc.getExchangeRates);
router.post  ("/exchange-rates",     ...financeOnly, bc.upsertExchangeRate);
router.delete("/exchange-rates/:id", vid, ...financeOnly, bc.deleteExchangeRate);

// ── CountryConfig ─────────────────────────────────────────────────────────
router.get   ("/countries",     ...financeOnly, bc.getCountryConfigs);
router.post  ("/countries",     ...financeOnly, bc.upsertCountryConfig);
router.delete("/countries/:id", vid, ...financeOnly, bc.deleteCountryConfig);

// ── DiscountCampaign (codes promo abonnements/boosts) ────────────────────
router.get   ("/discount-campaigns",     ...financeOnly, bc.getDiscountCampaigns);
router.post  ("/discount-campaigns",     ...financeOnly, bc.upsertDiscountCampaign);
router.delete("/discount-campaigns/:id", vid, ...financeOnly, bc.deleteDiscountCampaign);

export default router;
