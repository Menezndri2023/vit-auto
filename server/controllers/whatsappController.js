import crypto from "crypto";
import logger from "../utils/logger.js";
import { captureException } from "../config/sentry.js";
import WhatsAppConversation from "../models/WhatsAppConversation.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { generateBotReply } from "../services/whatsappBotService.js";
import { sendViaWhatsApp } from "../services/communication/CommunicationService.js";

// ── GET /api/whatsapp/webhook — challenge de vérification Meta ───────────────
// Meta appelle cet endpoint une seule fois, à la configuration du webhook
// dans le dashboard développeur, pour confirmer qu'on en est bien propriétaire.
export const verifyWebhook = (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// Vérifie que le corps brut a bien été signé par Meta avec WHATSAPP_APP_SECRET
// — sans ça, n'importe qui connaissant l'URL du webhook pourrait injecter de
// faux messages entrants (déclenchant des appels Claude facturés + de fausses
// escalades admin).
function isValidSignature(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // pas configuré en dev — ne bloque jamais localement
  if (!signatureHeader) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function notifyAdminsEscalation(conversation, reason) {
  try {
    const admins = await User.find({ role: "admin", isActive: true }).select("_id");
    const docs = admins.map((a) => ({
      user: a._id,
      type: "system",
      titre: "🚩 Conversation WhatsApp à reprendre",
      message: `${conversation.contactName || conversation.phone} (${conversation.phone}) — ${reason || "besoin d'un conseiller"}.`,
      lien: "/admin?tab=whatsapp",
    }));
    if (docs.length) await Notification.insertMany(docs);
  } catch (err) {
    logger.error("[WhatsApp] notifyAdminsEscalation:", err.message);
  }
}

// ── POST /api/whatsapp/webhook — message entrant ──────────────────────────────
// Monté AVANT express.json() (voir server.js) : req.body est ici un Buffer brut
// (express.raw), nécessaire pour vérifier la signature avant tout parsing JSON.
export const receiveWebhook = async (req, res) => {
  // Toujours répondre 200 vite — Meta réessaie (et finit par désactiver le
  // webhook) si on met plus de quelques secondes ou qu'on renvoie une erreur.
  res.sendStatus(200);

  try {
    const signature = req.headers["x-hub-signature-256"];
    if (!isValidSignature(req.body, signature)) {
      logger.warn("[WhatsApp] Signature webhook invalide — message ignoré");
      return;
    }

    const payload = JSON.parse(req.body.toString("utf-8"));
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== "text") return; // statuts de livraison, médias non gérés

    const phone = message.from;
    const text = message.text?.body?.trim();
    if (!phone || !text) return;
    const contactName = value?.contacts?.[0]?.profile?.name || null;

    let conversation = await WhatsAppConversation.findOne({ phone });
    if (!conversation) {
      conversation = await WhatsAppConversation.create({ phone, contactName });
    } else if (contactName && !conversation.contactName) {
      conversation.contactName = contactName;
    }

    conversation.messages.push({ role: "user", content: text });
    conversation.lastMessageAt = new Date();

    // Une conversation déjà escaladée reste entre les mains d'un admin — le
    // bot ne reprend pas la main tout seul, même sur un nouveau message.
    if (conversation.status === "escalated") {
      await conversation.save();
      return;
    }

    const { reply, escalate, escalationReason } = await generateBotReply(conversation.messages);

    conversation.messages.push({ role: "assistant", content: reply });
    if (escalate) {
      conversation.status = "escalated";
      conversation.escalatedAt = new Date();
      conversation.escalationReason = escalationReason;
    }
    await conversation.save();

    await sendViaWhatsApp({ to: phone, text: reply, context: { source: "whatsapp_bot" } });

    if (escalate) await notifyAdminsEscalation(conversation, escalationReason);
  } catch (err) {
    logger.error("[WhatsApp] receiveWebhook:", err.message);
    captureException(err, { context: "whatsappController.receiveWebhook" });
  }
};

// ── GET /api/whatsapp/admin/conversations (admin) ─────────────────────────────
export const adminListConversations = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const conversations = await WhatsAppConversation.find(filter)
      .select("-messages")
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .lean();

    res.json({ conversations });
  } catch (err) {
    logger.error("[WhatsApp] adminListConversations:", err.message);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/whatsapp/admin/conversations/:id (admin) ─────────────────────────
export const adminGetConversation = async (req, res) => {
  try {
    const conversation = await WhatsAppConversation.findById(req.params.id).lean();
    if (!conversation) return res.status(404).json({ message: "Conversation introuvable." });
    res.json({ conversation });
  } catch (err) {
    logger.error("[WhatsApp] adminGetConversation:", err.message);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/whatsapp/admin/conversations/:id/reply (admin) ─────────────────
// Réponse manuelle d'un admin — n'est jamais générée par le bot.
export const adminReply = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Message requis." });

    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: "Conversation introuvable." });

    const result = await sendViaWhatsApp({ to: conversation.phone, text: message, context: { source: "admin_reply" } });
    if (!result.sent) return res.status(502).json({ message: "Échec d'envoi WhatsApp.", error: result.error });

    conversation.messages.push({ role: "admin", content: message });
    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.json({ conversation });
  } catch (err) {
    logger.error("[WhatsApp] adminReply:", err.message);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/whatsapp/admin/conversations/:id/status (admin) ───────────────
// Reprendre la main (bot) ou clore la conversation.
export const adminUpdateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["bot", "escalated", "closed"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const conversation = await WhatsAppConversation.findByIdAndUpdate(
      req.params.id,
      { status, ...(status !== "escalated" ? { escalatedAt: null, escalationReason: null } : {}) },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ message: "Conversation introuvable." });
    res.json({ conversation });
  } catch (err) {
    logger.error("[WhatsApp] adminUpdateStatus:", err.message);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
