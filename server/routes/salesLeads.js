import express from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/salesLeadController.js";
import { authenticate as authOnly, optionalAuth, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
// Délégation d'équipe : un agent rattaché à un partenaire traite les demandes
// d'essai de son employeur (même principe que routes/bookings.js).
import { authenticateEtDeleguer as authenticate } from "../middleware/team.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { makeRateLimitStore } from "../utils/rateLimitStore.js";

const router = express.Router();
const vid = validateObjectId();
const admin = [authOnly, authorizeAdmin, requireAdminScope("bookings")];

// Formulaire public (invités compris) : écritures + notifications par appel,
// donc plafond serré par IP, distinct du apiLimiter générique.
const createLeadLimiter = rateLimit({
  store:           makeRateLimitStore("sales_leads"),
  windowMs:        60 * 60 * 1000,
  max:             10,
  message:         { message: "Trop de demandes envoyées. Réessayez dans une heure." },
  standardHeaders: true,
  legacyHeaders:   false,
  skip:            () => process.env.NODE_ENV === "test",
});

// ── Client ────────────────────────────────────────────────────────────────
router.post("/",                                   createLeadLimiter, optionalAuth, c.createLead);
router.get ("/mine",                               authOnly, c.getMyLeads);
router.get ("/public/:reference",                  optionalAuth, c.getPublicLead);
router.post("/public/:reference/alternative",      optionalAuth, c.clientRespondAlternative);
router.post("/public/:reference/follow-up",        optionalAuth, c.clientFollowUp);
router.post("/public/:reference/cancel",           optionalAuth, c.clientCancel);

// ── Partenaire ────────────────────────────────────────────────────────────
router.get ("/partner",                            authenticate, c.getPartnerLeads);
router.get ("/partner/stats",                      authenticate, c.getPartnerStats);
router.post("/:id/accept",                         vid, authenticate, c.partnerAccept);
router.post("/:id/propose-alternative",            vid, authenticate, c.partnerProposeAlternative);
router.post("/:id/refuse",                         vid, authenticate, c.partnerRefuse);
router.post("/:id/outcome",                        vid, authenticate, c.partnerOutcome);
router.post("/:id/declare-sale",                   vid, authenticate, c.partnerDeclareSale);
router.post("/:id/note",                           vid, authenticate, c.partnerNote);

// ── Admin ─────────────────────────────────────────────────────────────────
router.get ("/admin",                              ...admin, c.adminList);
router.get ("/admin/funnel",                       ...admin, c.adminFunnel);
router.get ("/:id",                                vid, ...admin, c.adminGet);
router.post("/:id/admin/qualify",                  vid, ...admin, c.adminQualify);
router.post("/:id/admin/confirm-sale",             vid, ...admin, c.adminConfirmSale);
router.post("/:id/admin/reject-sale",              vid, ...admin, c.adminRejectSale);
router.post("/:id/admin/status",                   vid, ...admin, c.adminSetStatus);
router.post("/:id/admin/assign",                   vid, ...admin, c.adminAssign);

export default router;
