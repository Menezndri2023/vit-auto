import mongoose from "mongoose";

/**
 * Booking couvre 5 types de commandes :
 *  - "location"  : réservation véhicule avec dates
 *  - "essai"     : demande de rendez-vous pour essai (vente)
 *  - "chauffeur" : réservation d'un chauffeur
 *  - "leasing"   : demande de financement (leasing/crédit)
 *  - "activite"  : réservation d'une activité culturelle/loisir (section
 *    OTHERS — Quad, Surf, Montgolfière, Jetski, Jet privé, Bateau...), avec
 *    un mode "essai" facultatif porté par activite.essai (voir Activity.js
 *    essaiDisponible) plutôt qu'un type Booking dédié.
 */
const bookingSchema = new mongoose.Schema({
  // ── Type de commande ──────────────────────────────────────
  type: {
    type: String,
    enum: ["location", "essai", "chauffeur", "leasing", "activite"],
    required: true,
  },

  // ── Référence unique générée à la création ────────────────
  // Ex: VIT-LOC-2026-000001
  reference: { type: String, unique: true, sparse: true },

  // ── Statut de la commande ─────────────────────────────────
  // pending → confirmed → preparing → ready → in_progress
  //   → client_arrived | client_absent
  //   → transaction_concluded | transaction_not_concluded
  //   → waiting_client_validation → completed | disputed
  //
  // "driver_arrived" est distinct de "client_arrived" : réservé aux missions
  // chauffeur (type "chauffeur"), c'est le CLIENT ("l'employeur") qui confirme
  // que le chauffeur est arrivé pour démarrer la mission — alors que
  // "client_arrived" est déclenché par le PARTENAIRE et signifie autre chose
  // selon le type (destination atteinte pour un chauffeur, présence du client
  // pour une location). Voir bookingController.markDriverArrived/completeMission.
  status: {
    type: String,
    enum: [
      "pending", "confirmed", "preparing", "ready", "in_progress",
      "client_arrived", "client_absent", "driver_arrived",
      "transaction_concluded", "transaction_not_concluded",
      "waiting_client_validation",
      "completed", "cancelled", "disputed",
    ],
    default: "pending",
  },

  // ── Validation admin obligatoire (audit 2026-08) ──────────
  // Champ ORTHOGONAL à `status` ci-dessus, volontairement pas une valeur
  // supplémentaire de cet enum : `status` est référencé dans la machine à
  // états (VALID_TRANSITIONS), les filtres admin/partenaire et l'affichage
  // (badges colorés) à plus de 15 endroits — y ajouter un statut intermédiaire
  // aurait cassé tout ça. Ici : aucune demande (réservation, essai, achat)
  // n'est visible/actionnable par un partenaire tant qu'un admin ne l'a pas
  // explicitement approuvée (voir getPartnerBookings, assertPartnerCanAct).
  // Les commandes déjà en base avant ce correctif sont backfillées à
  // "approved" par migration (voir server.js — runOnceMigration).
  adminValidation: {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    validatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    validatedAt:   { type: Date, default: null },
    refusalReason: { type: String, default: null },
    // Ex-"instantConfirm" : le partenaire a activé Vehicle.instantBook, mais
    // passe désormais quand même par la validation admin (jamais de bypass
    // total) — seulement priorisé dans la file, et confirmé automatiquement
    // (status → "confirmed") dès l'approbation admin pour préserver la
    // rapidité perçue côté client.
    fastTrack: { type: Boolean, default: false },
    // Booking Engine (2026-09) : le gate n'exige plus un ADMIN humain — la
    // décision d'approbation vient désormais par défaut du score de fraude
    // (voir queue/workers/ai.worker.js fraud_detection + bookingActionService
    // autoApproveBooking). `validatedBy` reste `null` quand c'est le système
    // qui approuve ; seul un risque "high" laisse encore `status:"pending"`
    // pour la revue humaine d'exception (queue admin existante, inchangée).
    validatedByType: { type: String, enum: ["SYSTEM", "ADMIN"], default: null },
  },

  // ── Score de fraude (Booking Engine, 2026-09) ─────────────
  // Persiste enfin le résultat de fraud_detection (ai.worker.js), calculé à
  // chaque réservation depuis l'ajout du job mais jusqu'ici jamais écrit nulle
  // part (seulement loggé + alerte admin si risque élevé) — c'est maintenant
  // la donnée qui décide de l'auto-approbation.
  fraudCheck: {
    riskLevel: { type: String, enum: ["low", "medium", "high", null], default: null },
    flags:     { type: [String], default: [] },
    checkedAt: { type: Date, default: null },
  },

  // Horodatage de la notification partenaire (WhatsApp/interne) au moment de
  // l'approbation — base de calcul du délai de réponse partenaire (15/25/30
  // min, voir server/utils/partnerResponseReminders.js). `null` tant que la
  // réservation n'a jamais été approuvée (risque élevé toujours en attente).
  partnerNotifiedAt: { type: Date, default: null },
  reminder15SentAt:  { type: Date, default: null },
  reminder25SentAt:  { type: Date, default: null },

  // ── Trace d'audit (Booking Engine, 2026-09) ───────────────
  // Append-only — n'existait pas du tout jusqu'ici (seuls des champs ponctuels
  // type cancelledBy/disputeResolution.resolvedBy capturaient un acteur unique
  // pour une action terminale précise). Alimenté par bookingActionService.js à
  // chaque action, quel que soit le canal d'origine (dashboard, WhatsApp...).
  auditTrail: [{
    action:    { type: String, required: true },
    actorType: { type: String, enum: ["CLIENT", "PARTNER", "ADMIN", "SYSTEM"], required: true },
    actorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    source:    { type: String, enum: ["DASHBOARD", "WHATSAPP", "EMAIL", "PUSH", "API", "SYSTEM"], default: "API" },
    timestamp: { type: Date, default: Date.now },
    metadata:  { type: mongoose.Schema.Types.Mixed, default: null },
  }],

  // ── Alternative proposée par le partenaire (Booking Engine, 2026-09) ──
  // Le partenaire ne peut aujourd'hui que confirmer ou annuler — aucun moyen
  // de proposer un autre véhicule/créneau sans faire recommencer le client
  // depuis zéro. `clientResponse` reste "pending" tant que le client n'a pas
  // tranché (voir bookingActionService.respondToAlternative).
  alternative: {
    proposedVehicle:    { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
    proposedStartDate:  { type: Date, default: null },
    proposedEndDate:    { type: Date, default: null },
    proposedPrice:      { type: Number, default: null },
    note:               { type: String, default: null },
    proposedAt:         { type: Date, default: null },
    clientResponse:     { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
    respondedAt:         { type: Date, default: null },
  },

  // ── Parties impliquées ────────────────────────────────────
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null, // null si non connecté
  },

  // Infos client (remplies même si non connecté)
  clientInfo: {
    firstName:  { type: String, required: true },
    lastName:   { type: String, required: true },
    email:      { type: String, required: true },
    phone:      { type: String },
    // Numéro de pièce (passeport/CNI), optionnel — le vrai justificatif de la
    // réservation est désormais l'image jointe dans clientKycSnapshot (voir
    // ce champ plus bas), pas un numéro en texte libre. Conservé pour
    // référence si le client le renseigne — voir bookingController.createBooking.
    passportNumber: { type: String, default: null },
    kycStatus:  { type: String, default: null },   // statut KYC au moment de la réservation
    kycScore:   { type: Number, default: null },
    kycVerified:{ type: Boolean, default: false },
  },

  // Véhicule réservé (location ou essai)
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    default: null,
  },

  // Chauffeur réservé
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    default: null,
  },

  // Activité réservée (section OTHERS — voir Activity.js)
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
    default: null,
  },

  // ── Champs spécifiques : LOCATION ─────────────────────────
  location: {
    startDate:      { type: Date },
    endDate:        { type: Date },
    days:           { type: Number, default: 0 },

    // Mode de prise en charge : "retrait" (agence) | "livraison" (domicile)
    pickupMethod:   { type: String, enum: ["retrait", "livraison"], default: "retrait" },

    // Prise en charge (texte + coordonnées GPS)
    pickupLocation: { type: String },
    pickupPosition: {
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      address: { type: String, default: null },
      // Champs structurés (Booking Engine — livraison, 2026-09) — additifs,
      // remplissables via le sélecteur de carte ou la saisie manuelle
      // (voir src/components/DeliveryMapPicker), jamais requis pour ne pas
      // casser une réservation créée avant leur ajout.
      city:         { type: String, default: null },
      postalCode:   { type: String, default: null },
      instructions: { type: String, default: null },
    },

    // Frais de livraison — calculé côté serveur (Haversine), jamais fourni par le client
    deliveryFee:    { type: Number, default: 0 },

    // Point de retour / relais (texte + coordonnées GPS)
    returnLocation: { type: String },
    returnPosition: {
      lat:     { type: Number, default: null },
      lng:     { type: Number, default: null },
      address: { type: String, default: null },
    },

    options: {
      gps:       { type: Boolean, default: false },
      babySeat:  { type: Boolean, default: false },
      insurance: { type: Boolean, default: false },
      driver:    { type: Boolean, default: false },
    },
  },

  // ── Suivi de livraison (Booking Engine, 2026-09) ──────────────────────────
  // Champ ORTHOGONAL à `status` ci-dessus — même principe que
  // `adminValidation` (voir son commentaire) : `pickupMethod:"livraison"` ne
  // faisait jusqu'ici que déclencher le calcul de deliveryFee, sans aucun
  // suivi (le partenaire n'avait aucun moyen de confirmer/refuser/signaler
  // "en route"/"livré"). Reste à "none" pour toute réservation en retrait
  // agence. Voir server/services/bookingActionService.js pour les
  // transitions (acceptBooking confirme automatiquement à l'acceptation,
  // markVehicleOnTheWay/markVehicleDelivered pour le suivi).
  delivery: {
    status: {
      type: String,
      enum: ["none", "requested", "confirmed", "rejected", "rescheduled", "on_the_way", "delivered"],
      default: "none",
    },
    // = location.startDate au moment de la demande — conservé séparément
    // car une ALTERNATIVE (voir bookingActionService.proposeAlternative)
    // peut faire évoluer location.startDate sans que ceci ne soit rejoué.
    requestedDateTime: { type: Date, default: null },
    confirmedBy:        { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt:         { type: Date, default: null },
    rejectionReason:     { type: String, default: null },
    onTheWaySentAt:      { type: Date, default: null },
    deliveredAt:         { type: Date, default: null },
  },

  // ── Champs spécifiques : ESSAI (rendez-vous d'essai avant achat) ──────────
  essai: {
    preferredDate: { type: Date },
    preferredTime: { type: String },
    // Calculée côté serveur (preferredDate + preferredTime + durée fixe),
    // jamais depuis le client — même principe que chauffeur.dateFin : permet
    // de détecter qu'un véhicule en vente est déjà réservé pour un essai sur
    // le même créneau (aucun contrôle n'existait auparavant).
    dateFin:       { type: Date },
    notes:         { type: String },
  },

  // ── Champs spécifiques : CHAUFFEUR ────────────────────────
  chauffeur: {
    date:        { type: Date },
    // Calculé côté serveur (date + heures), jamais depuis le client — permet
    // une détection de conflit de planning efficace au niveau requête Mongo,
    // sur le même principe que location.startDate/endDate pour les véhicules.
    dateFin:     { type: Date },
    heures:      { type: Number },
    lieuDepart:  { type: String },
    destination: { type: String },
    notes:       { type: String },
  },

  // ── Champs spécifiques : ACTIVITE (Quad, Surf, Montgolfière, Jetski, Jet
  // privé, Bateau...) ────────────────────────────────────────
  activite: {
    date:         { type: Date },
    // Calculé côté serveur (date + Activity.durationMinutes ou
    // essaiDurationMinutes selon `essai`), jamais depuis le client — même
    // principe que chauffeur.dateFin pour la détection de conflit.
    dateFin:      { type: Date },
    participants: { type: Number, default: 1 },
    // true = créneau d'essai/découverte (voir Activity.essaiDisponible),
    // false = session complète — distingue le tarif et la durée appliqués.
    essai:        { type: Boolean, default: false },
    notes:        { type: String },
  },

  // ── Financier (USD — voir server/scripts/migrate-vehicle-booking-to-usd.mjs
  // pour la migration des réservations créées avant ce changement de pivot,
  // toutes implicitement en FCFA/XOF) ───────────────────────
  montantBase:    { type: Number, default: 0 },
  montantOptions: { type: Number, default: 0 },
  montantTotal:   { type: Number, default: 0 },
  devise:         { type: String, default: "USD" },
  // Fidélité (voir bookingController.js — createBooking/awardLoyaltyPoints) —
  // déjà déduit de montantTotal au moment de la création, conservé ici pour
  // traçabilité (reçu, historique client) plutôt que recalculé après coup.
  loyaltyPointsRedeemed: { type: Number, default: 0 },
  loyaltyDiscount:       { type: Number, default: 0 }, // USD

  // ── Commission & Frais plateforme ─────────────────────────
  // Taux résolus dynamiquement par pricingEngine.resolveCommissionRate() (voir
  // server/services/pricingEngine.js) — PricingConfig est la source de vérité,
  // pas ces defaults (utilisés seulement si jamais recalculés).
  commissionRate:   { type: Number, default: 0 },      // ex: 0.15
  commissionAmount: { type: Number, default: 0 },      // montantBase * commissionRate
  serviceFeeFCFA:   { type: Number, default: 1 },      // nom conservé (voir Vehicle/Booking dans le plan de refonte), désormais en USD — calculé par pricingEngine.computeServiceFee()
  cautionAmount:    { type: Number, default: 0 },      // caution / dépôt de garantie
  partnerPayout:    { type: Number, default: 0 },      // net versé au partenaire

  // ── Vérification client ───────────────────────────────────
  clientVerification: {
    idType:     { type: String, enum: ["cni", "passport", "permis", null], default: null },
    idNumber:   { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
  },

  // ── Instantané KYC complet (copié au moment de la réservation) ────────────
  // ── Fuite corrigée (Booking Engine — Éligibilité, 2026-09) ────────────────
  // Bug réel trouvé en audit : ce snapshot est un champ RACINE de Booking (pas
  // du User populé) — la restriction déjà appliquée à `client` (populate avec
  // projection limitée selon le rôle, voir getBookingDetail/getPartnerBookings)
  // ne le couvrait donc jamais. `select:false` sur les champs images/OCR bruts
  // ci-dessous les exclut désormais de TOUTE requête (y compris .lean(), y
  // compris pour l'admin — son écran de revue KYC lit toujours les données
  // fraîches depuis User.identity/kycOcrData via kycController.js, jamais ce
  // snapshot figé). Les champs texte non biométriques (idType/idNumber/
  // licenceNumber/expiry/catégories/kycStatus/kycScore) restent nécessaires
  // au partenaire pour l'exécution de la location (contrat, vérification à la
  // remise) et ne sont pas concernés.
  clientKycSnapshot: {
    idType:            { type: String, default: null },
    idNumber:          { type: String, default: null },
    frontImage:        { type: String, default: null, select: false },
    backImage:         { type: String, default: null, select: false },
    selfie:            { type: String, default: null, select: false },
    licenseFrontImage: { type: String, default: null, select: false },
    licenseBackImage:  { type: String, default: null, select: false },
    licenseNumber:     { type: String, default: null },
    licenseExpiry:     { type: Date,   default: null },
    licenseCategories: { type: String, default: null },
    ocrData:           { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    faceMatchScore:    { type: Number, default: null, select: false },
    kycStatus:         { type: String, default: null },
    kycScore:          { type: Number, default: null },
    snapshotAt:        { type: Date,   default: null },
  },

  // ── Vérification KYC manuelle par le partenaire (en présentiel) ──────────
  partnerKycVerification: {
    status:     { type: String, enum: ["non_verifie", "verifie", "rejete"], default: "non_verifie" },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date,   default: null },
    note:       { type: String, default: null },
  },

  // ── Contrat digital ───────────────────────────────────────
  contract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null,
  },

  // ── Paiement ──────────────────────────────────────────────
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null,
  },
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },

  // ── Leasing ───────────────────────────────────────────────
  leasing: {
    // Le type "leasing" de Booking couvre à la fois une demande de Leasing
    // (LOA) et de Crédit classique (Vehicle.leasing / Vehicle.credit) — même
    // machine à états et mêmes champs financiers, seul le produit choisi par
    // le client diffère (voir Vehicle.credit, ajouté en parallèle du leasing).
    financingType: { type: String, enum: ["leasing", "credit"], default: "leasing" },
    apportInitial: { type: Number, default: 0 },
    mensualite:    { type: Number, default: 0 },
    duree:         { type: Number, default: 36 },
    tauxInteret:   { type: Number, default: 8 },
    totalLeasing:  { type: Number, default: 0 },

    // ── Décision admin (revue manuelle — aucune banque partenaire intégrée
    // pour l'instant, voir server/controllers/bookingController.js
    // setFinancingDecision) ──────────────────────────────────────────────
    decision:     { type: String, enum: ["en_etude", "accepte", "refuse"], default: "en_etude" },
    decisionNote: { type: String, default: null },
    decisionAt:   { type: Date,   default: null },
    decisionBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── Transaction finale (saisie partenaire) ───────────────
  transaction: {
    finalAmount:    { type: Number, default: null },
    paymentMethod:  { type: String, default: null },   // cash | card | orange_money | wave | mtn | moov
    comment:        { type: String, default: null },
    recordedAt:     { type: Date,   default: null },
    recordedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // ── Mode de financement réellement conclu (essai/vente uniquement) ──────
    // Distinct de paymentMethod (le rail de paiement de l'apport initial) :
    // décrit COMMENT l'achat a été financé, négocié sur place lors de la
    // conclusion de la transaction — peut différer des conditions leasing/
    // crédit publiées sur l'annonce (voir Vehicle.leasing / Vehicle.credit).
    financing: {
      type:          { type: String, enum: ["comptant", "leasing", "credit"], default: "comptant" },
      apportInitial: { type: Number, default: 0 },
      mensualite:    { type: Number, default: 0 },
      duree:         { type: Number, default: 0 },
      tauxInteret:   { type: Number, default: 0 },
    },
  },

  // ── Validation client ──────────────────────────────────────
  clientValidation: {
    validatedAt:   { type: Date,   default: null },
    disputedAt:    { type: Date,   default: null },
    disputeReason: { type: String, default: null },
  },

  // ── Commission calculée sur transaction ───────────────────
  // (commissionRate et commissionAmount déjà présents, mise à jour au moment du completed)
  invoiced:   { type: Boolean, default: false },   // inclus dans une facture mensuelle
  invoice:    { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },

  // ── Avis post-commande ────────────────────────────────────
  // review : avis du client sur le véhicule/chauffeur (historique, inchangé —
  // reste la source de `hasReview` côté frontend).
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Review",
    default: null,
  },
  // Avis bidirectionnels (Booking Engine Phase 5) — orthogonaux à `review`,
  // permettent de savoir en O(1) ce qui a déjà été soumis pour cette
  // réservation sans requêter la collection Review.
  partnerReviewByClient: { type: mongoose.Schema.Types.ObjectId, ref: "Review", default: null },
  platformReviewByClient:{ type: mongoose.Schema.Types.ObjectId, ref: "Review", default: null },
  clientReviewByPartner: { type: mongoose.Schema.Types.ObjectId, ref: "Review", default: null },

  // ── Annulation ────────────────────────────────────────────
  cancelledAt:  { type: Date, default: null },
  cancelReason: { type: String, default: null }, // motif libre, facultatif
  // Motif catégorisé obligatoire (voir constants/bookingCancelReasons.js) —
  // liste différente selon qui annule (CLIENT_CANCEL_REASONS / PARTNER_CANCEL_REASONS),
  // validée par le contrôleur (pas d'enum Mongoose unique ici, les deux listes
  // se chevauchent partiellement mais restent sémantiquement distinctes).
  cancelReasonCode: { type: String, default: null },
  cancelledBy: { type: String, enum: ["client", "partenaire", "admin", "system", null], default: null },

  // ── Caution (dépôt de garantie) : traitement au retour ────────────────
  // cautionAmount (ci-dessus) n'était qu'un montant à percevoir, affiché mais
  // jamais réellement traité : le contrat promet "tout dommage sera prélevé
  // sur la caution" mais rien ne permettait au partenaire de retenir/restituer
  // quoi que ce soit après la location. Bug réel trouvé en audit.
  cautionClaim: {
    amountClaimed: { type: Number, default: null }, // 0 = caution intégralement restituée
    reason:        { type: String, default: null }, // obligatoire si amountClaimed > 0
    claimedAt:     { type: Date,   default: null },
    claimedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── Résolution de litige (Admin) ──────────────────────────
  disputeResolution: {
    resolution:   { type: String, enum: ["completed", "cancelled", "compensated", null], default: null },
    note:         { type: String, default: null },
    resolvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt:   { type: Date,   default: null },
    refundClient: { type: Boolean, default: false },
  },

  // ── Réponse du partenaire à un litige (Bug réel corrigé, audit) ───────────
  // Un partenaire notifié d'un litige (voir validateTransaction) n'avait
  // strictement aucun moyen d'apporter des éléments avant que l'admin ne
  // tranche (resolveDispute) — simple spectateur passif, renvoyé vers
  // "contactez le support" hors plateforme.
  partnerDisputeResponse: {
    message:     { type: String, default: null },
    respondedAt: { type: Date,   default: null },
  },

  // Rappel automatique avant prise en charge (voir server/utils/bookingReminders.js)
  // — n'existait pas du tout jusqu'ici, aucun rappel envoyé au client avant le
  // début de sa location. `null` tant qu'aucun rappel n'a été envoyé ; posé une
  // fois envoyé pour ne jamais relancer deux fois la même réservation.
  pickupReminderSentAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

bookingSchema.index({ client: 1 });
bookingSchema.index({ vehicle: 1 });
bookingSchema.index({ driver: 1 });
bookingSchema.index({ activity: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ type: 1 });
bookingSchema.index({ createdAt: -1 });
// Index pour la vérification de chevauchement de dates
bookingSchema.index({ vehicle: 1, status: 1, "location.startDate": 1, "location.endDate": 1 });
bookingSchema.index({ driver: 1, status: 1, "chauffeur.date": 1, "chauffeur.dateFin": 1 });
bookingSchema.index({ vehicle: 1, status: 1, "essai.preferredDate": 1, "essai.dateFin": 1 });
bookingSchema.index({ activity: 1, status: 1, "activite.date": 1, "activite.dateFin": 1 });

bookingSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default Booking;
