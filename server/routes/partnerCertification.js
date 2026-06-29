import { Router } from "express";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import * as cert from "../controllers/partnerCertificationController.js";

const router = Router();

// ── Partenaire connecté ───────────────────────────────────────────────────────
router.get("/status",               protect, cert.getStatus);
router.post("/level/:level",        protect, cert.submitLevel);

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/public/:userId",       cert.publicProfile);

// ── Administration ────────────────────────────────────────────────────────────
router.get("/admin/list",                         protect, authorizeAdmin, cert.adminList);
router.get("/admin/:userId",                      protect, authorizeAdmin, cert.adminDetail);
router.patch("/admin/:userId/level/:level/review",protect, authorizeAdmin, cert.adminReviewLevel);
router.patch("/admin/:userId/badge",              protect, authorizeAdmin, cert.adminAssignBadge);

export default router;
