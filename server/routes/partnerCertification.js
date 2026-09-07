import { Router } from "express";
import { authenticate as protect, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
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
router.get("/admin/list",                         protect, authorizeAdmin, requireAdminScope("partners"), cert.adminList);
router.get("/admin/:userId",                      protect, authorizeAdmin, requireAdminScope("partners"), vidUser, cert.adminDetail);
router.patch("/admin/:userId/level/:level/review",protect, authorizeAdmin, requireAdminScope("partners"), vidUser, cert.adminReviewLevel);
router.patch("/admin/:userId/badge",              protect, authorizeAdmin, requireAdminScope("partners"), vidUser, cert.adminAssignBadge);
router.post("/admin/:userId/relance",             protect, authorizeAdmin, requireAdminScope("partners"), vidUser, cert.adminRelance);

export default router;
