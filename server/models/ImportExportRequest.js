import mongoose from "mongoose";

const importExportRequestSchema = new mongoose.Schema({
  // Identité du demandeur
  firstName:    { type: String, required: true, trim: true },
  lastName:     { type: String, required: true, trim: true },
  email:        { type: String, required: true, lowercase: true, trim: true },
  phone:        { type: String, trim: true },

  // Optionnel : lien vers le compte si l'utilisateur est connecté
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Service demandé
  serviceType: {
    type: String,
    enum: ["import", "export", "transit", "pieces_detachees"],
    default: "import",
  },
  pack: {
    type: String,
    enum: ["Silver", "Gold", "Platinum", "Executive"],
    default: "Silver",
  },

  // Logistique
  sourceCountry: { type: String, trim: true },
  destCountry:   { type: String, trim: true },

  // Véhicule
  vehicleType:  { type: String, trim: true },   // berline, SUV, camion...
  vehicleMake:  { type: String, trim: true },
  vehicleModel: { type: String, trim: true },
  vehicleYear:  { type: Number },
  budget:       { type: Number },               // en EUR
  currency:     { type: String, default: "EUR" },

  // Message libre
  message: { type: String, trim: true },

  // Workflow
  status: {
    type: String,
    enum: ["pending", "processing", "approved", "rejected", "contacted"],
    default: "pending",
  },
  adminNote:   { type: String, default: null },
  handledBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  handledAt:   { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

importExportRequestSchema.index({ status: 1, createdAt: -1 });
importExportRequestSchema.index({ email: 1 });

const ImportExportRequest =
  mongoose.models.ImportExportRequest ||
  mongoose.model("ImportExportRequest", importExportRequestSchema);

export default ImportExportRequest;
