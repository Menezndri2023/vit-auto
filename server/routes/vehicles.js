import express from "express";
import * as v from "../controllers/vehicleController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", v.getVehicles);                                              // tous les véhicules approuvés

// ── Partenaire authentifié ────────────────────────────────
router.post("/", authenticate, v.createVehicle);                             // créer une annonce
router.get("/mine", authenticate, v.getMyVehicles);                          // mes annonces
router.put("/:id", authenticate, v.updateVehicle);                           // modifier mon annonce
router.delete("/:id", authenticate, v.deleteVehicle);                        // supprimer mon annonce

// ── Admin ─────────────────────────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, v.getPendingVehicles);  // annonces en attente
router.patch("/:id/status", authenticate, authorizeAdmin, v.updateVehicleStatus); // approuver/rejeter

export default router;
