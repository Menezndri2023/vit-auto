import mongoose from "mongoose";

// Annonce import/export publiée par un partenaire importateur vérifié
const importExportListingSchema = new mongoose.Schema({
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  importerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImporterPartnerProfile",
    required: true,
  },

  // ── Véhicule ───────────────────────────────────────────────────
  title:       { type: String, required: true, trim: true },
  make:        { type: String, required: true, trim: true },
  model:       { type: String, required: true, trim: true },
  year:        { type: Number, required: true },
  mileage:     { type: Number, default: 0 },
  fuelType:    { type: String, enum: ["essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl", "gaz", "autre"], default: "essence" },
  transmission:{ type: String, enum: ["manuelle", "automatique", "cvt", "semi_automatique"], default: "automatique" },
  bodyType:    { type: String, trim: true },    // berline, SUV, pickup...
  color:       { type: String, trim: true },
  condition:   { type: String, enum: ["neuf", "occasion", "reconditionne"], default: "occasion" },
  description: { type: String, trim: true },

  // ── Logistique ─────────────────────────────────────────────────
  sourceCountry: { type: String, required: true, trim: true },
  sourceCity:    { type: String, trim: true },
  availableIn:   { type: [String], default: [] },  // pays de livraison disponibles

  // ── Prix & conditions ──────────────────────────────────────────
  price:         { type: Number, required: true },
  currency:      { type: String, default: "EUR" },
  priceIncludes: { type: [String], default: [] },  // dédouanement, transport...
  negotiable:    { type: Boolean, default: false },
  stockQty:      { type: Number, default: 1 },

  // ── Identifiants véhicule ──────────────────────────────────────
  vin:          { type: String, trim: true, default: null },  // Vehicle Identification Number
  vehicleHistory:{ type: String, trim: true, default: null }, // Historique (accidents, entretien, propriétaires)

  // ── Logistique & coûts estimatifs ─────────────────────────────
  estimatedShippingCost: { type: Number, default: null },      // en EUR
  shippingCostCurrency:  { type: String, default: "EUR" },
  estimatedDelay:        { type: String, trim: true, default: null }, // ex: "30-45 jours"
  shippingType:          {
    type: String,
    enum: ["maritime", "terrestre", "aerien", "multiple", null],
    default: null,
  },
  exportDocumentsAvailable: { type: [String], default: [] }, // ["facture", "connaissement", "certificat_origine"...]

  // ── Rapport d'inspection (ref) ─────────────────────────────────
  inspectionReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InspectionReport",
    default: null,
  },

  // ── Médias ─────────────────────────────────────────────────────
  photos:   { type: [String], default: [] },       // base64 ou URLs
  mainPhoto:{ type: String,   default: null },
  videoUrl: { type: String,   trim: true, default: null }, // lien vidéo (YouTube, MP4...)

  // ── Statut publication ─────────────────────────────────────────
  status: {
    type: String,
    enum: ["draft", "pending", "approved", "rejected", "sold", "archived"],
    default: "pending",
  },
  adminNote:    { type: String, default: null },
  approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt:   { type: Date, default: null },

  // Métriques
  views:        { type: Number, default: 0 },
  inquiries:    { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

importExportListingSchema.index({ status: 1, createdAt: -1 });
importExportListingSchema.index({ partner: 1 });
importExportListingSchema.index({ sourceCountry: 1 });

importExportListingSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const ImportExportListing =
  mongoose.models.ImportExportListing ||
  mongoose.model("ImportExportListing", importExportListingSchema);

export default ImportExportListing;
