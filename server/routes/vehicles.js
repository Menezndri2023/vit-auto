import express from "express";
import Vehicle from "../models/Vehicle.js";
import { useDB } from "../db/index.js";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const query = { status: "approved", available: true };
    const db = useDB(Vehicle, "vehicles");
    const vehicles = await db.find(query);
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: "Erreur de lecture des véhicules" });
  }
});

router.get("/mine", authenticate, async (req, res) => {
  try {
    const db = useDB(Vehicle, "vehicles");
    const vehicles = await db.find({ userId: req.user._id });
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: "Erreur de lecture des véhicules utilisateur" });
  }
});

router.get("/pending", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const db = useDB(Vehicle, "vehicles");
    const vehicles = await db.find({ status: "pending" });
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: "Erreur de lecture des véhicules en attente" });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const db = useDB(Vehicle, "vehicles");
    const vehicleData = { ...req.body, userId: req.user._id, status: "pending", createdAt: new Date(), available: true };
    const vehicle = await db.create(vehicleData);
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(400).json({ message: "Erreur de création de véhicule", error: error.message });
  }
});

router.patch("/:id/status", authenticate, authorizeAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ message: "Statut invalide" });
  }

  try {
    const db = useDB(Vehicle, "vehicles");
    const vehicle = await db.findByIdAndUpdate(req.params.id, { status });
    if (!vehicle) return res.status(404).json({ message: "Véhicule non trouvé" });
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: "Erreur de mise à jour du statut" });
  }
});

export default router;
