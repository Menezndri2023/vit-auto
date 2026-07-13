import mongoose from "mongoose";

const resultSchema = new mongoose.Schema({
  rowIndex: { type: Number, required: true },
  status: {
    type: String,
    enum: ["created", "skipped_duplicate", "error"],
    required: true,
  },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  // Renseigné à la place de vehicleId quand targetType === "export".
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportExportListing", default: null },
  vehicleLabel: { type: String, default: "" }, // ex: "Toyota Corolla 2020" — utile en cas d'erreur
  errors:   { type: [String], default: [] },
  warnings: { type: [String], default: [] },
}, {
  _id: false,
  // "errors" est un nom de chemin réservé par Mongoose (utilisé en interne pour
  // les erreurs de validation) — sans risque ici (sous-document simple, jamais
  // validé individuellement), mais on supprime l'avertissement au démarrage
  // plutôt que de le laisser polluer les logs à chaque déploiement.
  suppressReservedKeysWarning: true,
});

const vehicleImportBatchSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // "vehicle" = catalogue location/vente classique (Vehicle) ; "export" =
  // annonces Import/Export (ImportExportListing), réservées aux Founding
  // Partners — même pipeline d'import (fichier/Google Sheet), colonnes et
  // modèle de destination différents (voir vehicleImportService.js).
  targetType: {
    type: String,
    enum: ["vehicle", "export"],
    default: "vehicle",
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
