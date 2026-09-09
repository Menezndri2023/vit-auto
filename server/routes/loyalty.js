import express from "express";
import * as loyalty from "../controllers/loyaltyController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

router.get("/tiers",      loyalty.getLoyaltyTiers);
router.get("/me",         authenticate, loyalty.getMyLoyaltyStatus);
router.get("/me/history", authenticate, loyalty.getMyLoyaltyHistory);

// Solde et mouvements d'un client, pour l'administration (lecture seule) —
// rattaché au secteur "users" : c'est un attribut de compte client, consulté
// depuis la fiche du compte.
router.get(
  "/admin/:userId",
  authenticate,
  authorizeAdmin,
  requireAdminScope("users"),
  validateObjectId("userId"),
  loyalty.getUserLoyaltyAdmin
);

// Ajustement manuel d'un solde — secteur "finance" et non "users" : consulter
// un solde et le modifier ne sont pas le même pouvoir, puisqu'un point vaut de
// l'argent (voir loyaltyController.adjustUserLoyalty pour tous les garde-fous).
router.post(
  "/admin/:userId/adjust",
  authenticate,
  authorizeAdmin,
  requireAdminScope("finance"),
  validateObjectId("userId"),
  loyalty.adjustUserLoyalty
);

export default router;
