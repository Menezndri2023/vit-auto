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
      // Réservations
      "booking_confirmed",    // Réservation confirmée
      "booking_cancelled",    // Réservation annulée
      "booking_completed",    // Réservation terminée
      // Annonces véhicules
      "listing_approved",     // Annonce approuvée par admin
      "listing_rejected",     // Annonce rejetée
      "new_booking",          // Partenaire : nouvelle réservation reçue
      "new_review",           // Nouveau avis reçu
      "payment_received",     // Paiement confirmé
      "new_message",          // Nouveau message chat
      "system",               // Message général système
      // Import / Export
      "info",                 // Information générale
      "success",              // Succès (profil vérifié, annonce publiée…)
      "error",                // Erreur / refus
      "warning",              // Avertissement
      "ie_request",           // Nouvelle demande client IE
      "ie_profile",           // Candidature importateur
      "ie_listing",           // Annonce import/export
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
