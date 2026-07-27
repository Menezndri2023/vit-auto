import express from "express";
import * as sc from "../controllers/siteContentController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET public — lu par HeroSection.jsx au chargement de la page d'accueil.
router.get   ("/hero", sc.getHero);
router.patch ("/hero", authenticate, authorizeAdmin, sc.updateHero);

export default router;
