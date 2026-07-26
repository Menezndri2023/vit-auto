import express from "express";
import { rateLimit } from "express-rate-limit";
import * as u from "../controllers/usersController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
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
router.get("/",                authenticate, authorizeAdmin, u.getUsers);
router.get("/stats",           authenticate, authorizeAdmin, u.getAdminStats);
router.get("/pending-identity",authenticate, authorizeAdmin, u.getPendingIdentities);
router.get("/admin/accounts",  authenticate, authorizeAdmin, u.getAdminAccounts);
router.patch("/admin/:id/scope", authenticate, authorizeAdmin, validateObjectId(), u.updateAdminScope);
router.get("/:id",             authenticate, authorizeAdmin, validateObjectId(), u.getUser);
router.get("/:id/trust-overview", authenticate, authorizeAdmin, validateObjectId(), u.getUserTrustOverview);
router.patch("/:id/role",      authenticate, authorizeAdmin, validateObjectId(), u.updateUserRole);
router.patch("/:id/toggle",    authenticate, authorizeAdmin, validateObjectId(), u.toggleUserActive);
router.patch("/:id/verify-identity", authenticate, authorizeAdmin, validateObjectId(), u.adminVerifyIdentity);
router.delete("/:id",          authenticate, authorizeAdmin, validateObjectId(), u.deleteUser);

export default router;
