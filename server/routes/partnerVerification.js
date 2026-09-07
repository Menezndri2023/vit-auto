import { Router } from "express";
import { authenticate as protect, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import * as pv from "../controllers/partnerVerificationController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();
const vidUser = validateObjectId("userId");

// ── Partenaire connecté ─────────────────────────────────────────────────────────
router.get("/me", protect, pv.getMine);

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/public/:userId", vidUser, pv.publicProfile);

// ── Administration ────────────────────────────────────────────────────────────
router.get("/admin/list",                        protect, authorizeAdmin, requireAdminScope("partners"), pv.adminList);
router.get("/admin/stats",                       protect, authorizeAdmin, requireAdminScope("partners"), pv.adminStats);
router.get("/admin/:userId",                     protect, authorizeAdmin, requireAdminScope("partners"), vidUser, pv.adminDetail);
router.post("/admin",                            protect, authorizeAdmin, requireAdminScope("partners"), pv.adminCreate);
router.patch("/admin/:userId/info",              protect, authorizeAdmin, requireAdminScope("partners"), vidUser, pv.adminUpdateInfo);
router.patch("/admin/:userId/criterion",         protect, authorizeAdmin, requireAdminScope("partners"), vidUser, pv.adminToggleCriterion);
router.patch("/admin/:userId/status",            protect, authorizeAdmin, requireAdminScope("partners"), vidUser, pv.adminUpdateStatus);
router.post("/admin/:userId/relance",            protect, authorizeAdmin, requireAdminScope("partners"), vidUser, pv.adminRelance);
router.delete("/admin/:userId",                  protect, authorizeAdmin, requireAdminScope("partners"), vidUser, pv.adminDelete);

export default router;
