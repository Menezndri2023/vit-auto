import mongoose from "mongoose";
import { notifyAdminByEmail, notifyAdminsByEmailBulk } from "../utils/adminAlertEmail.js";

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
      // Avis
      "new_review",
      // Chat
      "new_message",
      // Drivers
      "driver_assigned",
      "driver_completed",
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
notificationSchema.post("insertMany", function (docs) {
  notifyAdminsByEmailBulk(docs).catch(() => {});
});

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
