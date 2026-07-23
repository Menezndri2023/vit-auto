import express from "express";
import * as si from "../controllers/serviceInvoiceController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { generateServiceInvoicePDF } from "../utils/pdfGenerator.js";
import ServiceInvoice from "../models/ServiceInvoice.js";

const router = express.Router();
const vid = validateObjectId();

// ── Partenaire ────────────────────────────────────────────
router.get("/mine", authenticate, si.getMyServiceInvoices);

// ── PDF téléchargeable (partenaire propriétaire ou admin) ──
router.get("/:id/pdf", vid, authenticate, async (req, res) => {
  try {
    const invoice = await ServiceInvoice.findById(req.params.id).lean();
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    const isOwner = invoice.partner?.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé." });
    }
    generateServiceInvoicePDF(invoice, res);
  } catch { res.status(500).json({ message: "Erreur génération PDF." }); }
});

// ── Admin ─────────────────────────────────────────────────
router.get("/", authenticate, authorizeAdmin, si.getAllServiceInvoices);

export default router;
