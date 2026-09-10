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

  // ── Assistance premium ───────────────────────────────────────────────────
  // Palier de l'auteur AU MOMENT DE L'OUVERTURE, figé volontairement : un
  // ticket ouvert par un abonné doit rester traité en priorité même si son
  // abonnement expire pendant l'échange. L'inverse — recalculer à chaque
  // affichage — ferait rétrograder un dossier en cours.
  plan: { type: String, enum: ["free", "individuel_plus", "business", "exportateur"], default: "free" },

  // Échéance de PREMIÈRE réponse promise, dérivée du palier. Sert au tri de la
  // file admin et au signalement des tickets en retard ; ne déclenche aucune
  // action automatique — un délai tenu se constate, il ne s'auto-répare pas.
  slaDueAt: { type: Date, default: null },

  // Horodatage de la première réponse d'un administrateur : sans lui, le
  // respect du délai annoncé n'est pas mesurable après coup.
  firstAdminReplyAt: { type: Date, default: null },

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
supportTicketSchema.index({ status: 1, slaDueAt: 1 });

const SupportTicket = mongoose.models.SupportTicket || mongoose.model("SupportTicket", supportTicketSchema);
export default SupportTicket;
