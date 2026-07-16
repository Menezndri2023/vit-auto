import express from "express";
import * as v from "../controllers/vehicleController.js";
import { authenticate, authorizeAdmin, optionalAuth } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();
const vid = validateObjectId();

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
router.get("/:id/availability", vid, optionalAuth, v.getVehicleAvailability);    // disponibilité dates
router.patch("/:id/status",   vid, authenticate, authorizeAdmin, v.updateVehicleStatus); // approuver/rejeter
router.patch("/:id/lifecycle",vid, authenticate, v.updateVehicleLifecycle);               // brouillon/vendu/archivé (partenaire)
router.patch("/:id/promotion",vid, authenticate, v.updatePromotion);                      // activer/désactiver une promotion
router.post("/:id/convert-to-export", vid, authenticate, v.convertVehicleToExport);       // transforme en annonce Import/Export
router.patch("/:id",          vid, authenticate, v.updateVehicle);                        // mise à jour partielle (featured, etc.)
router.put("/:id",            vid, authenticate, v.updateVehicle);                        // modifier annonce (compat)
router.delete("/:id", vid, authenticate, v.deleteVehicle);                        // supprimer annonce
router.get("/:id",    vid, optionalAuth,  v.getVehicleById);                      // détail véhicule (public)

export default router;
