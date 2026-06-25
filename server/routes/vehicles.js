import express from "express";
import * as v from "../controllers/vehicleController.js";
import { authenticate, authorizeAdmin, optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// ── IMPORTANT : routes statiques AVANT les routes paramétrées ────────────────

// ── Public (optionalAuth pour que les admins puissent filtrer par statut) ────
router.get("/", optionalAuth, v.getVehicles);                                // tous les véhicules approuvés

// ── Partenaire authentifié — routes statiques ─────────────
router.get("/mine",    authenticate, v.getMyVehicles);                       // mes annonces
router.post("/",       authenticate, v.createVehicle);                       // créer une annonce

// ── Admin — routes statiques ──────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, v.getPendingVehicles);  // annonces en attente
router.post("/sync-availability", authenticate, authorizeAdmin, v.syncAllAvailability);

// ── Routes paramétrées (viennent APRÈS les routes statiques) ─────────────────
router.get("/:id/availability", optionalAuth, v.getVehicleAvailability);    // disponibilité dates
router.patch("/:id/status",   authenticate, authorizeAdmin, v.updateVehicleStatus); // approuver/rejeter
router.patch("/:id",          authenticate, v.updateVehicle);                        // mise à jour partielle (featured, etc.)
router.put("/:id",            authenticate, v.updateVehicle);                        // modifier annonce (compat)
router.delete("/:id", authenticate, v.deleteVehicle);                        // supprimer annonce
router.get("/:id",    optionalAuth,  v.getVehicleById);                      // détail véhicule (public)

export default router;
