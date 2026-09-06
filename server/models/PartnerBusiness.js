import mongoose from "mongoose";

// Un partenaire peut opérer plusieurs entreprises domiciliées à des endroits
// différents (parfois dans des pays différents) — chacune avec sa propre
// identité de contact et localisation, choisie au moment de publier un
// véhicule (voir vehicleController.createVehicle) pour que l'annonce hérite
// automatiquement du bon pays/ville/adresse au lieu du User.country unique.
const partnerBusinessSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  companyName: { type: String, trim: true, required: true },

  // Code ISO-2 (cf CountryConfig) — sert à préremplir Vehicle.country.
  country: { type: String, uppercase: true, trim: true, required: true },
  ville:   { type: String, trim: true, required: true },
  adresse: { type: String, trim: true, default: null },
  coordonnees: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },

  contactNom: { type: String, trim: true, default: null },
  contactTel: { type: String, trim: true, default: null },

  // Une seule entreprise par défaut par partenaire — préremplit le formulaire
  // de publication quand aucune n'est explicitement choisie.
  isDefault: { type: Boolean, default: false },

  // Marque cette entité comme concessionnaire (vs entreprise/local générique) —
  // indépendant par entité : un même partenaire peut avoir plusieurs entreprises,
  // certaines concessionnaires, d'autres non. Purement déclaratif (auto-toggle
  // par le partenaire), affiché comme badge sur les annonces rattachées
  // (Vehicle.business) — voir VehicleDetails.jsx.
  isConcessionnaire: { type: Boolean, default: false },

  // ── Politique de location (Booking Engine — Éligibilité, 2026-09) ────────
  // Règles par défaut de cette entité, utilisées par
  // server/services/eligibilityEngine.js en complément (jamais en remplacement)
  // des champs déjà existants au niveau véhicule (Vehicle.ageMin/permisRequis/
  // requiredVerificationLevel). Tout champ à `null`/valeur par défaut = aucune
  // règle partenaire, l'éligibilité retombe alors uniquement sur le véhicule —
  // comportement Phase 1 strictement inchangé tant qu'aucun partenaire ne
  // configure cette section.
  rentalPolicy: {
    minimumAge:                   { type: Number, default: null },
    // Ancienneté minimale du permis exigée, en années (comparée à
    // User.driverLicenseOcr.deliveredDate).
    minimumLicenseYears:          { type: Number, default: null },
    // Tri-état volontaire (jamais true/false par défaut) : `null` = aucune
    // règle partenaire pour ce critère, on retombe entièrement sur le
    // véhicule (Vehicle.permisRequis, requiredVerificationLevel...) — un
    // défaut à `true` aurait activé silencieusement une exigence partenaire
    // dès qu'une seule entrée de rentalPolicy est enregistrée (ex. un
    // partenaire qui fixe juste un âge minimum), y compris pour des véhicules
    // qui n'en demandaient pas. Voir eligibilityEngine.js (`=== true` strict).
    identityDocumentRequired:     { type: Boolean, default: null },
    drivingLicenseRequired:       { type: Boolean, default: null },
    internationalLicenseRequired: { type: Boolean, default: null },
    depositRequired:              { type: Boolean, default: null },
    // Réutilise le calcul Haversine déjà construit pour les frais de
    // livraison (server/services/deliveryFee.js) — null = pas de limite.
    maxDeliveryRadiusKm:          { type: Number, default: null },
    additionalRequirements:       { type: String, trim: true, default: null },
  },

  // Dernière relance envoyée pour "aucune candidature Founding Partner Program
  // démarrée pour cette entité" — voir utils/partnerReminders.js
  // checkPartnerBusinessesWithoutOnboarding. Le programme étant devenu
  // obligatoire pour tout partenaire, une entité sans dossier du tout (jamais
  // "Commencer ma candidature") est un cas à relancer au même titre qu'un
  // dossier brouillon jamais soumis.
  lastReminderSentAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

partnerBusinessSchema.index({ owner: 1, createdAt: 1 });

partnerBusinessSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const PartnerBusiness =
  mongoose.models.PartnerBusiness ||
  mongoose.model("PartnerBusiness", partnerBusinessSchema);

export default PartnerBusiness;
