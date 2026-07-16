import express from "express";
import * as u from "../controllers/usersController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// ── Utilisateur connecté ───────────────────────────────────────────────────
router.get("/me",              authenticate, u.getMyProfile);
router.patch("/me",            authenticate, u.updateMyProfile);
router.post("/me/identity",    authenticate, u.submitIdentity);

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
