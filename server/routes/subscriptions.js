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
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// Tarifs publics : voir GET /api/pricing/config (server/routes/pricing.js) —
// remplace l'ancien GET /api/subscriptions/pricing (mort côté UI, jamais appelé).

// Protégé (vendeur connecté)
router.get("/me",            protect, getMySubscription);
router.post("/activate-plan", protect, activatePlan);
router.post("/boost",         protect, purchaseBoost);

// Admin — confirmation manuelle des paiements (pas de prestataire réel branché)
// Bug réel corrigé (audit exhaustif routes) : seul routeur admin du dépôt sans
// validateObjectId() — un identifiant malformé déclenchait un CastError
// Mongoose non intercepté, remontant en 500 avec le message d'erreur brut
// Mongoose renvoyé au client au lieu d'un 400 propre.
router.get("/admin/pending",                                    protect, authorizeAdmin, getPendingSubscriptionRequests);
router.patch("/admin/:subscriptionId/plan/:paymentId/approve",  protect, authorizeAdmin, validateObjectId("subscriptionId", "paymentId"), adminApprovePlanPayment);
router.patch("/admin/:subscriptionId/plan/:paymentId/reject",   protect, authorizeAdmin, validateObjectId("subscriptionId", "paymentId"), adminRejectPlanPayment);
router.patch("/admin/:subscriptionId/boost/:boostId/approve",   protect, authorizeAdmin, validateObjectId("subscriptionId", "boostId"), adminApproveBoost);

export default router;
