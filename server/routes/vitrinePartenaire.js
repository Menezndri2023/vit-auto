// Routes du lien de vitrine partageable (voir vitrinePartenaireController.js).
import express from "express";
import * as v from "../controllers/vitrinePartenaireController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// Public : /p/:slug a besoin de traduire l'adresse lisible en identifiant.
// Aucun plan n'est vérifié ici — un lien court cesse d'être ÉMIS si le palier
// se ferme, mais un lien déjà imprimé doit continuer de fonctionner. Le
// contraire ferait d'un changement de palier une panne pour les clients du
// partenaire, qui n'y sont pour rien.
router.get("/p/:slug", v.resoudreSlug);

// Le partenaire demande sa propre vitrine.
router.get("/ma-vitrine", authenticate, v.maVitrine);

// L'administrateur partage la vitrine de n'importe quel partenaire.
router.get("/:id/vitrine", authenticate, authorizeAdmin, validateObjectId(), v.vitrineDunPartenaire);

export default router;
