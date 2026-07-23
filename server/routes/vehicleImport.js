import express from "express";
import rateLimit from "express-rate-limit";
import * as vi from "../controllers/vehicleImportController.js";
import { authenticate } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId("batchId");

// Import de fichier/Google Sheet = ressource intensive (parsing + jusqu'à 300 lignes
// x 8 images téléchargées) — limiteur dédié, plus strict que le reste du routeur qui
// est aussi utilisé pour le polling de progression (toutes les 2s côté frontend).
const importCreateLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             20,
  message:         { message: "Trop d'imports. Réessayez dans 1 heure." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── IMPORTANT : routes statiques AVANT les routes paramétrées ────────────────
router.get("/template",  authenticate, vi.downloadTemplate);
router.post("/preview",  authenticate, importCreateLimiter, vi.previewImportFile);
router.post("/",         authenticate, importCreateLimiter, vi.createImportBatch);
router.get("/",          authenticate, vi.listImportBatches);
router.get("/:batchId",  vid, authenticate, vi.getImportBatch);

export default router;
