import express from "express";
import * as u from "../controllers/usersController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// ── Admin ─────────────────────────────────────────────────
router.get("/", authenticate, authorizeAdmin, u.getUsers);                     // liste utilisateurs
router.get("/stats", authenticate, authorizeAdmin, u.getAdminStats);           // statistiques globales
router.get("/:id", authenticate, authorizeAdmin, u.getUser);                   // détail utilisateur
router.patch("/:id/role", authenticate, authorizeAdmin, u.updateUserRole);     // changer rôle
router.patch("/:id/toggle", authenticate, authorizeAdmin, u.toggleUserActive); // activer/désactiver

export default router;
