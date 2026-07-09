import mongoose from "mongoose";

const resultSchema = new mongoose.Schema({
  rowIndex: { type: Number, required: true },
  status: {
    type: String,
    enum: ["created", "skipped_duplicate", "error"],
    required: true,
  },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  vehicleLabel: { type: String, default: "" }, // ex: "Toyota Corolla 2020" — utile en cas d'erreur
  errors:   { type: [String], default: [] },
  warnings: { type: [String], default: [] },
}, { _id: false });

const vehicleImportBatchSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  source: {
    type: String,
    enum: ["csv", "excel", "google_sheet"],
    required: true,
  },

  originalFileName: { type: String, default: "" },
  googleSheetUrl:   { type: String, default: "" },

  totalRows:     { type: Number, default: 0 },
  processedRows: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ["processing", "completed", "completed_with_errors", "failed"],
    default: "processing",
    index: true,
  },
  errorMessage: { type: String, default: null }, // ex: fichier illisible, colonnes manquantes

  results: { type: [resultSchema], default: [] },

  // Lignes brutes en attente de traitement (consommées par processImportBatch,
  // vidées au fur et à mesure pour ne pas garder deux fois la même donnée).
  pendingRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

vehicleImportBatchSchema.index({ owner: 1, createdAt: -1 });

const VehicleImportBatch = mongoose.models.VehicleImportBatch
  || mongoose.model("VehicleImportBatch", vehicleImportBatchSchema);

export default VehicleImportBatch;
