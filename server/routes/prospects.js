import express from "express";
import * as p from "../controllers/prospectsController.js";
import { authenticate, authorizeAdmin, requireAnyAdminScope } from "../middleware/auth.js";

// Vue unifiée des prospects (2026-10-28) : CRM du partenaire + demandes
// d'essai apportées par VIT AUTO, sans fusion des données.
const router = express.Router();
router.get("/admin", authenticate, authorizeAdmin, requireAnyAdminScope("partners", "bookings"), p.prospectsAdmin);
router.get("/",      authenticate, p.mesProspects);
export default router;
