import express from "express";
import * as ic from "../controllers/importCostController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

// ── Public — devis acheteur sur une annonce ──────────────────────────────
router.get("/listings/:id/estimate", vid, ic.getListingCostEstimate);

// ── Admin — barèmes pays ─────────────────────────────────────────────────
router.get   ("/admin/configs",     authenticate, authorizeAdmin, ic.getCostConfigs);
router.post  ("/admin/configs",     authenticate, authorizeAdmin, ic.upsertCostConfig);
router.delete("/admin/configs/:id", vid, authenticate, authorizeAdmin, ic.deleteCostConfig);

// ── Admin — liaisons de fret ─────────────────────────────────────────────
router.get   ("/admin/lanes",     authenticate, authorizeAdmin, ic.getLaneRates);
router.post  ("/admin/lanes",     authenticate, authorizeAdmin, ic.createLaneRate);
router.patch ("/admin/lanes/:id", vid, authenticate, authorizeAdmin, ic.updateLaneRate);
router.delete("/admin/lanes/:id", vid, authenticate, authorizeAdmin, ic.deleteLaneRate);

export default router;
