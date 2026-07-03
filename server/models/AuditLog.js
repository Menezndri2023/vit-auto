import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  // Qui a agi
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userRole: { type: String, default: "anonymous" },
  userEmail:{ type: String, default: null },

  // Quoi
  action:     { type: String, required: true },  // ex: "user.block", "kyc.approve"
  resource:   { type: String, required: true },  // ex: "User", "Booking"
  resourceId: { type: String, default: null },

  // Changements (avant / après)
  changes: {
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },
  },

  // Contexte requête
  ip:        { type: String, default: null },
  userAgent: { type: String, default: null },
  method:    { type: String, default: null },
  path:      { type: String, default: null },

  // Résultat
  success:      { type: Boolean, default: true },
  errorMessage: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
// TTL : purge automatique après 1 an
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
