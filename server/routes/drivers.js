import express from "express";
import * as d from "../controllers/driverController.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

// ── Public ────────────────────────────────────────────────
router.get("/", d.getDrivers);

// ── Partenaire authentifié ────────────────────────────────
router.post("/", authenticate, d.createDriver);
router.get("/mine", authenticate, d.getMyDrivers);
router.patch("/:id", authenticate, validateObjectId(), d.updateDriver);
router.delete("/:id", authenticate, validateObjectId(), d.deleteDriver);

// ── Admin ─────────────────────────────────────────────────
router.get("/pending", authenticate, authorizeAdmin, d.getPendingDrivers);
router.patch("/:id/status", authenticate, authorizeAdmin, validateObjectId(), d.updateDriverStatus);
router.patch("/:id/transfer", authenticate, authorizeAdmin, validateObjectId(), d.transferDriver);

export default router;
