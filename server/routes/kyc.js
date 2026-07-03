import { Router } from "express";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import * as kyc from "../controllers/kycController.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = Router();

// ── Utilisateur connecté ──────────────────────────────────────────────────────
router.get("/status",                 protect, kyc.getKycStatus);
router.post("/submit",                protect, kyc.submitKyc);
router.post("/submit-driver-license", protect, kyc.submitDriverLicense);
router.delete("/reset",               protect, kyc.resetKyc);

// ── Administration ────────────────────────────────────────────────────────────
router.get("/admin/list",             protect, authorizeAdmin, kyc.getKycList);
router.get("/admin/:userId",          protect, authorizeAdmin, validateObjectId("userId"), kyc.getKycDetail);
router.patch("/admin/:userId/review", protect, authorizeAdmin, validateObjectId("userId"), kyc.adminReviewKyc);

export default router;
