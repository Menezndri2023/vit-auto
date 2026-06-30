import mongoose from "mongoose";

const partnerShowroomSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true,
  },

  // ── Identité visuelle ─────────────────────────────────────────────────────
  logo:        { type: String, default: null },  // base64 ou URL
  banner:      { type: String, default: null },  // image bannière
  coverVideo:  { type: String, default: null },  // URL vidéo de présentation

  // ── Infos entreprise publiques ────────────────────────────────────────────
  companyName:   { type: String, trim: true, default: null },
  tagline:       { type: String, trim: true, default: null },    // slogan
  description:   { type: String, trim: true, default: null },
  foundedYear:   { type: Number, default: null },
  employeesCount: { type: String, default: null }, // "10-50", "50-200"...
  showroomSurface: { type: String, default: null }, // "500 m²"
  annualCapacity:  { type: String, default: null }, // "200 véhicules/an"

  // ── Spécialités ───────────────────────────────────────────────────────────
  brands:          { type: [String], default: [] },  // Toyota, BMW...
  vehicleTypes:    { type: [String], default: [] },  // SUV, Berline...
  exportCountries: { type: [String], default: [] },
  exportPorts:     { type: [String], default: [] },  // ports utilisés

  // ── Contact & Localisation ────────────────────────────────────────────────
  address:   { type: String, trim: true, default: null },
  city:      { type: String, trim: true, default: null },
  country:   { type: String, trim: true, default: null },
  mapLat:    { type: Number, default: null },
  mapLng:    { type: Number, default: null },
  phone:     { type: String, trim: true, default: null },
  whatsapp:  { type: String, trim: true, default: null },
  wechat:    { type: String, trim: true, default: null },
  email:     { type: String, trim: true, default: null },
  website:   { type: String, trim: true, default: null },

  // ── Réseaux sociaux ───────────────────────────────────────────────────────
  social: {
    facebook:  { type: String, default: null },
    instagram: { type: String, default: null },
    linkedin:  { type: String, default: null },
    youtube:   { type: String, default: null },
    twitter:   { type: String, default: null },
  },

  // ── Horaires d'ouverture ──────────────────────────────────────────────────
  openingHours: {
    lundi:    { open: String, close: String, closed: { type: Boolean, default: false } },
    mardi:    { open: String, close: String, closed: { type: Boolean, default: false } },
    mercredi: { open: String, close: String, closed: { type: Boolean, default: false } },
    jeudi:    { open: String, close: String, closed: { type: Boolean, default: false } },
    vendredi: { open: String, close: String, closed: { type: Boolean, default: false } },
    samedi:   { open: String, close: String, closed: { type: Boolean, default: true  } },
    dimanche: { open: String, close: String, closed: { type: Boolean, default: true  } },
  },

  // ── Médias ────────────────────────────────────────────────────────────────
  photos: [{
    url:     { type: String },
    caption: { type: String, default: null },
    type:    { type: String, enum: ["showroom", "bureau", "entrepot", "equipe", "autre"], default: "autre" },
  }],
  videos: [{
    url:     { type: String },
    title:   { type: String, default: null },
    thumb:   { type: String, default: null },
  }],

  // ── Équipe ────────────────────────────────────────────────────────────────
  team: [{
    name:     { type: String },
    role:     { type: String },
    photo:    { type: String, default: null },
    linkedin: { type: String, default: null },
    languages: { type: [String], default: [] },
  }],

  // ── Certifications & Awards ───────────────────────────────────────────────
  certifications: [{
    name:    { type: String },
    issuer:  { type: String, default: null },
    year:    { type: Number, default: null },
    logoUrl: { type: String, default: null },
  }],

  // ── Statistiques publiques ────────────────────────────────────────────────
  stats: {
    totalSales:       { type: Number, default: 0 },
    countriesServed:  { type: Number, default: 0 },
    yearsExperience:  { type: Number, default: 0 },
    satisfactionRate: { type: Number, default: 0 }, // %
  },

  // ── Score de confiance (calculé par VIT AUTO) ─────────────────────────────
  trustScore: {
    overall:         { type: Number, default: 0, min: 0, max: 100 },
    responseTime:    { type: Number, default: 0 }, // en heures (moyen)
    completionRate:  { type: Number, default: 0 }, // % commandes finalisées
    customerRating:  { type: Number, default: 0 }, // /5
    deliveryRate:    { type: Number, default: 0 }, // % à temps
    cancellationRate:{ type: Number, default: 0 }, // %
    verifiedDocs:    { type: Boolean, default: false },
    lastUpdated:     { type: Date, default: null },
  },

  // ── Publication ───────────────────────────────────────────────────────────
  isPublished:   { type: Boolean, default: false },
  publishedAt:   { type: Date, default: null },
  slug:          { type: String, trim: true, unique: true, sparse: true }, // URL friendly

  // ── Vues et analytics ─────────────────────────────────────────────────────
  viewCount:    { type: Number, default: 0 },
  contactCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

partnerShowroomSchema.index({ isPublished: 1 });
partnerShowroomSchema.index({ slug: 1 });
partnerShowroomSchema.index({ "trustScore.overall": -1 });

partnerShowroomSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  // Auto-slug depuis companyName si absent
  if (!this.slug && this.companyName) {
    this.slug = this.companyName
      .toLowerCase()
      .replace(/[^a-z0-9à-ü]+/gi, "-")
      .replace(/^-|-$/g, "");
  }
  next();
});

const PartnerShowroom =
  mongoose.models.PartnerShowroom ||
  mongoose.model("PartnerShowroom", partnerShowroomSchema);

export default PartnerShowroom;
