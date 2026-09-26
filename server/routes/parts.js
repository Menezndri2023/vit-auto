import express from "express";
import * as p from "../controllers/partController.js";
import { authenticate, optionalAuth, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { exigeOutil } from "../services/planAccess.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", p.getParts);

// ── Partenaire authentifié ────────────────────────────────
router.post("/", authenticate, p.createPart);
router.get("/mine", authenticate, p.getMyParts);
router.post("/bulk-delete", authenticate, p.bulkDeleteParts);
// Import en masse CSV/XLSX (fichier en base64, voir importParts).
//
// Outil du palier Business (`importCatalogue`) depuis le 2026-09-26 : un stock
// de pièces se compte en centaines de références, et c'est précisément ce qui
// justifie un palier payant pour ce secteur — ouvert le 2026-09-14, il n'avait
// jusque-là rien à vendre. L'immunité de lancement s'applique comme aux autres
// outils : personne ne le perd aujourd'hui.
router.post("/import", authenticate, exigeOutil("importCatalogue"), p.importParts);

// ── Admin ─────────────────────────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, requireAdminScope("catalogue"), p.getPendingParts);
router.patch("/:id/status", authenticate, authorizeAdmin, requireAdminScope("catalogue"), validateObjectId(), p.updatePartStatus);

// ── Détail / devis / édition / suppression ────────────────
router.get("/:id/shipping-quote", validateObjectId(), p.quoteShipping);
router.get("/:id", validateObjectId(), optionalAuth, p.getPartById);
router.patch("/:id", authenticate, validateObjectId(), p.updatePart);
router.delete("/:id", authenticate, validateObjectId(), p.deletePart);

export default router;
