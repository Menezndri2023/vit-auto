import express from "express";
import * as ic from "../controllers/importCostController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();
// Barèmes de coût d'importation et tarifs de fret — mêmes routes financières
// que /api/bookings/admin/financing (scope "finance"), incohérence corrigée
// (bug réel trouvé en audit : n'importe quel admin, même scope "support",
// pouvait jusqu'ici modifier ces tarifs).
const finance = requireAdminScope("finance");

// ── Public — devis acheteur sur une annonce ──────────────────────────────
router.get("/listings/:id/estimate", vid, ic.getListingCostEstimate);

// ── Admin — barèmes pays ─────────────────────────────────────────────────
router.get   ("/admin/configs",     authenticate, authorizeAdmin, finance, ic.getCostConfigs);
router.post  ("/admin/configs",     authenticate, authorizeAdmin, finance, ic.upsertCostConfig);
router.delete("/admin/configs/:id", vid, authenticate, authorizeAdmin, finance, ic.deleteCostConfig);

// ── Admin — liaisons de fret ─────────────────────────────────────────────
router.get   ("/admin/lanes",     authenticate, authorizeAdmin, finance, ic.getLaneRates);
router.post  ("/admin/lanes",     authenticate, authorizeAdmin, finance, ic.createLaneRate);
router.patch ("/admin/lanes/:id", vid, authenticate, authorizeAdmin, finance, ic.updateLaneRate);
router.delete("/admin/lanes/:id", vid, authenticate, authorizeAdmin, finance, ic.deleteLaneRate);

export default router;
