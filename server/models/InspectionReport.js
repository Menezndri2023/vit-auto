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
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImportExportListing",
    required: true,
    unique: true,
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

inspectionReportSchema.index({ listing: 1 });
inspectionReportSchema.index({ partner: 1 });

inspectionReportSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const InspectionReport =
  mongoose.models.InspectionReport ||
  mongoose.model("InspectionReport", inspectionReportSchema);

export default InspectionReport;
