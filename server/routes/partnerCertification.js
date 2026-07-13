import { Router } from "express";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import * as cert from "../controllers/partnerCertificationController.js";

const router = Router();
const vidUser = validateObjectId("userId");

// ── Partenaire connecté ───────────────────────────────────────────────────────
router.get("/status",               protect, cert.getStatus);
router.post("/level/:level",        protect, cert.submitLevel);

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/public/:userId",       vidUser, cert.publicProfile);

// ── Administration ────────────────────────────────────────────────────────────
router.get("/admin/list",                         protect, authorizeAdmin, cert.adminList);
router.get("/admin/:userId",                      protect, authorizeAdmin, vidUser, cert.adminDetail);
router.patch("/admin/:userId/level/:level/review",protect, authorizeAdmin, vidUser, cert.adminReviewLevel);
router.patch("/admin/:userId/badge",              protect, authorizeAdmin, vidUser, cert.adminAssignBadge);

export default router;
