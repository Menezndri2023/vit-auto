import { Router } from "express";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import * as litiges from "../controllers/litigeController.js";

// Réclamations de toutes les transactions (2026-11-01) : Import/Export,
// réservations, demandes logistiques. Les secteurs d'un admin à accès assigné
// sont vérifiés par type de transaction, dans le service.
const router = Router();

router.get   ("/",                         authenticate, authorizeAdmin, litiges.listerLitiges);
router.get   ("/cible/:type/:id",          authenticate, litiges.listerLitigesCible);
router.post  ("/:litigeId/messages",       authenticate, litiges.idLitigeValide, litiges.message);
router.post  ("/:litigeId/pieces",         authenticate, litiges.idLitigeValide, litiges.piece);
router.patch ("/:litigeId/etat",           authenticate, authorizeAdmin, litiges.idLitigeValide, litiges.transition);

export default router;
