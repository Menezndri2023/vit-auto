import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content:   { type: String, required: true },
  isAdmin:   { type: Boolean, default: false },
  attachmentUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const supportTicketSchema = new mongoose.Schema({
  // Auteur
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Sujet et catégorie
  subject: { type: String, required: true, maxlength: 200 },
  category: {
    type: String,
    enum: ["billing", "kyc", "booking", "vehicle", "partner", "technical", "other"],
    default: "other",
  },

  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },

  status: {
    type: String,
    enum: ["open", "in_progress", "waiting_user", "resolved", "closed"],
    default: "open",
  },

  // Agent admin assigné
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Conversation
  messages: [messageSchema],

  // Métadonnées
  resolvedAt: { type: Date, default: null },
  closedAt:   { type: Date, default: null },
  lastReplyAt:{ type: Date, default: null },

  // Évaluation après résolution
  rating: { type: Number, min: 1, max: 5, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

supportTicketSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  if (this.messages.length > 0) {
    this.lastReplyAt = this.messages[this.messages.length - 1].createdAt;
  }
  next();
});

supportTicketSchema.index({ userId: 1, status: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });

const SupportTicket = mongoose.models.SupportTicket || mongoose.model("SupportTicket", supportTicketSchema);
export default SupportTicket;
