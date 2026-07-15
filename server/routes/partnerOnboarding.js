import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate as protect, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  getMyOnboarding,
  applyToProgram,
  updateSection,
  updatePartnerType,
  updateLegalEntityType,
  acceptLegalDocuments,
  submitApplication,
  signLOI,
  signAgreement,
  verifySigningToken,
  signByToken,
  downloadLOIPDF,
  downloadAgreementPDF,
  getAvailability,
  adminList,
  adminStats,
  adminGetOne,
  adminApprove,
  adminSendAgreement,
  adminReject,
  adminRequestInfo,
  adminUpdateStatus,
  adminUpdateCRM,
} from "../controllers/partnerOnboardingController.js";

const router = Router();

// ── Middleware accès partenaire ou admin ──────────────────────────────────────
const requirePartner = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Non authentifié." });
  if (!["partenaire", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Accès réservé aux partenaires." });
  }
  next();
};
const isPartner = [protect, requirePartner];
const isAdmin   = [protect, authorizeAdmin];

// PATCH /section/:sectionName transporte des documents/photos en base64 (ressource
// intensive) — seule cette route reste sous un limiteur strict, contrairement à /my et
// /availability qui sont pollées/rechargées fréquemment par le portail.
const sectionUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { message: "Trop de soumissions. Réessayez dans 1 heure." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Routes publiques (lien sécurisé — token = authentification) ───────────────
router.get  ("/sign-token/:token",            verifySigningToken);
router.post ("/sign-by-token/:token",         signByToken);
router.get  ("/availability",                 getAvailability);

// ── Routes partenaire (self-service) ─────────────────────────────────────────
// GET /my est en lecture seule (404 si aucun dossier) — la création (et la promotion
// de rôle qui va avec) exige l'action explicite POST /apply, jamais un simple GET.
router.get  ("/my",                           protect, getMyOnboarding);
router.post ("/apply",                        protect, applyToProgram);
router.get  ("/my/loi/pdf",                   isPartner, downloadLOIPDF);
router.get  ("/my/agreement/pdf",             isPartner, downloadAgreementPDF);
router.patch("/partner-type",                 isPartner, updatePartnerType);
router.patch("/legal-entity-type",            isPartner, updateLegalEntityType);
router.patch("/accept-legal",                 isPartner, acceptLegalDocuments);
router.patch("/section/:sectionName",         isPartner, sectionUploadLimiter, updateSection);
router.post ("/submit",                       isPartner, submitApplication);
router.post ("/sign-loi",                     isPartner, signLOI);
router.post ("/sign-agreement",               isPartner, signAgreement);

// ── Routes admin ──────────────────────────────────────────────────────────────
router.get  ("/admin/list",                   isAdmin, adminList);
router.get  ("/admin/stats",                  isAdmin, adminStats);
router.get  ("/admin/:id",                    isAdmin, validateObjectId(), adminGetOne);
router.post ("/admin/:id/approve",            isAdmin, validateObjectId(), adminApprove);
router.post ("/admin/:id/send-agreement",     isAdmin, validateObjectId(), adminSendAgreement);
router.post ("/admin/:id/reject",             isAdmin, validateObjectId(), adminReject);
router.post ("/admin/:id/request-info",       isAdmin, validateObjectId(), adminRequestInfo);
router.patch("/admin/:id/status",             isAdmin, validateObjectId(), adminUpdateStatus);
router.patch("/admin/:id/crm",               isAdmin, validateObjectId(), adminUpdateCRM);

export default router;
