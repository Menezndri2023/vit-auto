import mongoose from "mongoose";

/**
 * Notifications in-app envoyées à un utilisateur.
 * Créées automatiquement lors d'événements clés.
 */
const notificationSchema = new mongoose.Schema({
  // ── Destinataire ──────────────────────────────────────────
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Type d'événement ──────────────────────────────────────
  type: {
    type: String,
    enum: [
      "booking_confirmed",    // Réservation confirmée
      "booking_cancelled",    // Réservation annulée
      "booking_completed",    // Réservation terminée → inviter à laisser un avis
      "listing_approved",     // Annonce approuvée par admin
      "listing_rejected",     // Annonce rejetée
      "new_booking",          // Partenaire : nouvelle réservation reçue
      "new_review",           // Nouveau avis reçu
      "payment_received",     // Paiement confirmé
      "system",               // Message général
    ],
    required: true,
  },

  // ── Contenu ───────────────────────────────────────────────
  titre:   { type: String, required: true },
  message: { type: String, required: true },

  // ── Lien vers la page concernée (route frontend) ──────────
  lien: { type: String, default: null },

  // ── État ──────────────────────────────────────────────────
  lu: { type: Boolean, default: false },
  luAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ user: 1, lu: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export default Notification;
