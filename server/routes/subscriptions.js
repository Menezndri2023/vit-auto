import express from "express";
import {
  getMySubscription,
  activatePlan,
  purchaseBoost,
  getPendingSubscriptionRequests,
  adminApprovePlanPayment,
  adminRejectPlanPayment,
  adminApproveBoost,
  getPartnerInsights,
} from "../controllers/subscriptionController.js";
import { authenticate as protect, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// Tarifs publics : voir GET /api/pricing/config (server/routes/pricing.js) —
// remplace l'ancien GET /api/subscriptions/pricing (mort côté UI, jamais appelé).

// Protégé (vendeur connecté)
router.get("/me",            protect, getMySubscription);
// Statistiques de performance — le contrôleur vérifie lui-même l'abonnement
// actif et répond 403 avec un message explicite, plutôt qu'un middleware
// générique : le partenaire doit savoir CE QUI l'en sépare.
router.get("/insights",      protect, getPartnerInsights);
router.post("/activate-plan", protect, activatePlan);
router.post("/boost",         protect, purchaseBoost);

// Admin — confirmation manuelle des paiements (pas de prestataire réel branché)
// Bug réel corrigé (audit exhaustif routes) : seul routeur admin du dépôt sans
// validateObjectId() — un identifiant malformé déclenchait un CastError
// Mongoose non intercepté, remontant en 500 avec le message d'erreur brut
// Mongoose renvoyé au client au lieu d'un 400 propre.
router.get("/admin/pending",                                    protect, authorizeAdmin, requireAdminScope("finance"), getPendingSubscriptionRequests);
router.patch("/admin/:subscriptionId/plan/:paymentId/approve",  protect, authorizeAdmin, requireAdminScope("finance"), validateObjectId("subscriptionId", "paymentId"), adminApprovePlanPayment);
router.patch("/admin/:subscriptionId/plan/:paymentId/reject",   protect, authorizeAdmin, requireAdminScope("finance"), validateObjectId("subscriptionId", "paymentId"), adminRejectPlanPayment);
router.patch("/admin/:subscriptionId/boost/:boostId/approve",   protect, authorizeAdmin, requireAdminScope("finance"), validateObjectId("subscriptionId", "boostId"), adminApproveBoost);

export default router;
