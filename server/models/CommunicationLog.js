import mongoose from "mongoose";

const communicationLogSchema = new mongoose.Schema({
  // ── Destinataire ──────────────────────────────────────────────────────────
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  to:         { type: String, required: true },        // email, phone, pushToken, userId
  channel:    {
    type: String,
    enum: ["email", "sms", "whatsapp", "push", "internal"],
    required: true,
  },

  // ── Contenu ───────────────────────────────────────────────────────────────
  template:   { type: String, default: null },         // nom du template utilisé
  subject:    { type: String, default: null },         // email uniquement
  preview:    { type: String, default: null },         // résumé 100 chars du contenu

  // ── Livraison ─────────────────────────────────────────────────────────────
  provider:   {
    type: String,
    enum: ["resend", "smtp", "africastalking", "twilio", "whatsapp_api", "fcm", "socket", "console"],
    default: "console",
  },
  messageId:  { type: String, default: null },         // ID retourné par le provider
  status: {
    type: String,
    enum: ["queued", "sent", "delivered", "failed", "simulated"],
    default: "queued",
  },
  errorMessage: { type: String, default: null },
  attempts:   { type: Number, default: 1 },

  // ── Tracking ──────────────────────────────────────────────────────────────
  trackingId: { type: String, unique: true, sparse: true }, // UUID pour pixel/click
  openedAt:   { type: Date, default: null },
  clickedAt:  { type: Date, default: null },
  clickedUrl: { type: String, default: null },
  openCount:  { type: Number, default: 0 },
  clickCount: { type: Number, default: 0 },

  // ── Métadonnées ───────────────────────────────────────────────────────────
  context:    { type: mongoose.Schema.Types.Mixed, default: {} }, // { bookingId, partnerId, ... }
  tags:       [{ type: String }],
  priority:   { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
  scheduled:  { type: Date, default: null },

  sentAt:     { type: Date, default: null },
  createdAt:  { type: Date, default: Date.now },
});

communicationLogSchema.index({ userId: 1, createdAt: -1 });
communicationLogSchema.index({ channel: 1, status: 1 });
communicationLogSchema.index({ template: 1, createdAt: -1 });
communicationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 }); // 6 mois TTL

export default mongoose.models.CommunicationLog ||
  mongoose.model("CommunicationLog", communicationLogSchema);
