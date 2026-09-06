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
  pricePerDay:  { type: Number }, // location
  priceForSale: { type: Number }, // vente
  // Bug réel corrigé (audit) : le formulaire de saisie affichait "Caution
  // (USD)" mais n'appliquait JAMAIS la conversion de devise appliquée à
  // pricePerDay/priceForSale — un partenaire tapant sa caution dans sa devise
  // locale (ex: 8000 MAD) la voyait stockée telle quelle, traitée ensuite
  // comme 8000 USD partout (affichage ET Booking.cautionAmount, un vrai
  // montant financier). `caution` est désormais TOUJOURS en USD comme les
  // autres champs de tarification — voir cautionEntered ci-dessous pour
  // l'affichage exact.
  caution:      { type: Number }, // caution location — toujours optionnelle, toujours USD

  // Devise D'AFFICHAGE choisie par le partenaire/admin pour CETTE annonce
  // (voir vehicleController.createVehicle/updateVehicle) — `null` (par
  // défaut) = pas de préférence, chaque visiteur voit le prix converti dans
  // SA PROPRE devise détectée par IP/GPS (voir CurrencyContext.jsx). Une
  // valeur explicite FIGE l'affichage dans cette devise pour TOUS les
  // visiteurs, quel que soit leur pays (ex : le partenaire veut afficher en
  // EUR pour cibler une clientèle européenne). N'affecte JAMAIS le stockage
  // interne (pricePerDay/priceForSale restent toujours en USD, seule la
  // présentation change) — voir PriceTag `pinnedCurrency`.
  currency: { type: String, default: null },

  // Montant EXACT tel que tapé par le partenaire (dans `priceEntryCurrency`),
  // conservé à côté de pricePerDay/priceForSale (toujours en USD, arrondis à
  // 2 décimales) — bug réel corrigé (audit) : sans ce champ, l'aller-retour
  // de conversion (saisie → USD arrondi → reconversion pour l'affichage)
  // perdait systématiquement de la précision (ex: 350 MAD saisis devenaient
  // 35.29 USD stockés, puis ré-affichés à 349,99 MAD au lieu de 350 pile).
  // `null` tant que le prix n'a jamais été ressaisi depuis ce correctif —
  // l'affichage retombe alors sur l'ancien calcul (PriceTag).
  pricePerDayEntered:  { type: Number, default: null },
  priceForSaleEntered: { type: Number, default: null },
  cautionEntered:      { type: Number, default: null },
  priceEntryCurrency:  { type: String, default: null },

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
  // Niveau de vérification client minimum exigé pour réserver CE véhicule
  // (Booking Engine, 2026-09) — "ACCOUNT_VERIFIED" (téléphone/email vérifié,
  // Niveau 1) s'applique déjà à toute réservation quel que soit ce champ ;
  // "IDENTITY_VERIFIED" ajoute l'exigence User.kycStatus==="VERIFIE"
  // (Niveau 2) ; "RENTAL_VERIFIED" (Niveau 3, ajouté en Phase 3) ajoute en
  // plus un permis de conduire vérifié (User.driverLicenseOcr, non expiré) —
  // voir server/services/eligibilityEngine.js pour le calcul complet
  // (combine aussi PartnerBusiness.rentalPolicy et l'âge du client).
  requiredVerificationLevel: {
    type: String,
    enum: ["ACCOUNT_VERIFIED", "IDENTITY_VERIFIED", "RENTAL_VERIFIED"],
    default: "ACCOUNT_VERIFIED",
  },
  // Réservation instantanée (location uniquement) — la demande passe
  // directement à "confirmed" au lieu de "pending", sans attendre l'action
  // manuelle du partenaire. N'existait pas du tout jusqu'ici (aucune
  // réservation location n'était jamais confirmée automatiquement, quel que
  // soit le partenaire). Activable par le partenaire, mais re-vérifié côté
  // serveur à chaque réservation (certificationBadge !== "none" ou Founding
  // Partner requis — voir bookingController.createBooking) : jamais de
  // confiance aveugle dans ce booléen seul, un partenaire non vérifié ne peut
  // pas l'activer même s'il est resté coché depuis avant sa suspension.
  instantBook:          { type: Boolean, default: false },
  // Durée minimale de location (jours) — distincte de `promotions[].minDays`
  // (seuil d'application d'une remise) : ici c'est une contrainte de
  // réservation, appliquée côté serveur dans bookingController.createBooking
  // (voir "location.days < vehicle.dureeMinLocation" → 400).
  dureeMinLocation:     { type: Number, default: 1, min: 1 },
  // Conditions particulières facultatives saisies librement par le partenaire
  // (ex. kilométrage inclus/jour, pénalités retard, état des lieux, garantie
  // reprise...) — affichées telles quelles au client, distinctes des champs
  // structurés ci-dessus qui restent obligatoires/à valeur par défaut.
  conditionsLocation: { type: String, trim: true, default: "" },
  conditionsVente:    { type: String, trim: true, default: "" },

  // Politique de carburant/annulation/assurance — jusqu'ici uniquement
  // couvertes par le texte libre `conditionsLocation`, sans champ dédié
  // affichable/filtrable séparément (demande explicite : afficher ces 3
  // informations distinctement dans le détail de l'annonce). Texte libre
  // (pas d'enum) pour rester compatible avec des formulations différentes
  // selon les partenaires (ex. "Plein/Plein" vs "Identique").
  fuelPolicy:         { type: String, trim: true, default: null },
  cancellationPolicy: { type: String, trim: true, default: null },
  insuranceIncluded:  { type: Boolean, default: false },

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

  // ── Promotions partenaire (paliers configurables) ──────────
  // Remplace l'ancien champ unique `promotion` (un seul pourcentage, sans
  // condition de durée) — un partenaire peut désormais déclarer plusieurs
  // règles simultanées (ex. "-15% dès 3 jours" ET "-25% dès 7 jours" ET
  // "-10000 FCFA dès 2 jours" pour un règlement comptant) ; la règle la plus
  // avantageuse pour la durée réellement réservée est retenue au calcul
  // (voir server/utils/promotion.js selectBestPromotionRule). Ancien champ
  // `promotion` migré automatiquement vers `promotions[0]` puis supprimé
  // (voir server.js runOnceMigration "vehicle-promotion-rules-2026-07-28").
  // Gérée exclusivement via son propre endpoint (PATCH /:id/promotion) —
  // jamais mêlée à la création/modification générale de l'annonce, pour
  // garder la logique d'activation/expiration à un seul endroit.
  promotions: {
    type: [{
      // "percent" = remise en % du prix total du séjour ; "fixed" = montant
      // fixe déduit du prix total (jamais un prix/jour — n'a de sens qu'au
      // niveau du séjour complet, ex. "10000 FCFA de moins à partir de 3 jours").
      type: {
        type: String,
        enum: ["percent", "fixed"],
        required: true,
      },
      value: {
        type: Number,
        required: true,
        min: 0,
        validate: {
          validator: function (v) {
            return this.type === "percent" ? (v > 0 && v <= 90) : v > 0;
          },
          message: "Valeur de remise invalide (pourcentage entre 1 et 90, ou montant fixe positif).",
        },
      },
      // Durée minimale de location (en jours) pour que la règle s'applique —
      // c'est ce qui permet des paliers ("25% dès 5 jours", "15% dès 3 jours").
      minDays:   { type: Number, default: 1, min: 1 },
      label:     { type: String, default: "" },
      active:    { type: Boolean, default: true },
      startDate: { type: Date, default: null },
      endDate:   { type: Date, default: null },
    }],
    default: [],
  },

  // ── Tarification saisonnière (paliers configurables par période de l'année) ──
  // Remplace le tarif unique `pricePerDay` par des périodes récurrentes chaque
  // année (mois/jour, sans année — ex. "haute saison" du 15/06 au 05/09) où un
  // tarif différent s'applique. Contrairement à `promotions` (toujours une
  // REMISE sur le prix), une règle ici est un prix/jour de REMPLACEMENT complet
  // (généralement plus élevé) — voir server/utils/seasonalPricing.js pour le
  // calcul (tarif appliqué jour par jour sur la durée réservée, ce qui gère
  // correctement un séjour à cheval entre deux saisons). Éditable via son
  // propre endpoint PATCH /:id/seasonal-rates (owner ou admin — même pattern
  // que promotions/updatePromotion ci-dessous), jamais mêlé à
  // création/modification générale de l'annonce.
  seasonalRates: {
    type: [{
      label: { type: String, trim: true, default: "" },
      // Mois/jour de début et fin (1-12 / 1-31), sans année : la période se
      // répète automatiquement chaque année sans ressaisie. Un intervalle où
      // la fin est "avant" le début dans l'année (ex. 01/12 → 28/02) est
      // traité comme à cheval sur le nouvel an (voir isDateInSeasonalRange).
      startMonth: { type: Number, required: true, min: 1, max: 12 },
      startDay:   { type: Number, required: true, min: 1, max: 31 },
      endMonth:   { type: Number, required: true, min: 1, max: 12 },
      endDay:     { type: Number, required: true, min: 1, max: 31 },
      // Prix/jour de remplacement pour cette période — toujours en USD comme
      // pricePerDay (voir pricePerDayEntered/priceEntryCurrency plus haut pour
      // le même principe de conservation du montant exact saisi).
      pricePerDay:         { type: Number, required: true, min: 0 },
      pricePerDayEntered:  { type: Number, default: null },
      priceEntryCurrency:  { type: String, default: null },
      active: { type: Boolean, default: true },
    }],
    default: [],
  },

  // ── Mise en avant (carousel d'accueil / "Véhicules en vedette") ──────────
  // Bug réel corrigé (audit) : ces 3 champs étaient déjà référencés partout
  // (updateVehicle.ADMIN_ONLY, le bouton "⭐" de AdminPanel.jsx) mais jamais
  // déclarés sur ce schéma — en mode `strict` (défaut Mongoose), toute
  // écriture sur un chemin non déclaré est silencieusement ignorée : le
  // bouton "Mettre en vedette" de l'admin ne faisait donc RIEN depuis sa
  // création, malgré une réponse 200 OK trompeuse. `featured` est le SEUL
  // levier de mise en avant — jamais dérivé de `available`/`boostLevel`
  // seuls (voir HeroSection.jsx/VehicleList.jsx) : un partenaire achetant un
  // boost (voir subscriptionController.purchaseBoost, qui n'écrit que sur
  // Subscription.boosts[], jamais ici) obtient une visibilité accrue dans le
  // CATALOGUE normal, jamais une entrée automatique dans le carousel/vedette
  // sans validation explicite d'un admin.
  featured:       { type: Boolean, default: false },
  boostLevel:     { type: Number,  default: 0 },    // informationnel — n'influence jamais featured
  sponsoredUntil: { type: Date,    default: null },

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

vehicleSchema.index({ status: 1, available: 1, featured: 1, createdAt: -1 });
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
