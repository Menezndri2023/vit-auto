import { Router } from "express";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import * as kyc from "../controllers/kycController.js";

const router = Router();

// ── Utilisateur connecté ──────────────────────────────────────────────────────
router.get("/status",                 protect, kyc.getKycStatus);
router.post("/submit",                protect, kyc.submitKyc);
router.post("/submit-driver-license", protect, kyc.submitDriverLicense);
router.delete("/reset",               protect, kyc.resetKyc);

// ── Administration (protect + authorizeAdmin = double vérification) ───────────
router.get("/admin/list",             protect, authorizeAdmin, kyc.getKycList);
router.get("/admin/:userId",          protect, authorizeAdmin, kyc.getKycDetail);
router.patch("/admin/:userId/review", protect, authorizeAdmin, kyc.adminReviewKyc);

export default router;
