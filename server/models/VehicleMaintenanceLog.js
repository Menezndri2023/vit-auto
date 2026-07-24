import mongoose from "mongoose";

// Journal d'entretien/incident d'un véhicule — n'existait sous aucune forme
// jusqu'ici : Vehicle n'a qu'un simple `kilometrage`, aucune trace des
// vidanges/révisions, ni des dommages/sinistres constatés au retour d'une
// location (voir bookingController.claimCaution, qui retient un montant sur
// la caution mais sans nulle part où consigner CE qui a été endommagé).
const vehicleMaintenanceLogSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    required: true,
    index: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["entretien", "incident", "dommage"],
    required: true,
  },
  date:        { type: Date, default: Date.now },
  kilometrage: { type: Number, default: null }, // relevé au moment de l'entrée, distinct de Vehicle.kilometrage (non rétroactif)
  description: { type: String, required: true, trim: true },
  cost:        { type: Number, default: 0 }, // USD — coût réparation/entretien, facultatif
  photos:      { type: [String], default: [] },
  // Réservation liée si l'incident/dommage a été constaté au retour d'une
  // location précise (facultatif — un entretien planifié n'en a pas).
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, { timestamps: true });

vehicleMaintenanceLogSchema.index({ vehicle: 1, date: -1 });

const VehicleMaintenanceLog = mongoose.models.VehicleMaintenanceLog
  || mongoose.model("VehicleMaintenanceLog", vehicleMaintenanceLogSchema);

export default VehicleMaintenanceLog;
