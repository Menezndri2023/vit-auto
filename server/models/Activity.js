import mongoose from "mongoose";
import { ACTIVITY_TYPES, ACTIVITY_PRICE_UNITS } from "../constants/activityTypes.js";

/**
 * Activité culturelle/loisir (section "OTHERS" du catalogue) — Quad, Surf,
 * Montgolfière, Jetski, Jet privé, Bateau, etc. Modèle indépendant plutôt
 * qu'une extension de Vehicle (qui est saturé de champs voiture sans
 * équivalent ici) — même principe que Driver.js pour le chauffeur.
 */
const activitySchema = new mongoose.Schema({
  // ── Propriétaire de l'annonce (partenaire) ────────────────
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Entreprise du partenaire (facultatif) — même principe que Vehicle.business ──
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerBusiness",
    default: null,
  },

  activityType: {
    type: String,
    enum: ACTIVITY_TYPES,
    required: true,
  },

  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },

  // ── Tarification (toujours en USD au stockage — voir Vehicle.pricePerDay
  // pour le même principe) ───────────────────────────────────────────────
  price: { type: Number, required: true, min: 0 },
  // "per_person" = price × participants ; "per_session" = prix forfaitaire
  // pour la sortie entière quel que soit le nombre de participants (jusqu'à
  // capacity) — voir ACTIVITY_PRICE_UNITS.
  priceUnit: {
    type: String,
    enum: ACTIVITY_PRICE_UNITS,
    default: "per_person",
  },
  // Devise d'affichage figée (voir Vehicle.currency) + montant exact tel que
  // saisi par le partenaire (voir Vehicle.pricePerDayEntered) — même principe
  // pour ne jamais perdre de précision à l'aller-retour de conversion.
  currency:      { type: String, default: null },
  priceEntered:  { type: Number, default: null },
  priceEntryCurrency: { type: String, default: null },

  // Durée d'une session complète (minutes) — sert à calculer le créneau
  // occupé (voir bookingController.createBooking, branche "activite").
  durationMinutes: { type: Number, default: 60, min: 1 },

  // Nombre maximum de participants simultanés sur un même créneau (ex: flotte
  // de 5 quads, bateau 8 places) — les réservations concurrentes sur un même
  // créneau sont additionnées et plafonnées à cette capacité (voir
  // bookingController.createBooking).
  capacity: { type: Number, default: 1, min: 1 },

  // ── Essai (découverte courte avant réservation complète) — "certaines"
  // activités seulement (ex: leçon d'essai surf/quad avant de réserver une
  // session complète), au choix du partenaire par annonce plutôt que codé en
  // dur par type d'activité — même principe que Vehicle.instantBook.
  essaiDisponible:      { type: Boolean, default: false },
  essaiDurationMinutes: { type: Number, default: 30, min: 1 },
  // null = même prix que la session complète (price) ; sinon tarif dédié,
  // généralement inférieur (découverte).
  essaiPrice: { type: Number, default: null, min: 0 },

  // ── Médias ────────────────────────────────────────────────
  images:    { type: [String], default: [] },
  thumbnail: { type: String, default: null },

  // ── Localisation (même schéma que Vehicle — voir son pre("save") pour la
  // synchronisation GeoJSON) ─────────────────────────────────
  country: { type: String, uppercase: true, trim: true, default: null },
  ville:   { type: String, trim: true },
  adresse: { type: String, trim: true },
  coordonnees: {
    lat: { type: Number },
    lng: { type: Number },
  },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
  },

  // ── Disponibilité ─────────────────────────────────────────
  available:      { type: Boolean, default: true },
  manuallyPaused: { type: Boolean, default: false },

  // ── Statistiques ──────────────────────────────────────────
  vues:        { type: Number, default: 0 },
  noteMoyenne: { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis:  { type: Number, default: 0 },

  // ── Congés / indisponibilité bloquée manuellement (voir Driver.blackoutDates
  // pour le même principe) — un partenaire n'a sinon aucun moyen de bloquer
  // proactivement des dates précises (maintenance matériel, indisponibilité).
  blackoutDates: {
    type: [{
      start:  { type: Date, required: true },
      end:    { type: Date, required: true },
      reason: { type: String, default: "" },
    }],
    default: [],
  },

  // ── Modération (même cycle que Driver — pas de score d'auto-validation
  // pour une première version, toujours revue manuelle admin) ──────────────
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "archived"],
    default: "pending",
  },
  rejectionReason: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

activitySchema.index({ owner: 1 });
activitySchema.index({ status: 1 });
activitySchema.index({ activityType: 1 });
activitySchema.index({ country: 1 });
// Couvre le filtre + tri du catalogue public (status:"approved", pays précis,
// type d'activité, trié par récence) — même logique que Vehicle/Driver.
activitySchema.index({ status: 1, available: 1, country: 1, createdAt: -1 });
activitySchema.index({ location: "2dsphere" });

activitySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  const lat = this.coordonnees?.lat;
  const lng = this.coordonnees?.lng;
  if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    this.location = { type: "Point", coordinates: [lng, lat] };
  } else {
    // Sans ce reset, le défaut de schéma location.type ("Point") fuite tel
    // quel (coordinates resterait absent) — GeoJSON invalide pour l'index
    // 2dsphere, l'insertion échoue (voir Vehicle.js, même correctif).
    this.location = undefined;
  }
  next();
});

const Activity = mongoose.models.Activity || mongoose.model("Activity", activitySchema);
export default Activity;
