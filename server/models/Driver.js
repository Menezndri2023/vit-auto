import mongoose from "mongoose";

const driverSchema = new mongoose.Schema({
  // ── Propriétaire du profil (partenaire) ───────────────────
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Identité du chauffeur ─────────────────────────────────
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  phone:       { type: String, trim: true },
  profilePhoto:{ type: String, default: null },

  // ── Titre de l'annonce ────────────────────────────────────
  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },

  // ── Tarification (FCFA) ───────────────────────────────────
  tarif:       { type: Number, required: true }, // par jour
  tarifHeure:  { type: Number },                 // à l'heure (optionnel)

  // ── Disponibilité & zone ──────────────────────────────────
  disponibilite: {
    type: String,
    enum: ["Temps plein", "Weekends", "Soirées", "Sur demande", "En semaine"],
    required: true,
  },
  zone:        { type: String, required: true, trim: true },
  ville:       { type: String, trim: true },

  // ── Expérience & compétences ──────────────────────────────
  experience:     { type: String, required: true }, // ex: "5 ans"
  langues:        { type: [String], default: ["Français"] },
  permisCategorie:{ type: String, default: "B" },   // B, C, D...
  vehiculePersonnel: { type: Boolean, default: false },
  typeVehicule:   { type: String },                  // si véhicule perso

  // ── Médias ────────────────────────────────────────────────
  images: { type: [String], default: [] },

  // ── Statistiques ──────────────────────────────────────────
  noteMoyenne:  { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis:   { type: Number, default: 0 },
  missionsTotal:{ type: Number, default: 0 },

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

driverSchema.index({ owner: 1 });
driverSchema.index({ status: 1 });
driverSchema.index({ zone: 1 });

driverSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Driver = mongoose.models.Driver || mongoose.model("Driver", driverSchema);
export default Driver;
