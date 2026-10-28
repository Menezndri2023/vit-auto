import express from "express";
import * as i from "../controllers/incotermController.js";
import { authenticate } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

// Incoterms® 2020 (2026-10-28) : référentiel et aide au choix publics ;
// conditions d'une commande réservées à son acheteur, son vendeur et l'admin.
const router = express.Router();
const vid = validateObjectId("id");

router.get ("/",                              i.referentiel);
router.post("/recommandation",                i.recommandation);
router.get ("/commandes/:type/:id",           authenticate, vid, i.lireConditions);
router.put ("/commandes/:type/:id",           authenticate, vid, i.proposerConditions);
router.post("/commandes/:type/:id/valider",   authenticate, vid, i.validerConditionsCommande);

export default router;
