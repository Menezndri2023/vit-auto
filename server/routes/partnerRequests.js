import express from "express";
import { listOpenRequests, declareInterest } from "../controllers/partnerRequestsController.js";
import { authenticate as protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// Ouvert à tout partenaire connecté : l'abonnement donne une AVANCE sur les
// demandes récentes, vérifiée dans le contrôleur, pas le droit d'y accéder.
router.get("/",              protect, listOpenRequests);
router.post("/:id/interest", protect, validateObjectId("id"), declareInterest);

export default router;
