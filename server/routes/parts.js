import express from "express";
import * as p from "../controllers/partController.js";
import { authenticate, optionalAuth, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", p.getParts);

// ── Partenaire authentifié ────────────────────────────────
router.post("/", authenticate, p.createPart);
router.get("/mine", authenticate, p.getMyParts);
router.post("/bulk-delete", authenticate, p.bulkDeleteParts);

// ── Admin ─────────────────────────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, requireAdminScope("catalogue"), p.getPendingParts);
router.patch("/:id/status", authenticate, authorizeAdmin, requireAdminScope("catalogue"), validateObjectId(), p.updatePartStatus);

// ── Détail / devis / édition / suppression ────────────────
router.get("/:id/shipping-quote", validateObjectId(), p.quoteShipping);
router.get("/:id", validateObjectId(), optionalAuth, p.getPartById);
router.patch("/:id", authenticate, validateObjectId(), p.updatePart);
router.delete("/:id", authenticate, validateObjectId(), p.deletePart);

export default router;
