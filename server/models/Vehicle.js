import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  brand: String,
  model: String,

  type: { type: String, enum: ["location", "vente"], required: true },

  pricePerDay: Number,
  priceForSale: Number,

  location: String,
  description: String,

  images: [String],

  withDriver: { type: Boolean, default: false },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  available: { type: Boolean, default: true },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },

  createdAt: { type: Date, default: Date.now },
});

const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
export default Vehicle;

