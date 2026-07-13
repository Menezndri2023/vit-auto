import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderRole: { type: String },
  content:   { type: String, required: true, maxlength: 2000 },
  lu:        { type: Boolean, default: false },
}, { timestamps: true });

const chatSchema = new mongoose.Schema({
  // Participants (2 users max, sauf bot)
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  // Type de conversation
  // "client_partner"  : client ↔ partenaire (lié à une réservation)
  // "client_support"  : client ↔ service VIT AUTO (admin)
  // "partner_support" : partenaire ↔ service VIT AUTO (admin)
  type: {
    type: String,
    enum: ["client_partner", "client_support", "partner_support"],
    required: true,
  },

  // Réservation liée (optionnel pour client_partner)
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },

  messages: [messageSchema],

  lastMessage:   { type: String, default: "" },
  lastMessageAt: { type: Date, default: Date.now },
  // Rôle de l'auteur du dernier message — permet à l'inbox support admin de savoir
  // en un coup d'œil quelles conversations attendent une réponse (dernier message
  // envoyé par un client/partenaire, pas encore par un admin) sans recharger tous
  // les messages de chaque conversation.
  lastMessageSenderRole: { type: String, default: null },
  unreadCount:   { type: Map, of: Number, default: {} },
}, { timestamps: true });

chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

export default mongoose.model("Chat", chatSchema);
