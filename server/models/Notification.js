import mongoose from "mongoose";
import { notifyAdminByEmail, notifyAdminsByEmailBulk } from "../utils/adminAlertEmail.js";
import logger from "../utils/logger.js";

const notificationSchema = new mongoose.Schema({
  // ── Destinataire ──────────────────────────────────────────
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Type d'événement ─────────────────────────────────────
  type: {
    type: String,
    enum: [
      // Réservations
      "booking_confirmed",
      "booking_cancelled",
      "booking_completed",
      "new_booking",
      "booking_pending_review",
      "booking_admin_approved",
      "booking_admin_rejected",
      // Annonces
      "listing_approved",
      "listing_rejected",
      "new_vehicle",
      "new_driver",
      "new_activity",
      // Paiements
      "payment_received",
      "payment_failed",
      "invoice_available",
      "refund_processed",
      // KYC
      "kyc_submitted",
      "kyc_approved",
      "kyc_rejected",
      // Partners
      "partner_approved",
      "partner_suspended",
      "loi_ready",
      "agreement_ready",
      "onboarding_step",
      // Import/Export
      "ie_request",
      "ie_profile",
      "ie_listing",
      "ie_step_update",
      "ie_escrow_released",
      // Import/Export — cycle de vie transaction (ieTransactionController.js)
      "ie_reservation",
      "ie_offer",
      "ie_inspection",
      "ie_payment",
      "ie_delivery",
      "ie_dispute",
      "ie_direct_purchase_pending_review",
      "ie_direct_purchase_approved",
      "ie_direct_purchase_rejected",
      // Avis
      "new_review",
      // Chat
      "new_message",
      // Drivers
      "driver_assigned",
      "driver_completed",
      // Fidélité
      "loyalty_tier_up",
      // Système
      "system",
      "info",
      "success",
      "error",
      "warning",
    ],
    required: true,
  },

  // ── Canal de diffusion ────────────────────────────────────
  // "internal" = notification in-app uniquement (défaut)
  // Les autres canaux sont envoyés EN PLUS de l'in-app
  channel: {
    type: String,
    enum: ["internal", "email", "sms", "whatsapp", "push"],
    default: "internal",
  },

  // ── Contenu ───────────────────────────────────────────────
  titre:   { type: String, required: true },
  message: { type: String, required: true },
  lien:    { type: String, default: null },

  // ── Métadonnées de livraison ──────────────────────────────
  delivered: { type: Boolean, default: false },
  deliveredAt: { type: Date, default: null },
  deliveryError: { type: String, default: null },

  // ── État lecture ──────────────────────────────────────────
  lu:    { type: Boolean, default: false },
  luAt:  { type: Date, default: null },

  // Filet email (Booking Engine, 2026-09) — voir le hook post("save")
  // ci-dessous. `true` uniquement pour les quelques événements qui envoient
  // déjà un email dédié au même destinataire pour le même événement (évite un
  // doublon) — voir queue/index.js (bookingCreated, bookingStatusChanged).
  skipEmail: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ user: 1, lu: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

// ── Copie email des notifications admin (voir utils/adminAlertEmail.js) ──────
// Centralisé ici (plutôt que dans chacun des ~50 appels Notification.create/
// insertMany à travers le projet) : couvre tous les points d'appel actuels ET
// futurs sans avoir à modifier chacun d'eux. insertMany() ne déclenche pas les
// hooks "save" par défaut dans Mongoose, d'où le second hook dédié ci-dessous.
notificationSchema.post("save", function (doc) {
  notifyAdminByEmail(doc).catch(() => {});
});

// ── Filet email pour toute notification (push/in-app) ────────────────────────
// Tant que le canal push (FCM) n'est pas garanti fiable en production, toute
// notification qui passerait par lui doit aussi atteindre l'utilisateur par
// email — voir services/communication/templates/email/GenericNotification.js.
// Centralisé ici pour couvrir d'un coup les ~20 contrôleurs qui créent une
// Notification directement (Notification.create), sans qu'aucun d'eux n'ait
// à changer. `insertMany()` (utilisé par sendInternalBroadcast) ne déclenche
// pas ce hook — voir la logique équivalente ajoutée explicitement là-bas.
// Surtout PAS une fonction "async" ici : un hook post("save") async, dont la
// promesse est attendue, est BLOQUANT — Mongoose attendrait tout ce filet
// email (lookup User + enqueue + traitement email en fallback synchrone si
// Redis indisponible) avant de laisser Notification.create()/save() se
// résoudre, ralentissant db tout appelant existant (bug réel constaté : la
// suite de tests entière a ralenti, plusieurs tests ont timeout). Le hook
// jumeau ci-dessus (notifyAdminByEmail) évite déjà ce piège — même principe
// ici : lancer le travail async SANS le retourner/l'attendre.
notificationSchema.post("save", function (doc) {
  if (doc.skipEmail) return;
  (async () => {
    const User = mongoose.model("User");
    const recipient = await User.findById(doc.user).select("email firstName notif_emailReminders").lean();
    if (!recipient?.email) return;
    // Respecte la préférence "Rappels par email" (Profile.jsx, déjà branchée
    // en écriture via PATCH /api/users/me mais jusqu'ici jamais consultée
    // avant un envoi réel — bug réel corrigé en même temps que ce filet).
    if (recipient.notif_emailReminders === false) return;
    const { enqueue } = await import("../queue/index.js");
    const { QUEUE_NAMES } = await import("../queue/definitions.js");
    await enqueue(QUEUE_NAMES.EMAIL, "generic_notification_email", {
      type:   "generic_notification",
      to:     recipient.email,
      userId: doc.user.toString(),
      data:   { firstName: recipient.firstName, titre: doc.titre, message: doc.message, lien: doc.lien },
    });
  })().catch((err) => {
    // Non-bloquant : ne doit jamais faire échouer la création de la
    // notification elle-même ni l'action métier qui l'a déclenchée.
    logger.warn("[Notification] Filet email non envoyé (non bloquant) :", err?.message);
  });
});
notificationSchema.post("insertMany", function (docs) {
  notifyAdminsByEmailBulk(docs).catch(() => {});
});

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
