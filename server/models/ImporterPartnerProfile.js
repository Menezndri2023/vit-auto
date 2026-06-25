import mongoose from "mongoose";

// Profil de vérification pour les partenaires importateurs/exportateurs
const importerPartnerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  // ── Entreprise ─────────────────────────────────────────────────
  companyName:    { type: String, required: true, trim: true },
  rccm:           { type: String, trim: true },          // registre de commerce
  taxId:          { type: String, trim: true },          // NIF / identifiant fiscal
  operatingLicense: { type: String, trim: true },        // agrément importateur
  address:        { type: String, trim: true },
  city:           { type: String, trim: true },
  country:        { type: String, trim: true },
  website:        { type: String, trim: true },

  // ── Documents (base64 ou URL) ──────────────────────────────────
  documents: {
    rccmImage:      { type: String, default: null },   // registre commerce image
    taxIdImage:     { type: String, default: null },   // NIF image
    licenseImage:   { type: String, default: null },   // agrément importateur
    companyLogo:    { type: String, default: null },
    bankStatement:  { type: String, default: null },   // relevé bancaire
    otherDoc:       { type: String, default: null },
  },

  // ── Activité ───────────────────────────────────────────────────
  activityType: {
    type: [String],
    enum: ["import", "export", "transit", "courtage", "pieces_detachees"],
    default: ["import"],
  },
  operatingCountries: { type: [String], default: [] }, // pays d'opération
  vehicleCategories:  { type: [String], default: [] }, // berline, SUV, camion...
  annualVolume:       { type: String, trim: true },    // "50-100 véhicules/an"
  yearsExperience:    { type: Number, default: 0 },

  // ── Références ─────────────────────────────────────────────────
  references:  { type: String, trim: true },           // partenaires / clients notables
  description: { type: String, trim: true },           // présentation libre

  // ── Workflow de vérification ───────────────────────────────────
  status: {
    type: String,
    enum: ["not_submitted", "pending", "verified", "rejected", "suspended"],
    default: "not_submitted",
  },
  submittedAt:     { type: Date, default: null },
  reviewedAt:      { type: Date, default: null },
  reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rejectionReason: { type: String, default: null },

  // Badge affiché publiquement
  badgeLevel: {
    type: String,
    enum: ["none", "silver", "gold", "platinum"],
    default: "none",
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

importerPartnerProfileSchema.index({ status: 1 });
// userId: unique:true dans le schéma crée déjà l'index — pas de doublon

importerPartnerProfileSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const ImporterPartnerProfile =
  mongoose.models.ImporterPartnerProfile ||
  mongoose.model("ImporterPartnerProfile", importerPartnerProfileSchema);

export default ImporterPartnerProfile;
