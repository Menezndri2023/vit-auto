import express from "express";
import * as a from "../controllers/activityController.js";
import { authenticate, optionalAuth, authorizeAdmin, requireAdminScope } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", a.getActivities);

// ── Partenaire authentifié ────────────────────────────────
router.post("/", authenticate, a.createActivity);
router.get("/mine", authenticate, a.getMyActivities);
router.post("/bulk-delete", authenticate, a.bulkDeleteActivities);
router.post("/:id/blackout", authenticate, validateObjectId(), a.addActivityBlackout);
router.delete("/:id/blackout/:blackoutId", authenticate, validateObjectId(), validateObjectId("blackoutId"), a.removeActivityBlackout);

// ── Admin ─────────────────────────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, requireAdminScope("catalogue"), a.getPendingActivities);
router.patch("/:id/status", authenticate, authorizeAdmin, requireAdminScope("catalogue"), validateObjectId(), a.updateActivityStatus);
router.patch("/:id/transfer", authenticate, authorizeAdmin, requireAdminScope("catalogue"), validateObjectId(), a.transferActivity);

// ── Détail / édition / suppression (routes à ID générique en dernier) ────
// `optionalAuth` : la fiche reste publique, mais le propriétaire et l'admin
// doivent pouvoir consulter une activité pas encore approuvée — sans quoi
// le filtre de statut ajouté au contrôleur la leur cacherait aussi.
router.get("/:id", validateObjectId(), optionalAuth, a.getActivityById);
router.patch("/:id", authenticate, validateObjectId(), a.updateActivity);
router.delete("/:id", authenticate, validateObjectId(), a.deleteActivity);

export default router;
