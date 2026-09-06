import mongoose from "mongoose";

// ── Sous-schémas ───────────────────────────────────────────────────────────

const docStatusSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["non_requis", "en_attente", "fourni", "valide"],
    default: "en_attente",
  },
  url:        { type: String, default: null },
  uploadedAt: { type: Date,   default: null },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  changedAt: { type: Date,   default: Date.now },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  note:      { type: String, default: null },
}, { _id: false });

// ── Schéma principal ───────────────────────────────────────────────────────

const ieTransactionSchema = new mongoose.Schema({
  listing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ImportExportListing",
    required: true,
    index: true,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Statut (cycle de vie 14 étapes) ───────────────────────────────────────
  status: {
    type: String,
    enum: [
      "reserved",              // 4. Réservation gratuite
      "confirmed",             // 5. Confirmation fournisseur
      "in_discussion",         // 6. Discussion sécurisée
      "inspection_requested",  // 7. Inspection indépendante demandée
      "inspection_done",       // 7. Inspection terminée
      "offer_sent",            // 8. Offre finale envoyée
      "offer_accepted",        // 8. Offre acceptée
      "payment_pending",       // 9. En attente de paiement
      "payment_submitted",     // 9. Paiement manuel déclaré — vérification admin requise avant entiercement
      "in_escrow",             // 9. Fonds en entiercement (confirmés)
      "preparing",             // 10. Préparation export
      "shipped",               // 11. Expédié
      "in_transit",            // 11. En transit
      "delivered",             // 12. Livré
      "funds_released",        // 13. Fonds libérés
      "completed",             // 14. Transaction complète
      "disputed",              // Litige ouvert
      "cancelled",             // Annulé
    ],
    default: "reserved",
  },

  // Incoterm figé au moment de la réservation (copié depuis
  // ImportExportListing.incoterm) — reste inchangé même si le partenaire
  // modifie l'annonce ensuite, pour préserver la clause contractuelle.
  incoterm: { type: String, default: null },

  // Achat direct au prix affiché (voir ieTransactionController.createDirectPurchase) —
  // saute la négociation (confirmed/in_discussion/inspection/offer_*) : le
  // client accepte immédiatement le devis Import Cost Engine calculé sur
  // listing.price, `finalOffer` est déjà rempli et `status` démarre à
  // "payment_pending". Sert à distinguer ce chemin de l'achat négocié classique
  // (ex: filtrage analytics/admin), et à masquer les actions de négociation
  // (offre, inspection) côté UI pour ces transactions.
  directPurchase: { type: Boolean, default: false },

  // ── Validation admin obligatoire (audit 2026-08) ──────────────────────────
  // Uniquement exploité pour `directPurchase: true` — l'achat direct sautait
  // toute revue admin avant contact/paiement (chat créé + payment_pending
  // immédiat). Le reste du pipeline négocié (reserved→...→completed) n'est
  // pas concerné par ce chantier : un admin intervient déjà à
  // "payment_submitted" pour ce parcours. Backfillé à "approved" par
  // migration pour les transactions directPurchase déjà en base.
  adminValidation: {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    validatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    validatedAt:   { type: Date, default: null },
    refusalReason: { type: String, default: null },
  },

  // ── Logistique : transitaire ou agent en charge du dossier (2026-09) ────────
  // Dès que les fonds sont sécurisés (in_escrow), le système propose
  // automatiquement un transitaire actif (PartnerOnboarding.partnerType
  // "transitaire_logistique") pour le pays de destination, ou l'admin peut
  // garder le dossier en interne (un agent VIT AUTO) — voir
  // ieTransactionController.onEscrowSecured/assignTransaction. Toujours
  // réassignable ensuite par un admin.
  assignment: {
    mode:         { type: String, enum: ["agent", "transitaire", null], default: null },
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null = auto
    autoAssigned: { type: Boolean, default: false },
    assignedAt:   { type: Date, default: null },
  },
  // Historique des réassignations (voir assignTransaction) — jamais écrasé,
  // pour garder une trace de qui a géré le dossier à chaque étape.
  assignmentHistory: [{
    mode:         { type: String, enum: ["agent", "transitaire"] },
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    autoAssigned: { type: Boolean, default: false },
    assignedAt:   { type: Date, default: Date.now },
    note:         { type: String, default: null },
  }],

  // ── Destination client ─────────────────────────────────────────────────────
  destCountry: { type: String, trim: true },
  destCity:    { type: String, trim: true },
  notes:       { type: String, trim: true, maxlength: 1000 },

  // ── Devis du coût total d'importation (Import Cost Engine) ─────────────────
  // Calculé automatiquement à la réservation à partir du barème pays en
  // vigueur à cet instant (voir services/importCostEngine.js) — c'est une
  // ESTIMATION ("niveau 1", voir demande produit), pas un montant contractuel
  // verrouillé. Recalculée si le client change de destination avant l'offre
  // finale du fournisseur (finalOffer reste la seule valeur contractuelle).
  costEstimate: {
    available:      { type: Boolean, default: false },
    breakdown: {
      vehiclePrice:    Number,
      inlandTransport: Number,
      seaFreight:      Number,
      insurance:       Number,
      portFees:        Number,
      customs:         Number,
      delivery:        Number,
      commission:      Number,
    },
    totalServices: { type: Number, default: null },
    grandTotal:    { type: Number, default: null },
    currency:      { type: String, default: null },
    computedAt:    { type: Date,   default: null },
  },

  // ── Délai d'expiration de réservation (72h par défaut) ────────────────────
  reservedAt:          { type: Date, default: Date.now },
  reservationExpires:  { type: Date, default: () => new Date(Date.now() + 72 * 60 * 60 * 1000) },

  // ── Inspection indépendante VIT AUTO (optionnelle — étape 7) ─────────────
  independentInspection: {
    requested:    { type: Boolean, default: false },
    requestedAt:  { type: Date,    default: null },
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reportNotes:  { type: String,  default: null },
    completedAt:  { type: Date,    default: null },
  },

  // ── Offre finale du fournisseur (étape 8) ─────────────────────────────────
  finalOffer: {
    vehiclePrice:  { type: Number, default: null },
    exportFees:    { type: Number, default: 0 },
    shippingCost:  { type: Number, default: 0 },
    insurance:     { type: Number, default: 0 },
    totalAmount:   { type: Number, default: null },
    currency:      { type: String, default: "EUR" },
    estimatedDelay:{ type: String, default: null }, // ex: "45-60 jours"
    notes:         { type: String, default: null },
    sentAt:        { type: Date,   default: null },
    acceptedAt:    { type: Date,   default: null },
  },

  // ── Paiement escrow (étape 9) ───────────────────────────────────────────────
  // "carte" passe par un vrai Stripe Checkout (webhook-confirmé, jamais
  // déclaré par le client) — virement/mobile_money/crypto ne peuvent pas être
  // vérifiés automatiquement sans intégration bancaire réelle : le client
  // déclare seulement une intention de paiement (submittedAt), un admin doit
  // ensuite confirmer la réception réelle des fonds (verifiedBy/verifiedAt)
  // avant que le statut ne passe à "in_escrow". Voir ieTransactionController.js.
  payment: {
    amount:          { type: Number, default: null },
    currency:        { type: String, default: "EUR" },
    method:          { type: String, default: null }, // virement, carte, mobile_money, crypto, lc
    transactionRef:  { type: String, default: null },
    stripeSessionId: { type: String, default: null },
    submittedAt:     { type: Date,   default: null }, // déclaration du client (méthodes manuelles)
    paidAt:          { type: Date,   default: null }, // paiement réellement confirmé
    verifiedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    releasedAt:      { type: Date,   default: null },
    escrowRef:       { type: String, default: null },

    // ── Lettre de Crédit (méthode "lc") ────────────────────────────────────
    // VIT AUTO n'exécute pas la LC elle-même (hors de portée sans intégration
    // bancaire réelle) : on trace seulement sa déclaration et la conformité
    // documentaire, condition posée avant tout passage en "in_escrow" — voir
    // confirmEscrowPayment dans ieTransactionController.js.
    lc: {
      reference:           { type: String, default: null }, // n° LC fourni par la banque du client
      openedAt:             { type: Date,   default: null },
      documentsValidatedAt: { type: Date,   default: null },
      validatedBy:          { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },

    // ── Acompte + solde (toute méthode manuelle) ───────────────────────────
    // Le statut global (payment_pending → payment_submitted → in_escrow) ne
    // change pas de forme : "in_escrow" n'est atteint que lorsque le dépôt ET
    // le solde sont vérifiés (voir confirmEscrowPayment/payInstallmentBalance).
    installment: {
      enabled:              { type: Boolean, default: false },
      depositPercent:        { type: Number,  default: 30 },
      depositAmount:         { type: Number,  default: null },
      depositTransactionRef: { type: String,  default: null },
      depositSubmittedAt:    { type: Date,    default: null },
      depositPaidAt:         { type: Date,    default: null },
      depositVerifiedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      balanceAmount:         { type: Number,  default: null },
      balanceTransactionRef: { type: String,  default: null },
      balanceSubmittedAt:    { type: Date,    default: null },
      balancePaidAt:         { type: Date,    default: null },
      balanceVerifiedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },

    // ── Commission VIT AUTO (calculée à la libération des fonds) ───────────
    // Aucune commission n'existait sur les transactions Import/Export avant
    // ceci — le partenaire (toujours un Founding Partner, IE étant réservé à
    // isFounder) recevait 100% du montant. Même barème que la vente
    // (foundingRateFor), calculé au moment de releaseFunds — jamais recalculé
    // ensuite, pour ne pas faire varier un montant déjà versé.
    commission: {
      rate:        { type: Number, default: null }, // ex. 0.02 = 2%
      amount:      { type: Number, default: null }, // dans la devise de payment.currency
      payoutAmount:{ type: Number, default: null }, // montant réellement versé au partenaire
      computedAt:  { type: Date,   default: null },
    },
  },

  // ── Documents d'export (étape 10) ─────────────────────────────────────────
  documents: {
    commercialInvoice: { type: docStatusSchema, default: () => ({}) },
    customsDocs:       { type: docStatusSchema, default: () => ({}) },
    originCertificate: { type: docStatusSchema, default: () => ({}) },
    billOfLading:      { type: docStatusSchema, default: () => ({}) },
    inspectionDocs:    { type: docStatusSchema, default: () => ({}) },
    transportBooking:  { type: docStatusSchema, default: () => ({}) },
  },

  // ── Expédition (étape 11) ─────────────────────────────────────────────────
  shipping: {
    carrier:          { type: String, default: null },
    trackingNumber:   { type: String, default: null },
    shippingType:     {
      type: String,
      enum: ["maritime", "terrestre", "aerien", null],
      default: null,
    },
    departureDate:    { type: Date, default: null },
    estimatedArrival: { type: Date, default: null },
    currentStatus:    { type: String, default: null },
    shippedAt:        { type: Date, default: null },
  },

  // ── Livraison (étape 12) ──────────────────────────────────────────────────
  deliveredAt:           { type: Date,   default: null },
  deliveryConfirmedAt:   { type: Date,   default: null },
  deliveryNotes:         { type: String, default: null },

  // ── Chat lié ──────────────────────────────────────────────────────────────
  chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },

  // ── Évaluations mutuelles (étape 14) ─────────────────────────────────────
  clientReview: {
    rating:    { type: Number, min: 1, max: 5, default: null },
    comment:   { type: String, default: null },
    createdAt: { type: Date,   default: null },
  },
  partnerReview: {
    rating:    { type: Number, min: 1, max: 5, default: null },
    comment:   { type: String, default: null },
    createdAt: { type: Date,   default: null },
  },

  // ── Litige ────────────────────────────────────────────────────────────────
  dispute: {
    opened:     { type: Boolean, default: false },
    openedAt:   { type: Date, default: null },
    openedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason:     { type: String, default: null },
    resolution: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // ── Historique des changements de statut ──────────────────────────────────
  statusHistory: [statusHistorySchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ieTransactionSchema.index({ client: 1, createdAt: -1 });
ieTransactionSchema.index({ partner: 1, createdAt: -1 });
ieTransactionSchema.index({ status: 1 });
ieTransactionSchema.index({ "assignment.assignedTo": 1 });

ieTransactionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const IETransaction =
  mongoose.models.IETransaction ||
  mongoose.model("IETransaction", ieTransactionSchema);

export default IETransaction;
