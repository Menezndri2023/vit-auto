import logger from "../utils/logger.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

// ── Lister mes conversations ───────────────────────────────────────────────
export const getMyChats = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "firstName lastName email role profilePhoto")
      .populate("booking", "type status");

    const result = chats.map((c) => {
      const unread = c.unreadCount?.get?.(req.user._id.toString()) || 0;
      const other  = c.participants.find((p) => p._id.toString() !== req.user._id.toString());
      return {
        _id:          c._id,
        type:         c.type,
        booking:      c.booking,
        other,
        lastMessage:  c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unread,
        participants: c.participants,
      };
    });

    res.json({ chats: result });
  } catch (err) {
    logger.error("getMyChats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Obtenir ou créer une conversation ─────────────────────────────────────
export const getOrCreateChat = async (req, res) => {
  try {
    const { type, targetUserId, bookingId } = req.body;
    const myId = req.user._id.toString();

    if (!type) return res.status(400).json({ message: "Type de chat requis." });

    let targetId = targetUserId;

    // Pour client_support et partner_support : trouver un admin
    if (type === "client_support" || type === "partner_support") {
      const admin = await User.findOne({ role: "admin", isActive: true }).select("_id");
      if (!admin) return res.status(404).json({ message: "Aucun agent disponible pour le moment." });
      targetId = admin._id.toString();
    }

    if (!targetId) return res.status(400).json({ message: "Destinataire requis." });
    if (targetId === myId) return res.status(400).json({ message: "Impossible de vous écrire à vous-même." });

    // Chercher conversation existante entre ces deux participants
    const filter = { type, participants: { $all: [myId, targetId] } };
    if (bookingId) filter.booking = bookingId;

    let chat = await Chat.findOne(filter)
      .populate("participants", "firstName lastName email role profilePhoto");

    if (!chat) {
      chat = await Chat.create({
        type,
        participants: [myId, targetId],
        booking: bookingId || null,
      });
      chat = await chat.populate("participants", "firstName lastName email role profilePhoto");
    }

    res.json({ chat });
  } catch (err) {
    logger.error("getOrCreateChat:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Récupérer les messages d'une conversation ─────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const myId   = req.user._id.toString();

    const chat = await Chat.findOne({ _id: id, participants: myId })
      .populate("messages.sender", "firstName lastName role profilePhoto");

    if (!chat) return res.status(404).json({ message: "Conversation introuvable." });

    // Marquer les messages comme lus
    chat.unreadCount.set(myId, 0);
    await chat.save();

    res.json({ messages: chat.messages });
  } catch (err) {
    logger.error("getMessages:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Envoyer un message ────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { id }     = req.params;
    const { content } = req.body;
    const myId       = req.user._id.toString();

    if (!content?.trim()) return res.status(400).json({ message: "Message vide." });
    if (content.length > 2000) return res.status(400).json({ message: "Message trop long (max 2000 caractères)." });

    const chat = await Chat.findOne({ _id: id, participants: myId });
    if (!chat) return res.status(404).json({ message: "Conversation introuvable." });

    const msg = {
      sender:     req.user._id,
      senderRole: req.user.role,
      content:    content.trim(),
    };

    chat.messages.push(msg);
    chat.lastMessage   = content.trim().substring(0, 100);
    chat.lastMessageAt = new Date();

    // Incrémenter le compteur non-lu pour les autres participants
    for (const pid of chat.participants) {
      if (pid.toString() !== myId) {
        const prev = chat.unreadCount.get(pid.toString()) || 0;
        chat.unreadCount.set(pid.toString(), prev + 1);
      }
    }

    await chat.save();

    // Notification pour les autres participants
    const others = chat.participants.filter((p) => p.toString() !== myId);
    const senderName = `${req.user.firstName} ${req.user.lastName}`;
    for (const otherId of others) {
      try {
        await Notification.create({
          user:    otherId,
          type:    "new_message",
          titre:   `Nouveau message de ${senderName}`,
          message: content.trim().substring(0, 80),
          lien:    "/dashboard",
        });
      } catch { /* non bloquant */ }
    }

    const savedMsg = chat.messages[chat.messages.length - 1];
    res.json({ message: savedMsg });
  } catch (err) {
    logger.error("sendMessage:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Nombre total de messages non lus ─────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  try {
    const myId  = req.user._id.toString();
    const chats = await Chat.find({ participants: myId });
    const total = chats.reduce((sum, c) => sum + (c.unreadCount?.get?.(myId) || 0), 0);
    res.json({ unread: total });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};
