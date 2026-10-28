import { Router } from "express";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { getAnalytics } from "../controllers/analyticsController.js";
import { tableauDirection, listeActivation } from "../controllers/directionController.js";

const router = Router();

router.get("/admin", authenticate, authorizeAdmin, requireAdminScope("finance"), getAnalytics);
// Tableau de bord de direction (prompt maître §13) et suivi de l'activation
// des partenaires (§6) — 2026-10-28.
router.get("/direction",  authenticate, authorizeAdmin, requireAdminScope("finance"), tableauDirection);
router.get("/activation", authenticate, authorizeAdmin, requireAdminScope("finance"), listeActivation);

export default router;
