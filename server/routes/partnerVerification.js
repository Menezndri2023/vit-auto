import { Router } from "express";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import * as pv from "../controllers/partnerVerificationController.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/public/:userId", pv.publicProfile);

// ── Administration ────────────────────────────────────────────────────────────
router.get("/admin/list",                        protect, authorizeAdmin, pv.adminList);
router.get("/admin/stats",                       protect, authorizeAdmin, pv.adminStats);
router.get("/admin/:userId",                     protect, authorizeAdmin, pv.adminDetail);
router.post("/admin",                            protect, authorizeAdmin, pv.adminCreate);
router.patch("/admin/:userId/info",              protect, authorizeAdmin, pv.adminUpdateInfo);
router.patch("/admin/:userId/criterion",         protect, authorizeAdmin, pv.adminToggleCriterion);
router.patch("/admin/:userId/status",            protect, authorizeAdmin, pv.adminUpdateStatus);
router.delete("/admin/:userId",                  protect, authorizeAdmin, pv.adminDelete);

export default router;
