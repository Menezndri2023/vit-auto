import express from "express";
import { authenticate as protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  getPMSOverview,
  getLeads, createLead, getLead, updateLead, deleteLead, addLeadFollowUp, addLeadMessage,
  getQuotes, createQuote, getQuote, updateQuote, sendQuote, deleteQuote,
  getMyShowroom, upsertShowroom, publishShowroom,
  getPublicShowroom, getPublicShowrooms,
  getPerformanceScore,
  getAdminPMSStats, getAdminShowrooms, adminToggleShowroom,
} from "../controllers/pmsController.js";

const router = express.Router();

// ── Routes publiques (annuaire showrooms) ─────────────────────────────────
router.get("/showrooms",           getPublicShowrooms);
router.get("/showrooms/:id",       getPublicShowroom);

// ── Middleware : partenaire ou admin ─────────────────────────────────────
const requirePartner = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Non authentifié" });
  if (!["partenaire", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Accès réservé aux partenaires" });
  }
  next();
};

const isPartner = [protect, requirePartner];

// Vue d'ensemble dashboard PMS
router.get("/overview", isPartner, getPMSOverview);

const vid = validateObjectId();

// Leads
router.get   ("/leads",               isPartner, getLeads);
router.post  ("/leads",               isPartner, createLead);
router.get   ("/leads/:id",           vid, isPartner, getLead);
router.put   ("/leads/:id",           vid, isPartner, updateLead);
router.delete("/leads/:id",           vid, isPartner, deleteLead);
router.post  ("/leads/:id/followup",  vid, isPartner, addLeadFollowUp);
router.post  ("/leads/:id/message",   vid, isPartner, addLeadMessage);

// Devis
router.get   ("/quotes",              isPartner, getQuotes);
router.post  ("/quotes",              isPartner, createQuote);
router.get   ("/quotes/:id",          vid, isPartner, getQuote);
router.put   ("/quotes/:id",          vid, isPartner, updateQuote);
router.post  ("/quotes/:id/send",     vid, isPartner, sendQuote);
router.delete("/quotes/:id",          vid, isPartner, deleteQuote);

// Showroom
router.get   ("/showroom/me",         isPartner, getMyShowroom);
router.put   ("/showroom/me",         isPartner, upsertShowroom);
router.post  ("/showroom/me/publish", isPartner, publishShowroom);

// Performance
router.get   ("/performance",         isPartner, getPerformanceScore);

// ── Routes ADMIN ─────────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Non authentifié" });
  if (req.user.role !== "admin") return res.status(403).json({ message: "Accès admin requis" });
  next();
};
const isAdmin = [protect, requireAdmin];

router.get  ("/admin/stats",              isAdmin, getAdminPMSStats);
router.get  ("/admin/showrooms",          isAdmin, getAdminShowrooms);
router.patch("/admin/showrooms/:id/toggle", vid, isAdmin, adminToggleShowroom);

export default router;
