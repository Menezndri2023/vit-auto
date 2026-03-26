import express from "express";
import * as vehicleController from "../controllers/vehicleController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", vehicleController.getVehicles);
router.get("/mine", vehicleController.getMyVehicles);
router.post("/", vehicleController.createVehicle);
router.get("/pending", vehicleController.getPendingVehicles);
router.patch("/:id/status", vehicleController.updateVehicleStatus);

