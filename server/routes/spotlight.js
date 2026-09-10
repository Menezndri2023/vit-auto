import express from "express";
import { getSpotlight } from "../controllers/spotlightController.js";

const router = express.Router();

// Public et non authentifié : c'est la page d'accueil. Le contenu est
// identique pour tous les visiteurs d'un même pays, et déjà mis en cache par le
// moteur.
router.get("/:emplacement", getSpotlight);

export default router;
