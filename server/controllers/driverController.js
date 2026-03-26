import Driver from "../models/Driver.js";
import { authenticate } from "../middleware/auth.js";

// Create driver
export const createDriver = [authenticate, async (req, res) => {
  try {
    const driver = await Driver.create({
      ...req.body,
      owner: req.user._id,
    });
    res.status(201).json(driver);
  } catch (err) {
    res.status(400).json(err);
  }
}];

// Get all approved drivers
export const getDrivers = async (req, res) => {
  const drivers = await Driver.find({ status: "approved" })
    .populate("owner", "firstName phone");
  res.json(drivers);
};

// Get my drivers
export const getMyDrivers = [authenticate, async (req, res) => {
  const drivers = await Driver.find({ owner: req.user._id });
  res.json(drivers);
}];


