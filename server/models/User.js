import mongoose from "mongoose";
import { ACTIVITIES, ENTITY_TYPES, entityTypeToSellerType } from "../constants/partnerTaxonomy.js";

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  // Vérification d'âge à l'inscription (ajoutée 2026-07-16) — les comptes créés
  // avant cette date n'ont pas ce champ, ne jamais bloquer un compte existant
  // sur son absence.
  birthDate:  { type: Date, default: null },
  // Email et téléphone sont mutuellement optionnels (l'un ou l'autre suffit à
  // l'inscription — voir authController.js/register), mais l'unicité de chacun
  // reste appliquée dès qu'une valeur réelle est renseignée (index partiels
  // ci-dessous, qui ignorent les valeurs vides/absentes contrairement à un
  // simple `sparse`, qui indexerait quand même les `null` explicites).
  email:      { type: String, lowercase: true, trim: true, default: null },
  password:   { type: String, required: true },
  phone:      { type: String, trim: true, default: null },

  // Connexion Google (voir authController.js oauthGoogle) — un compte créé via
  // Google a un mot de passe aléatoire inutilisable dans `password` (le schéma
  // l'exige toujours) ; il peut le remplacer via "mot de passe oublié" s'il
  // veut aussi se connecter classiquement. Index unique déclaré plus bas en
  // partial index (voir pourquoi à côté de celui d'email/phone) — `sparse`
  // seul indexerait quand même les `null` explicites du `default: null` ici.
  googleId:     { type: String, default: null },
  authProvider: { type: String, enum: ["local", "google"], default: "local" },

  role: {
    type: String,
    enum: ["client", "partenaire", "chauffeur", "admin"],
    default: "client",
  },

  // Permissions fines pour les comptes role="admin" — tableau VIDE = accès
  // complet (rétrocompatible : tous les admins existants avant l'ajout de ce
  // champ gardent un accès total, jamais de verrouillage rétroactif). Non
  // exhaustif : seules les routes ajoutées avec requireAdminScope() le
  // vérifient réellement (voir middleware/auth.js) — les routes admin
  // préexistantes restent en accès admin classique, sans rétrofit global.
  adminScope: {
    type: [String],
    enum: ["super_admin", "finance", "kyc", "import_export", "support", "moderation"],
    default: [],
  },

  // Renseigné à la première publication d'annonce (voir VendorSubmit.jsx —
  // identity.typePubliant) : détermine le niveau de vérification exigé avant de
  // publier — KYC identité (léger) pour un particulier vs certification
  // entreprise (RCCM, IBAN, export...) pour un professionnel/une entreprise.
  // Voir vehicleController.js createVehicle.
  sellerType: {
    type: String,
    enum: ["particulier", "professionnel", "entreprise", null],
    default: null,
  },

  // Catégorie partenaire du nouveau modèle économique (Particulier/Professionnel/
  // Exportateur international/Entreprise) — surensemble de `sellerType`, gardé
  // distinct pour ne jamais perturber la logique de vérification KYC/certification
  // déjà branchée sur `sellerType` (vehicleController.js/driverController.js).
  // "exportateur" n'a pas d'équivalent dans l'ancien système (branché sur
  // ImporterPartnerProfile/isFounder, pas sur ce champ) ; les 3 autres valeurs
  // restent synchronisées avec `sellerType` (voir le hook pre("validate") plus bas).
  partnerCategory: {
    type: String,
    enum: ["particulier", "professionnel", "exportateur", "entreprise", "concessionnaire", null],
    default: null,
  },

  // ── Taxonomie partenaire canonique (voir server/constants/partnerTaxonomy.js) ──
  // Remplace progressivement sellerType/partnerCategory ci-dessus sans les
  // retirer : `entityType` devient la source de vérité pour la charge
  // documentaire requise (KYC seul vs documents d'entité), `partnerActivity`
  // pour l'activité choisie à l'inscription. Les anciens champs restent
  // dérivés automatiquement (voir hook pre("validate") plus bas) pour que tout
  // le code existant (vehicleController.js/driverController.js/VendorSubmit.jsx)
  // continue de fonctionner sans modification.
  partnerActivity: {
    type: String,
    enum: [...ACTIVITIES, null],
    default: null,
  },
  // Activités additionnelles ajoutées après l'inscription depuis le dashboard
  // partenaire (un compte n'est jamais limité à une seule activité à vie,
  // seulement à l'inscription).
  partnerActivities: {
    type: [String],
    enum: ACTIVITIES,
    default: [],
  },
  entityType: {
    type: String,
    enum: [...ENTITY_TYPES, null],
    default: null,
  },

  profilePhoto: { type: String, default: null },
  address:      { type: String, default: null },

  // Pays de résidence/d'opération (code ISO-2, ex: "MA", "CI", "FR", "CN") —
  // sert au filtrage international du catalogue (véhicules/IE) et au drapeau
  // de reconnaissance admin. `null` = comptes créés avant cette fonctionnalité
  // ou pays non renseigné : traité comme "visible partout" (aucune restriction),
  // jamais comme un blocage rétroactif.
  country: { type: String, uppercase: true, trim: true, default: null },

  // ── Préférences de notifications (Profile.jsx → onglet Notifications) ──
  notif_emailReminders:       { type: Boolean, default: true },
  notif_smsReminders:         { type: Boolean, default: false },
  notif_promotionalEmails:    { type: Boolean, default: true },
  notif_bookingConfirmations: { type: Boolean, default: true },

  // ── Pièce d'identité ───────────────────────────────────────────
  identity: {
    type: {
      type: String,
      enum: ["cni", "passport", "permis", "carte_sejour", null],
      default: null,
    },
    number:     { type: String, default: null },
    expiryDate: { type: Date,   default: null },
    frontImage: { type: String, default: null },
    backImage:  { type: String, default: null },
    selfie:     { type: String, default: null },
    status: {
      type: String,
      enum: ["not_submitted", "pending", "verified", "rejected"],
      default: "not_submitted",
    },
    submittedAt:     { type: Date,   default: null },
    verifiedAt:      { type: Date,   default: null },
    rejectionReason: { type: String, default: null },
  },

  // ── KYC — Statut officiel ──────────────────────────────────────
  kycStatus: {
    type: String,
    enum: ["EN_ATTENTE", "VERIFIE", "REFUSE", "A_REVOIR_MANUELLEMENT"],
    default: "EN_ATTENTE",
  },

  // ── KYC — Données OCR extraites du document ────────────────────
  kycOcrData: {
    firstName:        { type: String, default: null },
    lastName:         { type: String, default: null },
    birthDate:        { type: Date,   default: null },
    gender:           { type: String, enum: ["M", "F", null], default: null },
    documentNumber:   { type: String, default: null }, // chiffré au repos (voir fieldEncryption.js)
    // Index déterministe (HMAC) pour la détection de doublon — documentNumber
    // étant chiffré avec un IV aléatoire, il n'est plus cherchable par égalité.
    documentNumberHash: { type: String, default: null, index: true },
    expiryDate:       { type: Date,   default: null },
    issuingCountry:   { type: String, default: null },
    documentType:     { type: String, default: null },
    rawOcrText:       { type: String, default: null }, // chiffré au repos (voir fieldEncryption.js)
    ocrConfidence:    { type: Number, default: 0 },
    isExpired:        { type: Boolean, default: false },
    processedAt:      { type: Date,   default: null },
    qualityScore:     { type: Number, default: 0 },
  },

  // ── KYC — Score de correspondance visage ──────────────────────
  kycFaceMatchScore: { type: Number, default: null },

  // ── KYC — Score et Badge ──────────────────────────────────────
  kycScore:        { type: Number, default: 0 },
  kycBadge:        {
    type: String,
    enum: ["CERTIFIÉ", "VÉRIFIÉ", "INSUFFISANT"],
    default: "INSUFFISANT",
  },
  kycSubmittedAt:  { type: Date,   default: null },
  kycDocumentHash: { type: String, default: null },

  // ── KYC — Note de révision admin ─────────────────────────────
  kycReviewNote:       { type: String, default: null },
  kycRejectionReason:  { type: String, default: null },

  // ── KYC — Journal d'audit ────────────────────────────────────
  kycAuditLog: [{
    action:      { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note:        { type: String, default: null },
    timestamp:   { type: Date, default: Date.now },
  }],

  // ── Permis de conduire OCR (pour réservations location) ───────
  driverLicenseOcr: {
    licenseNumber:   { type: String, default: null },
    deliveredDate:   { type: Date,   default: null },
    expiryDate:      { type: Date,   default: null },
    categories:      { type: String, default: null },
    issuingCountry:  { type: String, default: null },
    isExpired:       { type: Boolean, default: false },
    rawOcrText:      { type: String, default: null },
    processedAt:     { type: Date,   default: null },
    frontImage:      { type: String, default: null },  // recto permis
    backImage:       { type: String, default: null },  // verso permis
  },

  // ── Informations pro (partenaire / chauffeur) ──────────────────
  business: {
    companyName:  { type: String, default: null },
    rccm:         { type: String, default: null },
    taxId:        { type: String, default: null },
    address:      { type: String, default: null },
    logo:         { type: String, default: null },
  },

  // ── Chauffeur : infos spécifiques ─────────────────────────────
  driver: {
    licenseNumber:   { type: String, default: null },
    licenseCategory: { type: String, default: null },
    licenseExpiry:   { type: Date,   default: null },
    licenseImage:    { type: String, default: null },
    yearsExperience: { type: Number, default: 0 },
    languages:       { type: [String], default: [] },
    isAvailable:     { type: Boolean, default: true },
  },

  defaultLocation: {
    address: { type: String, default: null },
    city:    { type: String, default: null },
    lat:     { type: Number, default: null },
    lng:     { type: Number, default: null },
  },

  // ── Vérification e-mail ────────────────────────────────────────
  emailVerified:            { type: Boolean, default: false },
  emailVerificationToken:   { type: String,  default: null },
  emailVerificationExpires: { type: Date,    default: null },
  // Code court (6 chiffres, hashé — même patron que phoneOtp) envoyé en plus
  // du lien ci-dessus : la confirmation par CODE, saisie directement dans le
  // parcours d'inscription (voir Register.jsx), est désormais obligatoire
  // avant de pouvoir continuer — contrairement au lien, qui restait ignorable
  // indéfiniment sans jamais bloquer la suite de l'inscription.
  emailVerificationCode:        { type: String, default: null },
  emailVerificationCodeExpires: { type: Date,   default: null },

  // ── Changement d'e-mail (self-service, page Profil) ──────────────
  // L'adresse en cours n'est jamais modifiée tant que la nouvelle n'est pas
  // confirmée via ce token (envoyé à la NOUVELLE adresse) — voir
  // requestEmailChange/confirmEmailChange.
  pendingEmail:        { type: String, default: null },
  pendingEmailToken:   { type: String, default: null },
  pendingEmailExpires: { type: Date,   default: null },

  // ── Vérification téléphone (OTP 6 chiffres) ───────────────────
  phoneVerified:   { type: Boolean, default: false },
  phoneOtp:        { type: String,  default: null },
  phoneOtpExpires: { type: Date,    default: null },

  // ── Réinitialisation mot de passe ────────────────────────────
  passwordResetToken:   { type: String, default: null },
  passwordResetExpires: { type: Date,   default: null },

  // Hash SHA-256 des refresh tokens actifs (jamais la valeur en clair — voir authController.js hashRefreshToken)
  refreshTokens: { type: [String], default: [] },

  // Tokens FCM des appareils natifs (iOS/Android via app Capacitor) — plusieurs
  // possibles par utilisateur (téléphone + tablette...). Voir PushChannel.js
  // (envoi effectif, no-op tant que FCM_SERVER_KEY n'est pas configuré).
  pushTokens: { type: [String], default: [] },

  // Incrémenté à chaque changement/réinitialisation de mot de passe — permet à
  // authenticate() de rejeter immédiatement tout JWT d'accès émis AVANT ce
  // changement (jusqu'à 7 jours de validité sinon), par exemple un token volé
  // avant que le titulaire ne sécurise son compte.
  tokenVersion: { type: Number, default: 0 },

  importerProfile: {
    status: {
      type: String,
      enum: ["none", "pending", "verified", "rejected", "suspended"],
      default: "none",
    },
    badgeLevel: {
      type: String,
      enum: ["none", "silver", "gold", "platinum"],
      default: "none",
    },
    profileId: { type: mongoose.Schema.Types.ObjectId, ref: "ImporterPartnerProfile", default: null },
  },

  // ── Statut Founding Partner ─────────────────────────────────────────────────
  isFounder: { type: Boolean, default: false },

  // ── Certification Partenaire Vérifié Vit-Auto ──────────────────────────────
  certificationBadge: {
    type: String,
    enum: ["none", "verifie", "fondateur", "premium"],
    default: "none",
  },
  certificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerCertification",
    default: null,
  },

  documentsVerified: { type: Boolean, default: false },
  isActive:          { type: Boolean, default: true },
  lastLogin:         { type: Date,    default: null },

  // Dernière relance "complétez votre profil" — voir utils/accountHealthCheck.js.
  lastAccountHealthNudgeAt: { type: Date, default: null },

  // ── Verrouillage anti brute-force par compte ──────────────────
  // Complète le rate-limit par IP (authLimiter, 10/15min) — un attaquant
  // distribuant ses tentatives sur plusieurs IP ou attendant la fenêtre n'a
  // sinon aucune résistance au niveau du compte lui-même.
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil:           { type: Date,   default: null },

  // ── Authentification à deux facteurs (TOTP) ──────────────────
  twoFactor: {
    enabled:     { type: Boolean, default: false },
    secret:      { type: String,  default: null },   // stocké chiffré en production
    backupCodes: [{
      code: String,   // hashé bcrypt avant stockage
      used: { type: Boolean, default: false },
    }],
    enabledAt: { type: Date, default: null },
  },

  // ── Abonnement ────────────────────────────────────────────────
  // (le statut Founding Partner vit dans le champ `isFounder` racine ci-dessus —
  // seul celui-ci est jamais écrit par partnerOnboardingController.js)
  subscription: {
    planId:    { type: String, default: null },
    status:    { type: String, enum: ["active", "inactive", "trial"], default: "inactive" },
    expiresAt: { type: Date, default: null },
  },

  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ role: 1 });
