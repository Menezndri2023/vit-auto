import express from "express";
import * as u from "../controllers/usersController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// ── Utilisateur connecté ───────────────────────────────────────────────────
router.get("/me",              authenticate, u.getMyProfile);          // profil complet
router.patch("/me",            authenticate, u.updateMyProfile);       // mettre à jour le profil
router.post("/me/identity",    authenticate, u.submitIdentity);        // soumettre pièce d'identité

// ── Admin ─────────────────────────────────────────────────────────────────
router.get("/",                authenticate, authorizeAdmin, u.getUsers);
router.get("/stats",           authenticate, authorizeAdmin, u.getAdminStats);
router.get("/pending-identity",authenticate, authorizeAdmin, u.getPendingIdentities);
router.get("/:id",             authenticate, authorizeAdmin, u.getUser);
router.patch("/:id/role",      authenticate, authorizeAdmin, u.updateUserRole);
router.patch("/:id/toggle",    authenticate, authorizeAdmin, u.toggleUserActive);
router.patch("/:id/verify-identity", authenticate, authorizeAdmin, u.adminVerifyIdentity);
router.delete("/:id",          authenticate, authorizeAdmin, u.deleteUser);

export default router;
