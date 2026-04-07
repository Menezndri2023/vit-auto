import express from "express";
import * as d from "../controllers/driverController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", d.getDrivers);                                                 // tous les chauffeurs approuvés

// ── Partenaire authentifié ────────────────────────────────
router.post("/", authenticate, d.createDriver);                                // publier profil chauffeur
router.get("/mine", authenticate, d.getMyDrivers);                             // mes profils
router.delete("/:id", authenticate, d.deleteDriver);                           // supprimer profil

// ── Admin ─────────────────────────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, d.getPendingDrivers);     // profils en attente
router.patch("/:id/status", authenticate, authorizeAdmin, d.updateDriverStatus); // approuver/rejeter

export default router;
