import Vehicle from "../models/Vehicle.js";

// 🔥 Publier véhicule
export const createVehicle = [authenticate, async (req, res) => {
  try {
    const vehicle = await Vehicle.create({
      ...req.body,
      owner: req.user._id,
    });

    res.status(201).json(vehicle);
  } catch (err) {
    res.status(400).json(err);
  }
}];


// 🔍 Tous les véhicules
export const getVehicles = async (req, res) => {
  const vehicles = await Vehicle.find({ status: "approved" })
    .populate("owner", "firstName phone");

  res.json(vehicles);
};

// 👤 Mes véhicules
export const getMyVehicles = [authenticate, async (req, res) => {
  const vehicles = await Vehicle.find({ owner: req.user._id });
  res.json(vehicles);
}];

