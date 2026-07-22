import mongoose from "mongoose";

const componentSchema = new mongoose.Schema({
  rating: {
    type: String,
    enum: ["excellent", "bon", "moyen", "mauvais", "na"],
    default: "na",
  },
  notes: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const defectSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  severity:    { type: String, enum: ["mineur", "modere", "majeur"], default: "mineur" },
  photo:       { type: String, default: null }, // base64 ou URL
}, { _id: true });

const inspectionReportSchema = new mongoose.Schema({
  // Un rapport porte sur UNE cible : soit une annonce Import/Export, soit un
  // véhicule du catalogue standard (location/vente) — jamais les deux (voir
  // le pre("validate") plus bas). `listing` reste le nom historique du champ
  // pour ne pas casser les appelants IE existants.
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImportExportListing",
    default: null,
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    default: null,
  },
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Composants inspectés ───────────────────────────────────────────────────
  engine:       componentSchema,
  transmission: componentSchema,
  suspension:   componentSchema,
  brakes:       componentSchema,
  tires:        componentSchema,
  bodywork:     componentSchema,
  interior:     componentSchema,
  electronics:  componentSchema,
  battery:      componentSchema, // VE uniquement

  // ── Synthèse ───────────────────────────────────────────────────────────────
  overallRating: {
    type: String,
    enum: ["excellent", "bon", "moyen", "mauvais"],
    required: true,
  },
  overallNotes: { type: String, trim: true, maxlength: 2000 },

  defects: [defectSchema],

  // ── Photos du rapport ──────────────────────────────────────────────────────
  photos: { type: [String], default: [] },

  // ── Inspecteur ────────────────────────────────────────────────────────────
  inspectorName:     { type: String, trim: true },
  inspectionDate:    { type: Date, default: Date.now },
  inspectionLocation:{ type: String, trim: true },

  status: {
    type: String,
    enum: ["draft", "published"],
    default: "published",
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

inspectionReportSchema.index({ partner: 1 });
// Un seul rapport par cible — index partiel (et non `unique` inline sur le
// champ) car `listing`/`vehicle` sont désormais tous deux optionnels ; un
// index unique classique indexerait les `null` des documents qui portent sur
// l'autre cible et provoquerait de fausses collisions entre eux.
inspectionReportSchema.index({ listing: 1 }, { unique: true, partialFilterExpression: { listing: { $type: "objectId" } } });
inspectionReportSchema.index({ vehicle: 1 }, { unique: true, partialFilterExpression: { vehicle: { $type: "objectId" } } });

inspectionReportSchema.pre("validate", function (next) {
  if (!this.listing === !this.vehicle) { // les deux vides OU les deux renseignés
    return next(new Error("Un rapport d'inspection doit porter sur exactement une cible (listing OU vehicle)."));
  }
  next();
});

inspectionReportSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const InspectionReport =
  mongoose.models.InspectionReport ||
  mongoose.model("InspectionReport", inspectionReportSchema);

export default InspectionReport;
