import mongoose from "mongoose";

// ── Critère individuel de vérification ────────────────────────────────────────
const criterionSchema = new mongoose.Schema({
  verified:   { type: Boolean, default: false },
  verifiedAt: { type: Date,   default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  note:       { type: String, default: "" },
  docUrl:     { type: String, default: null },
}, { _id: false });

// ── Dossier de vérification partenaire ────────────────────────────────────────
const partnerVerificationSchema = new mongoose.Schema({
  // Lien vers le compte utilisateur du partenaire
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  // Lien optionnel vers la certification (8 niveaux)
  certificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerCertification",
    default: null,
  },

  // ── Informations entreprise ───────────────────────────────────────────────
  companyName:    { type: String, required: true, trim: true },
  companyType:    {
    type: String,
    enum: ["importateur", "exportateur", "import_export", "transitaire", "concessionnaire", "loueur", "assureur", "banque", "autre"],
    default: "importateur",
  },
  country:        { type: String, trim: true, default: "" },
  city:           { type: String, trim: true, default: "" },
  website:        { type: String, trim: true, default: "" },
  phone:          { type: String, trim: true, default: "" },
  email:          { type: String, trim: true, default: "" },
  description:    { type: String, trim: true, default: "" },
  logoUrl:        { type: String, default: null },

  // ── Critères de vérification (7 critères) ─────────────────────────────────
  criteria: {
    businessLicense:  { ...criterionSchema.obj },  // Licence commerciale vérifiée
    websiteVerified:  { ...criterionSchema.obj },  // Site web vérifié
    addressVerified:  { ...criterionSchema.obj },  // Adresse vérifiée
    repIdentified:    { ...criterionSchema.obj },  // Représentant identifié
    exportCapacity:   { ...criterionSchema.obj },  // Capacité d'export confirmée
    documentsReceived:{ ...criterionSchema.obj },  // Documents reçus
    verificationDone: { ...criterionSchema.obj },  // Vérification terminée
  },

  // ── Trust Score (0-100) calculé automatiquement ───────────────────────────
  trustScore: { type: Number, default: 0, min: 0, max: 100 },

  // ── Statut global du dossier ──────────────────────────────────────────────
  status: {
    type: String,
    enum: ["en_cours", "en_attente", "verifie", "suspendu", "rejete"],
    default: "en_cours",
  },

  // ── Niveau de confiance calculé depuis trustScore ─────────────────────────
  trustLevel: {
    type: String,
    enum: ["non_verifie", "bronze", "argent", "or", "platine"],
    default: "non_verifie",
  },

  // ── Spécificités import/export ────────────────────────────────────────────
  exportCountries:    { type: [String], default: [] },
  importCountries:    { type: [String], default: [] },
  vehicleCategories:  { type: [String], default: [] },
  portsUsed:          { type: [String], default: [] },
  annualVolume:       { type: String, default: "" },
  yearsExperience:    { type: Number, default: 0 },
  paymentMethods:     { type: [String], default: [] },

  // ── Documents attachés (URLs ou base64) ──────────────────────────────────
  documents: {
    businessLicenseDoc: { type: String, default: null },
    rccmDoc:            { type: String, default: null },
    taxIdDoc:           { type: String, default: null },
    bankStatementDoc:   { type: String, default: null },
    repIdDoc:           { type: String, default: null },
    otherDoc:           { type: String, default: null },
  },

  // ── Notes admin / dossier ────────────────────────────────────────────────
  adminNote:      { type: String, default: "" },
  internalRating: { type: Number, default: 0, min: 0, max: 5 },

  // ── Admin responsable du dossier ──────────────────────────────────────────
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },

  // Dernière relance envoyée pour compléter les documents manquants — voir
  // utils/partnerReminders.js (relance manuelle admin + job automatique).
  lastReminderSentAt: { type: Date, default: null },

  // ── Audit log ─────────────────────────────────────────────────────────────
  auditLog: [{
    action:      { type: String, required: true },
    criterion:   { type: String, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note:        { type: String, default: "" },
    timestamp:   { type: Date, default: Date.now },
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ── Calcul automatique du trust score ────────────────────────────────────────
const CRITERIA_WEIGHTS = {
  businessLicense:   20,
  repIdentified:     18,
  exportCapacity:    18,
  documentsReceived: 15,
  addressVerified:   12,
  websiteVerified:   10,
  verificationDone:   7,
};

function computeTrustScore(criteria) {
  let score = 0;
  for (const [key, weight] of Object.entries(CRITERIA_WEIGHTS)) {
    if (criteria?.[key]?.verified) score += weight;
  }
  return Math.min(score, 100);
}

function computeTrustLevel(score) {
  if (score >= 95) return "platine";
  if (score >= 75) return "or";
  if (score >= 50) return "argent";
  if (score >= 25) return "bronze";
  return "non_verifie";
}

partnerVerificationSchema.pre("save", function (next) {
  this.updatedAt  = new Date();
  this.trustScore = computeTrustScore(this.criteria);
  this.trustLevel = computeTrustLevel(this.trustScore);

  // Statut automatique
  if (this.trustScore === 100 && this.status === "en_cours") this.status = "verifie";

  next();
});

partnerVerificationSchema.index({ status: 1 });
partnerVerificationSchema.index({ trustScore: -1 });
partnerVerificationSchema.index({ companyType: 1 });

const PartnerVerification =
  mongoose.models.PartnerVerification ||
  mongoose.model("PartnerVerification", partnerVerificationSchema);

export { computeTrustScore, computeTrustLevel, CRITERIA_WEIGHTS };
export default PartnerVerification;
