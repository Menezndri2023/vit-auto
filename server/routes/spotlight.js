import express from "express";
import { getSpotlight, getSpotlightRules, updateSpotlightRules } from "../controllers/spotlightController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// Règles de mise en avant par pays — administration seulement, déclarées
// AVANT « /:emplacement » sinon « regles » serait pris pour un emplacement.
router.get("/regles", authenticate, authorizeAdmin, getSpotlightRules);
router.put("/regles", authenticate, authorizeAdmin, updateSpotlightRules);

// Public et non authentifié : c'est la page d'accueil. Le contenu est
// identique pour tous les visiteurs d'un même pays, et déjà mis en cache par le
// moteur.
router.get("/:emplacement", getSpotlight);

export default router;
