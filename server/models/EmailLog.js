import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema({
  // Destinataire
  to:      { type: String, required: true },
  subject: { type: String, required: true },

  // Template utilisé
  template: { type: String, default: null },

  // Provider et résultat
  provider:  { type: String, default: "resend" },  // resend | smtp | console
  messageId: { type: String, default: null },

  status: {
    type: String,
    enum: ["sent", "failed", "simulated"],
    default: "sent",
  },

  errorMessage: { type: String, default: null },

  // Lien avec l'utilisateur (optionnel)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  sentAt:    { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

// TTL : purge automatique après 6 mois
emailLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });
emailLogSchema.index({ to: 1, sentAt: -1 });
emailLogSchema.index({ status: 1, sentAt: -1 });

const EmailLog = mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);
export default EmailLog;
