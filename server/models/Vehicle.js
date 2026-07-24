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

  // ── Catégorie du véhicule (SUV, Berline, etc.) ────────────
  vehicleType: {
    type: String,
    enum: ["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"],
    default: "Berline",
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

  // ── Tarification (USD — voir server/scripts/migrate-vehicle-booking-to-usd.mjs
  // pour la migration des annonces créées avant ce champ, qui étaient toutes
  // implicitement en FCFA/XOF) ───────────────────────────────
  currency:     { type: String, default: "USD" },
  pricePerDay:  { type: Number }, // location
  priceForSale: { type: Number }, // vente
  caution:      { type: Number }, // caution location — toujours optionnelle

  // Durée de location proposée (uniquement pertinent pour type "location") —
  // permet de distinguer "Location courte durée" / "Location longue durée"
  // (voir Services.jsx), qui pointaient jusqu'ici vers le même catalogue sans
  // filtre réel.
  rentalDurationType: {
    type: String,
    enum: ["courte", "longue", "les_deux"],
    default: "les_deux",
  },

  // ── Leasing (LOA — location avec option d'achat, pour type "vente" uniquement) ──
  leasing: {
    disponible:    { type: Boolean, default: false },
    apportInitial: { type: Number, default: 0 },     // USD
    mensualite:    { type: Number, default: 0 },     // USD/mois
    duree:         { type: Number, default: 36 },    // mois
    tauxInteret:   { type: Number, default: 8 },     // % annuel
    description:   { type: String, default: "" },
  },

  // ── Crédit classique (financement bancaire, propriété transférée dès
  // l'achat contrairement au leasing/LOA — pour type "vente" uniquement) ────
  credit: {
    disponible:    { type: Boolean, default: false },
    apportInitial: { type: Number, default: 0 },     // USD
    mensualite:    { type: Number, default: 0 },     // USD/mois
    duree:         { type: Number, default: 36 },    // mois
    tauxInteret:   { type: Number, default: 8 },     // % annuel
    description:   { type: String, default: "" },
  },

  // ── Conditions de location ────────────────────────────────
  ageMin:               { type: Number, default: 21 },
  permisRequis:         { type: Boolean, default: true },
  assuranceOptionnelle: { type: Boolean, default: true },
  // Conditions particulières facultatives saisies librement par le partenaire
  // (ex. kilométrage inclus/jour, pénalités retard, état des lieux, garantie
  // reprise...) — affichées telles quelles au client, distinctes des champs
  // structurés ci-dessus qui restent obligatoires/à valeur par défaut.
  conditionsLocation: { type: String, trim: true, default: "" },
  conditionsVente:    { type: String, trim: true, default: "" },

  // ── Contact de l'annonceur ────────────────────────────────
  contactNom: { type: String, trim: true },
  contactTel: { type: String, trim: true },

  // ── Localisation ──────────────────────────────────────────
  // Code ISO-2 hérité du pays du partenaire propriétaire au moment de la
  // création (jamais depuis le body — voir vehicleController.createVehicle) —
  // sert au filtrage international du catalogue. `null` = annonces créées
  // avant cette fonctionnalité, traitées comme visibles depuis tous les pays.
  country:    { type: String, uppercase: true, trim: true, default: null },
  ville:      { type: String, trim: true },
  adresse:    { type: String, trim: true },
  coordonnees: {
    lat: { type: Number },
    lng: { type: Number },
  },
  // GeoJSON Point synchronisé automatiquement depuis coordonnees (voir hook
  // pre("save") plus bas) — Mongo n'indexe/ne recherche par proximité (2dsphere,
  // $geoNear) qu'au format GeoJSON, jamais directement {lat, lng}.
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },

  // ── Médias ────────────────────────────────────────────────
  images:      { type: [String], default: [] },
  // Vignette dédiée (~480px, qualité 0.6) générée côté client à la publication —
  // les vues LISTE (catalogue, favoris, mes annonces...) l'utilisent à la place
  // du tableau `images` pleine résolution (~1600px, jusqu'à plusieurs Mo/photo).
  // Les véhicules publiés avant l'ajout de ce champ restent sans vignette :
  // les vues liste retombent alors sur `images[0]` (voir limitVehicleImages).
  thumbnail:   { type: String, default: null },
  description: { type: String, trim: true },

  // ── Propriétaire (partenaire) ─────────────────────────────
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Entreprise du partenaire (facultatif) ──────────────────
  // Un partenaire peut gérer plusieurs entreprises domiciliées à des endroits
  // différents (voir PartnerBusiness.js) — purement indicatif/organisationnel,
  // ne conditionne jamais country/ville/adresse après coup (déjà éditables
  // indépendamment via updateVehicle). `null` = annonce non rattachée à une
  // entreprise déclarée (comportement historique, compte personnel).
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerBusiness",
    default: null,
  },

  // ── Rapport d'inspection (ref) ─────────────────────────────
  inspectionReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InspectionReport",
    default: null,
  },

  // ── Disponibilité ─────────────────────────────────────────
  // `available` reste entièrement recalculé depuis les réservations actives
  // (voir bookingController.syncVehicleAvailability) — `manuallyPaused` est
  // le seul levier permettant à un partenaire de le forcer à false (ex.
  // véhicule en maintenance), sans quoi il n'existait aucun moyen de retirer
  // un véhicule de la disponibilité en dehors d'une réservation en cours.
  available:      { type: Boolean, default: true },
  manuallyPaused: { type: Boolean, default: false },

  // ── Promotion partenaire (ex: "-15% aujourd'hui") ──────────
  // Gérée exclusivement via son propre endpoint (PATCH /:id/promotion) —
  // jamais mêlée à la création/modification générale de l'annonce, pour
  // garder la logique d'activation/expiration à un seul endroit.
  promotion: {
    active:          { type: Boolean, default: false },
    discountPercent: { type: Number,  default: 0, min: 0, max: 90 },
    label:           { type: String,  default: "" },
    startDate:       { type: Date,    default: null },
    endDate:         { type: Date,    default: null },
  },

  // ── Statistiques ──────────────────────────────────────────
  vues:          { type: Number, default: 0 },
  noteMoyenne:   { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis:    { type: Number, default: 0 },

  // ── Modération ────────────────────────────────────────────
  // draft/sold/archived sont des transitions PARTENAIRE (pas de modération) —
  // pending/approved/rejected restent exclusivement admin (voir
  // updateVehicleStatus vs updateVehicleLifecycle dans vehicleController.js).
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "draft", "sold", "archived"],
    default: "pending",
  },
  rejectionReason: { type: String, default: null },

  // Historique des changements de statut — permet à un partenaire de retrouver
  // quand une annonce est passée en brouillon/vendue/archivée, sans devoir
  // supprimer définitivement l'annonce pour "faire le ménage".
  statusHistory: [{
    status:    { type: String, required: true },
    changedAt: { type: Date,   default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  }],

  // ── Validation automatique ────────────────────────────────
  validationScore:    { type: Number, default: null },
  validationErrors:   { type: [String], default: [] },
  validationWarnings: { type: [String], default: [] },
  autoValidated:      { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

vehicleSchema.index({ owner: 1 });
vehicleSchema.index({ type: 1 });
vehicleSchema.index({ ville: 1 });
vehicleSchema.index({ country: 1 });
vehicleSchema.index({ pricePerDay: 1 });
// Couvre le filtre + tri exact du catalogue public (status:"approved", available:true,
// trié par createdAt desc) — remplace l'ancien index simple sur status seul, qui ne
// couvrait ni "available" ni le tri (fait en mémoire sur chaque requête).
vehicleSchema.index({ status: 1, available: 1, createdAt: -1 });
// Même couverture mais avec le pays en tête — sert le filtrage international du
// catalogue (le cas le plus fréquent en usage réel : un pays précis, pas "INTL").
vehicleSchema.index({ status: 1, available: 1, country: 1, createdAt: -1 });
// Géolocalisation (recherche "près de moi") — nécessite le format GeoJSON, voir
// le hook pre("save") ci-dessous qui synchronise `location` depuis `coordonnees`.
vehicleSchema.index({ location: "2dsphere" });

// Mettre à jour updatedAt automatiquement + synchroniser le point GeoJSON
// (coordonnees.lat/lng → location.coordinates) pour permettre les requêtes
// $geoNear/2dsphere sans dupliquer la saisie côté formulaire annonce.
vehicleSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  const lat = this.coordonnees?.lat;
  const lng = this.coordonnees?.lng;
  if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    this.location = { type: "Point", coordinates: [lng, lat] };
  } else {
    this.location = undefined;
  }
  next();
});

const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
export default Vehicle;
