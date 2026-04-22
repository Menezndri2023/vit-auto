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

  // Photo de profil (base64 ou URL)
  profilePhoto: { type: String, default: null },

  // ── Pièce d'identité ───────────────────────────────────────
  // Commune à tous les rôles : client, partenaire, chauffeur
  identity: {
    type: {
      type: String,
      enum: ["cni", "passport", "permis", "carte_sejour", null],
      default: null,
    },
    number:     { type: String, default: null },       // numéro du document
    expiryDate: { type: Date,   default: null },       // date d'expiration
    frontImage: { type: String, default: null },       // base64 recto
    backImage:  { type: String, default: null },       // base64 verso
    selfie:     { type: String, default: null },       // photo selfie avec la pièce
    status: {
      type: String,
      enum: ["not_submitted", "pending", "verified", "rejected"],
      default: "not_submitted",
    },
    submittedAt: { type: Date, default: null },
    verifiedAt:  { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },

  // ── Informations pro (partenaire / chauffeur) ──────────────
  // Partenaire : entreprise ou professionnel indépendant
  business: {
    companyName:  { type: String, default: null },
    rccm:         { type: String, default: null },  // registre commerce
    taxId:        { type: String, default: null },  // identifiant fiscal
    address:      { type: String, default: null },
    logo:         { type: String, default: null },  // base64 logo entreprise
  },

  // ── Chauffeur : infos spécifiques ─────────────────────────
  driver: {
    licenseNumber:   { type: String, default: null },
    licenseCategory: { type: String, default: null },   // A, B, C, D...
    licenseExpiry:   { type: Date,   default: null },
    licenseImage:    { type: String, default: null },   // base64 permis
    yearsExperience: { type: Number, default: 0 },
    languages:       { type: [String], default: [] },  // langues parlées
    isAvailable:     { type: Boolean, default: true },
  },

  // ── Position habituelle (partenaire / chauffeur) ───────────
  defaultLocation: {
    address: { type: String, default: null },
    city:    { type: String, default: null },
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
  },

  // Suivi de vérification & statut
  documentsVerified: { type: Boolean, default: false },
  isActive:          { type: Boolean, default: true },
  lastLogin:         { type: Date,   default: null },

  createdAt: { type: Date, default: Date.now },
});

// Index pour les recherches fréquentes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
