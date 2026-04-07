import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema({
  // ── Informations principales ──────────────────────────────
  title:       { type: String, required: true, trim: true },
  marque:      { type: String, trim: true },
  modele:      { type: String, trim: true },
  annee:       { type: Number },
  couleur:     { type: String, trim: true },
  kilometrage: { type: Number },
  etat:        { type: String, enum: ["Neuf", "Comme neuf", "Bon état", "À réparer"], default: "Bon état" },

  // ── Type d'annonce ────────────────────────────────────────
  // "location" = véhicule à louer, "vente" = véhicule à vendre
  type: {
    type: String,
    enum: ["location", "vente"],
    required: true,
  },

  // ── Caractéristiques techniques ───────────────────────────
  carburant: {
    type: String,
    enum: ["Essence", "Diesel", "Hybride", "Électrique", "GPL"],
  },
  transmission: {
    type: String,
    enum: ["Automatique", "Manuelle"],
  },
  nombrePlaces: { type: Number, default: 5 },
  nombrePortes: { type: Number, default: 4 },
  climatisation: { type: Boolean, default: true },
  withDriver:    { type: Boolean, default: false }, // Option chauffeur avec la location

  // ── Tarification (FCFA / XOF) ─────────────────────────────
  pricePerDay:  { type: Number }, // location
  priceForSale: { type: Number }, // vente
  caution:      { type: Number }, // caution location (FCFA)

  // ── Conditions de location ────────────────────────────────
  ageMin:               { type: Number, default: 21 },
  permisRequis:         { type: Boolean, default: true },
  assuranceOptionnelle: { type: Boolean, default: true },

  // ── Localisation ──────────────────────────────────────────
  ville:      { type: String, trim: true },
  adresse:    { type: String, trim: true },
  coordonnees: {
    lat: { type: Number },
    lng: { type: Number },
  },

  // ── Médias ────────────────────────────────────────────────
  images:      { type: [String], default: [] },
  description: { type: String, trim: true },

  // ── Propriétaire (partenaire) ─────────────────────────────
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Disponibilité ─────────────────────────────────────────
  available: { type: Boolean, default: true },

  // ── Statistiques ──────────────────────────────────────────
  vues:          { type: Number, default: 0 },
  noteMoyenne:   { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis:    { type: Number, default: 0 },

  // ── Modération ────────────────────────────────────────────
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  rejectionReason: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

vehicleSchema.index({ owner: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ type: 1 });
vehicleSchema.index({ ville: 1 });
vehicleSchema.index({ pricePerDay: 1 });

// Mettre à jour updatedAt automatiquement
vehicleSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
export default Vehicle;
