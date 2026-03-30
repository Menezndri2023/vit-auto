import Vehicle from "../models/Vehicle.js";

// ➕ Créer un véhicule
export const createVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.create({
      ...req.body,
      owner: req.user._id, // injecté par authenticate
    });

    res.status(201).json(vehicle);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Erreur création véhicule" });
  }
};

// 🔍 Tous les véhicules approuvés
export const getVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: "approved" })
      .populate("owner", "firstName phone");

    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur récupération véhicules" });
  }
};

// 👤 Mes véhicules
export const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user._id });
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur récupération véhicules utilisateur" });
  }
};

// ⏳ Véhicules en attente
export const getPendingVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ status: "pending" })
      .populate("owner", "firstName email");

    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur récupération véhicules en attente" });
  }
};

// 🔄 Modifier statut (admin)
export const updateVehicleStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json(vehicle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur mise à jour statut" });
  }
};