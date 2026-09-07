import express from "express";
import { rateLimit } from "express-rate-limit";
import * as u from "../controllers/usersController.js";
import { authenticate, authorizeAdmin, requireAdminScope, requireGeneralAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { validate } from "../middleware/validate.js";
import { requestEmailChangeSchema, deactivateAccountSchema } from "../validators/auth.validators.js";

const router = express.Router();

// Même limiteur que les actions sensibles d'auth (mot de passe requis à chaque appel)
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { message: "Trop de tentatives. Réessayez dans 1 heure." },
  standardHeaders: true, legacyHeaders: false,
});

// ── Utilisateur connecté ───────────────────────────────────────────────────
router.get("/me",              authenticate, u.getMyProfile);
router.patch("/me",            authenticate, u.updateMyProfile);
router.post("/me/identity",    authenticate, u.submitIdentity);
router.post("/me/email-change", strictLimiter, authenticate, validate(requestEmailChangeSchema), u.requestEmailChange);
router.post("/me/deactivate",   strictLimiter, authenticate, validate(deactivateAccountSchema), u.deactivateMyAccount);

// ── Profil partenaire public (page PartnerProfile.jsx) ─────────────────────
router.get("/:id/public",      validateObjectId(), u.getPublicProfile);

// ── Admin ─────────────────────────────────────────────────────────────────
// Permissions assignées (2026-09) : la gestion des comptes relève du scope
// "users", les pièces d'identité du scope "kyc", et tout ce qui touche aux
// comptes ADMIN eux-mêmes est réservé à l'administrateur général.
router.get("/",                authenticate, authorizeAdmin, requireAdminScope("users"), u.getUsers);
router.get("/stats",           authenticate, authorizeAdmin, u.getAdminStats);
router.get("/pending-identity",authenticate, authorizeAdmin, requireAdminScope("kyc"), u.getPendingIdentities);
// Bug réel corrigé (audit sécurité) : aucune vérification de scope — un admin
// scopé uniquement "support"/"moderation" pouvait lister tous les comptes
// admin (emails, scopes). requireAdminScope("super_admin") reproduit
// exactement la garde déjà appliquée manuellement ailleurs dans ce contrôleur
// (adminScope=[] = accès complet, comportement historique inchangé).
router.get("/admin/accounts",  authenticate, authorizeAdmin, requireGeneralAdmin, u.getAdminAccounts);
router.patch("/admin/:id/scope", authenticate, authorizeAdmin, requireGeneralAdmin, validateObjectId(), u.updateAdminScope);
router.get("/:id",             authenticate, authorizeAdmin, requireAdminScope("users"), validateObjectId(), u.getUser);
router.get("/:id/trust-overview", authenticate, authorizeAdmin, requireAdminScope("users"), validateObjectId(), u.getUserTrustOverview);
router.patch("/:id/role",      authenticate, authorizeAdmin, requireAdminScope("users"), validateObjectId(), u.updateUserRole);
router.patch("/:id/phone",     authenticate, authorizeAdmin, requireAdminScope("users"), validateObjectId(), u.adminUpdatePhone);
router.patch("/:id/toggle",    authenticate, authorizeAdmin, requireAdminScope("users"), validateObjectId(), u.toggleUserActive);
router.patch("/:id/verify-identity", authenticate, authorizeAdmin, requireAdminScope("kyc"), validateObjectId(), u.adminVerifyIdentity);
router.delete("/:id",          authenticate, authorizeAdmin, requireAdminScope("users"), validateObjectId(), u.deleteUser);

export default router;
