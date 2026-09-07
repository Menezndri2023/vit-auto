import express from "express";
import * as inv from "../controllers/invoiceController.js";
import { authenticate, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { generateInvoicePDF } from "../utils/pdfGenerator.js";
import Invoice from "../models/Invoice.js";

const router = express.Router();
const vid = validateObjectId();

// ── Partenaire ────────────────────────────────────────────
router.get("/mine",          authenticate,               inv.getMyInvoices);
router.get("/transactions",  authenticate,               inv.getPartnerTransactions);

// ── Commissions consolidées (admin) ───────────────────────────────────────
// DÉCLARÉE AVANT "/:id" : Express matche dans l'ordre, donc placée après elle
// la chaîne littérale "commissions" était capturée comme un id et rejetée par
// validateObjectId (400) — le tableau des commissions de l'admin affichait
// zéro en permanence, indiscernable d'un mois sans revenu.
router.get("/commissions",   authenticate, authorizeAdmin, requireAdminScope("finance"), inv.getAdminCommissions);

// ── Détail d'une facture (partenaire propriétaire ou admin) ───────────────
router.get("/:id",           vid, authenticate,               async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("partner", "firstName lastName email phone")
      .populate("businessId", "companyName");
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
router.get("/:id/pdf",       vid, authenticate,               async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("partner", "firstName lastName email phone")
      .populate("businessId", "companyName");
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    const isOwner = invoice.partner?._id?.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) return res.status(403).json({ message: "Accès refusé." });
    generateInvoicePDF(invoice, res);
  } catch (err) { res.status(500).json({ message: "Erreur génération PDF." }); }
});

// ── Admin ─────────────────────────────────────────────────
router.get("/",              authenticate, authorizeAdmin, requireAdminScope("finance"), inv.getAllInvoices);
router.post("/generate",     authenticate, authorizeAdmin, requireAdminScope("finance"), inv.generatePartnerInvoice);
router.post("/generate-all", authenticate, authorizeAdmin, requireAdminScope("finance"), inv.generateAllMonthlyInvoices);
router.patch("/:id/paid",    vid, authenticate, authorizeAdmin, requireAdminScope("finance"), inv.markInvoicePaid);

export default router;
