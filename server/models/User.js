import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true },
  phone:      { type: String, trim: true },

  role: {
    type: String,
    enum: ["client", "partenaire", "chauffeur", "admin"],
    default: "client",
  },

  profilePhoto: { type: String, default: null },

  // ── Pièce d'identité ───────────────────────────────────────────
  identity: {
    type: {
      type: String,
      enum: ["cni", "passport", "permis", "carte_sejour", null],
      default: null,
    },
    number:     { type: String, default: null },
    expiryDate: { type: Date,   default: null },
    frontImage: { type: String, default: null },
    backImage:  { type: String, default: null },
    selfie:     { type: String, default: null },
    status: {
      type: String,
      enum: ["not_submitted", "pending", "verified", "rejected"],
      default: "not_submitted",
    },
    submittedAt:     { type: Date,   default: null },
    verifiedAt:      { type: Date,   default: null },
    rejectionReason: { type: String, default: null },
  },

  // ── KYC — Statut officiel ──────────────────────────────────────
  kycStatus: {
    type: String,
    enum: ["EN_ATTENTE", "VERIFIE", "REFUSE", "A_REVOIR_MANUELLEMENT"],
    default: "EN_ATTENTE",
  },

  // ── KYC — Données OCR extraites du document ────────────────────
  kycOcrData: {
    firstName:        { type: String, default: null },
    lastName:         { type: String, default: null },
    birthDate:        { type: Date,   default: null },
    gender:           { type: String, enum: ["M", "F", null], default: null },
    documentNumber:   { type: String, default: null },
    expiryDate:       { type: Date,   default: null },
    issuingCountry:   { type: String, default: null },
    documentType:     { type: String, default: null },
    rawOcrText:       { type: String, default: null },
    ocrConfidence:    { type: Number, default: 0 },
    isExpired:        { type: Boolean, default: false },
    processedAt:      { type: Date,   default: null },
    qualityScore:     { type: Number, default: 0 },
  },

  // ── KYC — Score de correspondance visage ──────────────────────
  kycFaceMatchScore: { type: Number, default: null },

  // ── KYC — Score et Badge ──────────────────────────────────────
  kycScore:        { type: Number, default: 0 },
  kycBadge:        {
    type: String,
    enum: ["CERTIFIÉ", "VÉRIFIÉ", "INSUFFISANT"],
    default: "INSUFFISANT",
  },
  kycSubmittedAt:  { type: Date,   default: null },
  kycDocumentHash: { type: String, default: null },

  // ── KYC — Note de révision admin ─────────────────────────────
  kycReviewNote:       { type: String, default: null },
  kycRejectionReason:  { type: String, default: null },

  // ── KYC — Journal d'audit ────────────────────────────────────
  kycAuditLog: [{
    action:      { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note:        { type: String, default: null },
    timestamp:   { type: Date, default: Date.now },
  }],

  // ── Permis de conduire OCR (pour réservations location) ───────
  driverLicenseOcr: {
    licenseNumber:   { type: String, default: null },
    deliveredDate:   { type: Date,   default: null },
    expiryDate:      { type: Date,   default: null },
    categories:      { type: String, default: null },
    issuingCountry:  { type: String, default: null },
    isExpired:       { type: Boolean, default: false },
    rawOcrText:      { type: String, default: null },
    processedAt:     { type: Date,   default: null },
    frontImage:      { type: String, default: null },  // recto permis
    backImage:       { type: String, default: null },  // verso permis
  },

  // ── Informations pro (partenaire / chauffeur) ──────────────────
  business: {
    companyName:  { type: String, default: null },
    rccm:         { type: String, default: null },
    taxId:        { type: String, default: null },
    address:      { type: String, default: null },
    logo:         { type: String, default: null },
  },

  // ── Chauffeur : infos spécifiques ─────────────────────────────
  driver: {
    licenseNumber:   { type: String, default: null },
    licenseCategory: { type: String, default: null },
    licenseExpiry:   { type: Date,   default: null },
    licenseImage:    { type: String, default: null },
    yearsExperience: { type: Number, default: 0 },
    languages:       { type: [String], default: [] },
    isAvailable:     { type: Boolean, default: true },
  },

  defaultLocation: {
    address: { type: String, default: null },
    city:    { type: String, default: null },
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
  },

  // ── Vérification e-mail ────────────────────────────────────────
  emailVerified:            { type: Boolean, default: false },
  emailVerificationToken:   { type: String,  default: null },
  emailVerificationExpires: { type: Date,    default: null },

  // ── Vérification téléphone (OTP 6 chiffres) ───────────────────
  phoneVerified:   { type: Boolean, default: false },
  phoneOtp:        { type: String,  default: null },
  phoneOtpExpires: { type: Date,    default: null },

  // ── Réinitialisation mot de passe ────────────────────────────
  passwordResetToken:   { type: String, default: null },
  passwordResetExpires: { type: Date,   default: null },

  refreshTokens: { type: [String], default: [] },

  importerProfile: {
    status: {
      type: String,
      enum: ["none", "pending", "verified", "rejected", "suspended"],
      default: "none",
    },
    badgeLevel: {
      type: String,
      enum: ["none", "silver", "gold", "platinum"],
      default: "none",
    },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "ImporterPartnerProfile", default: null },
  },

  documentsVerified: { type: Boolean, default: false },
  isActive:          { type: Boolean, default: true },
  lastLogin:         { type: Date,    default: null },

  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ role: 1 });
userSchema.index({ kycStatus: 1 });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
