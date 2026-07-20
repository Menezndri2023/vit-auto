import mongoose from "mongoose";

// Conversation WhatsApp avec un prospect/partenaire — le bot (Claude) répond
// automatiquement tant que status="bot" ; passe à "escalated" dès que le
// modèle juge la demande hors de son périmètre (négociation, plainte, litige),
// ce qui coupe les réponses automatiques et notifie les admins.
const whatsAppConversationSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  contactName: { type: String, default: null },

  messages: [{
    role:      { type: String, enum: ["user", "assistant", "admin"], required: true },
    content:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  }],

  status: {
    type: String,
    enum: ["bot", "escalated", "closed"],
    default: "bot",
  },
  escalatedAt:     { type: Date, default: null },
  escalationReason: { type: String, default: null },

  lastMessageAt: { type: Date, default: Date.now },
  createdAt:     { type: Date, default: Date.now },
});

whatsAppConversationSchema.index({ status: 1, lastMessageAt: -1 });

const WhatsAppConversation =
  mongoose.models.WhatsAppConversation ||
  mongoose.model("WhatsAppConversation", whatsAppConversationSchema);

export default WhatsAppConversation;