userSchema.index({ kycStatus: 1 });
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);

// Garde-fou modèle (en plus de la validation dans authController.js) : un compte
// doit toujours avoir au moins un moyen de contact/connexion.
userSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    return next(new Error("Un compte doit avoir au moins un email ou un numéro de téléphone."));
  }
  // Synchronisation partnerCategory ↔ sellerType : tout code existant qui ne
  // connaît que `sellerType` (Register.jsx, VendorSubmit.jsx) continue de
  // fonctionner sans modification — `partnerCategory` se dérive automatiquement
  // tant qu'il n'a jamais été fixé explicitement à une valeur propre au nouveau
  // système ("exportateur", qui n'a pas d'équivalent dans sellerType).
  if (!this.partnerCategory && this.sellerType) {
    this.partnerCategory = this.sellerType;
  }
  // entityType -> sellerType : ne backfill que si sellerType n'a jamais été
  // renseigné (jamais d'écrasement d'une valeur déjà choisie explicitement,
  // pour ne pas perturber un compte créé avant l'introduction d'entityType).
  if (this.entityType && !this.sellerType) {
    this.sellerType = entityTypeToSellerType(this.entityType);
  }
  next();
});

// ── Filtre de sérialisation ────────────────────────────────────────────────
// Plusieurs routes n'excluaient que `-password` via `.select()` (pattern liste
// noire, dispersé sur ~8 endroits) sans exclure `refreshTokens`, `twoFactor.secret`
// (secret TOTP en clair), `phoneOtp`, `passwordResetToken`, `emailVerificationToken`
// — confirmé en fuite réelle sur `PATCH /api/users/me`. Un transform au niveau du
// schéma protège TOUTES les routes d'un coup (y compris celles pas encore écrites),
// plutôt que de compter sur chaque appelant pour se souvenir de la bonne liste.
// Ne s'applique pas aux requêtes `.lean()` (objets bruts sans méthodes Mongoose) —
// ces routes doivent continuer à exclure explicitement via `.select()`.
const stripSensitive = (_doc, ret) => {
  delete ret.password;
  delete ret.refreshTokens;
  delete ret.phoneOtp;
  delete ret.passwordResetToken;
  delete ret.emailVerificationToken;
  delete ret.pendingEmailToken;
  if (ret.twoFactor) {
    delete ret.twoFactor.secret;
    delete ret.twoFactor.backupCodes;
  }
  return ret;
};
userSchema.set("toJSON",   { transform: stripSensitive });
userSchema.set("toObject", { transform: stripSensitive });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
