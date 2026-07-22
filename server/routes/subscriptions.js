import express from "express";
import {
  getMySubscription,
  activatePlan,
  purchaseBoost,
  getPendingSubscriptionRequests,
  adminApprovePlanPayment,
  adminRejectPlanPayment,
  adminApproveBoost,
} from "../controllers/subscriptionController.js";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// Tarifs publics : voir GET /api/pricing/config (server/routes/pricing.js) —
// remplace l'ancien GET /api/subscriptions/pricing (mort côté UI, jamais appelé).

// Protégé (vendeur connecté)
router.get("/me",            protect, getMySubscription);
router.post("/activate-plan", protect, activatePlan);
router.post("/boost",         protect, purchaseBoost);

// Admin — confirmation manuelle des paiements (pas de prestataire réel branché)
router.get("/admin/pending",                                    protect, authorizeAdmin, getPendingSubscriptionRequests);
router.patch("/admin/:subscriptionId/plan/:paymentId/approve",  protect, authorizeAdmin, adminApprovePlanPayment);
router.patch("/admin/:subscriptionId/plan/:paymentId/reject",   protect, authorizeAdmin, adminRejectPlanPayment);
router.patch("/admin/:subscriptionId/boost/:boostId/approve",   protect, authorizeAdmin, adminApproveBoost);

export default router;
