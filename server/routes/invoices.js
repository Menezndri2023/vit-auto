import express from "express";
import * as inv from "../controllers/invoiceController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { generateInvoicePDF } from "../utils/pdfGenerator.js";
import Invoice from "../models/Invoice.js";

const router = express.Router();

// ── Partenaire ────────────────────────────────────────────
router.get("/mine",          authenticate,               inv.getMyInvoices);
router.get("/transactions",  authenticate,               inv.getPartnerTransactions);

// ── Détail d'une facture (partenaire propriétaire ou admin) ───────────────
router.get("/:id",           authenticate,               async (req, res) => {
  try {
    if (!req.params.id.match(/^[a-f\d]{24}$/i)) {
      return res.status(404).json({ message: "Facture introuvable." });
    }
    const invoice = await Invoice.findById(req.params.id)
      .populate("partner", "firstName lastName email phone");
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    const isOwner = invoice.partner?._id?.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
});

// ── PDF facture téléchargeable ─────────────────────────────
router.get("/:id/pdf",       authenticate,               async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("partner", "firstName lastName email phone");
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    const isOwner = invoice.partner?._id?.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) return res.status(403).json({ message: "Accès refusé." });
    generateInvoicePDF(invoice, res);
  } catch (err) { res.status(500).json({ message: "Erreur génération PDF." }); }
});

// ── Admin ─────────────────────────────────────────────────
router.get("/",              authenticate, authorizeAdmin, inv.getAllInvoices);
router.post("/generate",     authenticate, authorizeAdmin, inv.generatePartnerInvoice);
router.post("/generate-all", authenticate, authorizeAdmin, inv.generateAllMonthlyInvoices);
router.patch("/:id/paid",    authenticate, authorizeAdmin, inv.markInvoicePaid);
router.get("/commissions",   authenticate, authorizeAdmin, inv.getAdminCommissions);

export default router;
