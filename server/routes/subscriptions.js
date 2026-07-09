import express from "express";
import {
  getMySubscription,
  activatePro,
  purchaseBoost,
  getPricing,
  getPendingSubscriptionRequests,
  adminApproveProPayment,
  adminRejectProPayment,
  adminApproveBoost,
} from "../controllers/subscriptionController.js";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// Public
router.get("/pricing", getPricing);

// Protégé (vendeur connecté)
router.get("/me",          protect, getMySubscription);
router.post("/activate-pro", protect, activatePro);
router.post("/boost",        protect, purchaseBoost);

// Admin — confirmation manuelle des paiements (pas de prestataire réel branché)
router.get("/admin/pending",                                  protect, authorizeAdmin, getPendingSubscriptionRequests);
router.patch("/admin/:subscriptionId/pro/:paymentId/approve", protect, authorizeAdmin, adminApproveProPayment);
router.patch("/admin/:subscriptionId/pro/:paymentId/reject",  protect, authorizeAdmin, adminRejectProPayment);
router.patch("/admin/:subscriptionId/boost/:boostId/approve", protect, authorizeAdmin, adminApproveBoost);

export default router;
