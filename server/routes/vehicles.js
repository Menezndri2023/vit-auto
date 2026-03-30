import express from "express";
import * as vehicleController from "../controllers/vehicleController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

// 📄 Voir tous les véhicules
router.get("/", vehicleController.getVehicles);

// 👤 Voir ses véhicules
router.get("/mine", authenticate, vehicleController.getMyVehicles);

// ➕ Créer véhicule (admin uniquement)
router.post("/", authenticate, authorizeAdmin, vehicleController.createVehicle);

// ⏳ Véhicules en attente (admin)
router.get("/pending", authenticate, authorizeAdmin, vehicleController.getPendingVehicles);

// 🔄 Modifier statut (admin)
router.patch("/:id/status", authenticate, authorizeAdmin, vehicleController.updateVehicleStatus);

export default router;