import { Router } from "express";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import * as pv from "../controllers/partnerVerificationController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();
const vidUser = validateObjectId("userId");

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/public/:userId", vidUser, pv.publicProfile);

// ── Administration ────────────────────────────────────────────────────────────
router.get("/admin/list",                        protect, authorizeAdmin, pv.adminList);
router.get("/admin/stats",                       protect, authorizeAdmin, pv.adminStats);
router.get("/admin/:userId",                     protect, authorizeAdmin, vidUser, pv.adminDetail);
router.post("/admin",                            protect, authorizeAdmin, pv.adminCreate);
router.patch("/admin/:userId/info",              protect, authorizeAdmin, vidUser, pv.adminUpdateInfo);
router.patch("/admin/:userId/criterion",         protect, authorizeAdmin, vidUser, pv.adminToggleCriterion);
router.patch("/admin/:userId/status",            protect, authorizeAdmin, vidUser, pv.adminUpdateStatus);
router.post("/admin/:userId/relance",            protect, authorizeAdmin, vidUser, pv.adminRelance);
router.delete("/admin/:userId",                  protect, authorizeAdmin, vidUser, pv.adminDelete);

export default router;
