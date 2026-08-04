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
  // Champs essentiels absents pour une ligne créée (prix/carburant/transmission/
  // ville/adresse) — voir findMissingKeyFields dans vehicleImportService.js.
  // Vide/absent pour les lignes non "created" (erreur, doublon).
  missingKeyFields: { type: [String], default: [] },
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

  // Entreprise du partenaire concernée par ce batch (facultatif, multi-entité/
  // multi-pays — voir vehicleController.createVehicle) : son pays prime sur
  // celui du compte User pour toutes les lignes (targetType "vehicle" uniquement).
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerBusiness",
    default: null,
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

  // Mappage colonne-par-colonne confirmé par le partenaire à l'écran de
  // prévisualisation ({ clé technique VIT AUTO: en-tête exact de son fichier })
  // — prioritaire sur la détection automatique par alias (voir
  // mapRowToVehicleInput), qui reste un repli si un champ n'a pas été mappé.
  // `null` = ancien flux sans écran de mappage (détection automatique seule).
  columnMapping: { type: mongoose.Schema.Types.Mixed, default: null },

  // Type appliqué à TOUTES les lignes quand le partenaire confirme n'avoir
  // aucune colonne location/vente dans son fichier (flotte 100% d'un seul
  // type) — voir mapRowToVehicleInput. Sans rapport avec targetType
  // ("vehicle"/"export"), qui distingue catalogue classique vs Import/Export.
  defaultType: { type: String, enum: ["location", "vente", null], default: null },

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

  // ── Résumé agrégé "créé mais incomplet" (targetType "vehicle" uniquement) ──
  // Sans ce chiffre calculé sur le batch entier, un import de centaines de
  // lignes sans prix/carburant/transmission/ville/adresse se terminait
  // "296 créé(s)" sans qu'aucun signal ne l'indique — bug réel constaté en
  // production (voir processImportBatch dans vehicleImportService.js).
  incompleteCount: { type: Number, default: 0 },
  // { [clé du champ]: nombre de lignes créées où il manque } — ex.
  // { price: 12, carburant: 260, transmission: 240, ville: 5, adresse: 300 }.
  missingFieldsBreakdown: { type: mongoose.Schema.Types.Mixed, default: null },

  // Lignes brutes en attente de traitement (consommées par processImportBatch,
  // vidées au fur et à mesure pour ne pas garder deux fois la même donnée).
  pendingRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

vehicleImportBatchSchema.index({ owner: 1, createdAt: -1 });

const VehicleImportBatch = mongoose.models.VehicleImportBatch
  || mongoose.model("VehicleImportBatch", vehicleImportBatchSchema);

export default VehicleImportBatch;
