import logger from "../utils/logger.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";

const SUPPORT_TYPES = ["client_support", "partner_support"];

// Un admin doit pouvoir répondre à N'IMPORTE QUELLE conversation de support, pas
// seulement celle où il figure déjà comme participant (le premier admin trouvé au
// moment de la création — voir getOrCreateChat) : sinon les autres admins restent
// bloqués (404) si ce premier admin est indisponible ou désactivé. Il est ajouté
// aux participants dès sa première interaction (lecture ou réponse).
async function findAccessibleChat(id, user) {
  const myId = user._id.toString();
  let chat = await Chat.findOne({ _id: id, participants: myId });
  if (chat) return chat;

  if (user.role === "admin") {
    // Bug de sécurité réel corrigé (audit) : seule la route de LISTING
    // (GET /api/chats/support) était protégée par requireAdminScope("support")
    // — cette fonction, elle, ajoutait N'IMPORTE QUEL admin (quel que soit son
    // adminScope) comme participant dès qu'il connaissait l'ID d'une
    // conversation support, contournant entièrement la restriction de scope
    // (un admin "kyc" pouvait lire/répondre à une conversation support s'il
    // en obtenait l'ID par un autre biais). Même contrôle que
    // requireAdminScope("support") : accès complet (scope vide/super_admin)
    // ou scope "support" explicite.
    const scopes = user.adminScope || [];
    const hasSupportScope = scopes.length === 0 || scopes.includes("super_admin") || scopes.includes("support");
    if (!hasSupportScope) return null;

    // $addToSet est atomique côté MongoDB — contrairement à un push() en mémoire
    // suivi d'un save(), deux admins qui ouvrent la même conversation au même
    // instant ne peuvent pas s'écraser mutuellement (avec l'ancienne approche
    // read-then-write, le second save() pouvait silencieusement perdre l'ajout
    // du premier admin aux participants).
    chat = await Chat.findOneAndUpdate(
      { _id: id, type: { $in: SUPPORT_TYPES } },
      { $addToSet: { participants: user._id } },
      { new: true }
    );
  }
  return chat;
}

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
    const { type, bookingId } = req.body;
    const myId = req.user._id.toString();

    if (!SUPPORT_TYPES.includes(type) && type !== "client_partner") {
      return res.status(400).json({ message: "Type de chat invalide." });
    }

    let targetId;

    if (SUPPORT_TYPES.includes(type)) {
      // Support : toujours dirigé vers un admin (peu importe lequel — voir
      // findAccessibleChat, tout admin actif peut ensuite reprendre la conversation).
      const admin = await User.findOne({ role: "admin", isActive: true }).select("_id");
      if (!admin) return res.status(404).json({ message: "Aucun agent disponible pour le moment." });
      targetId = admin._id.toString();
    } else {
      // client_partner : le destinataire n'est JAMAIS pris depuis le body (sinon
      // n'importe quel utilisateur authentifié pourrait ouvrir une conversation avec
      // n'importe quel autre compte du système). Il est dérivé côté serveur à partir
      // d'une réservation réelle impliquant l'appelant.
      if (!bookingId) return res.status(400).json({ message: "Réservation requise pour contacter un partenaire." });
      const booking = await Booking.findById(bookingId)
        .populate("vehicle", "owner")
        .populate("driver", "owner");

      // Réponse générique identique que la réservation n'existe pas OU qu'elle
      // existe mais n'implique pas l'appelant — sinon la différence 404/403
      // permet de sonder l'existence d'un bookingId arbitraire par force brute.
      const notPartyErr = () => res.status(404).json({ message: "Réservation introuvable." });
      if (!booking) return notPartyErr();

      const clientId = booking.client?.toString();
      const ownerId  = (booking.vehicle?.owner || booking.driver?.owner)?.toString();
      if (!ownerId) return notPartyErr();

      if (myId === clientId)      targetId = ownerId;
      else if (myId === ownerId)  targetId = clientId;
      else return notPartyErr();
    }

    if (targetId === myId) return res.status(400).json({ message: "Impossible de vous écrire à vous-même." });

    // Chercher conversation existante. Pour le support, un seul chat par
    // (client, type) doit exister quel que soit l'admin nominal — sinon, comme
    // aucun ordre n'est garanti sur `User.findOne({role:"admin"})` quand
    // plusieurs admins existent, un second appel peut désigner un admin
    // différent et faire échouer le `$all:[myId,targetId]`, créant une
    // conversation en double (historique éclaté en plusieurs fils).
    const filter = SUPPORT_TYPES.includes(type)
      ? { type, participants: myId }
      : { type, participants: { $all: [myId, targetId] }, booking: bookingId };

    let chat = await Chat.findOne(filter)
      .populate("participants", "firstName lastName email role profilePhoto");

    if (!chat) {
      chat = await Chat.create({
        type,
        participants: [myId, targetId],
        booking: type === "client_partner" ? bookingId : null,
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

    let chat = await findAccessibleChat(id, req.user);
    if (!chat) return res.status(404).json({ message: "Conversation introuvable." });

    chat = await chat.populate("messages.sender", "firstName lastName role profilePhoto");

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

    const chat = await findAccessibleChat(id, req.user);
    if (!chat) return res.status(404).json({ message: "Conversation introuvable." });

    const msg = {
      sender:     req.user._id,
      senderRole: req.user.role,
      content:    content.trim(),
    };

    chat.messages.push(msg);
    chat.lastMessage           = content.trim().substring(0, 100);
    chat.lastMessageAt         = new Date();
    chat.lastMessageSenderRole = req.user.role;

    // Incrémenter le compteur non-lu pour les autres participants
    for (const pid of chat.participants) {
      if (pid.toString() !== myId) {
        const prev = chat.unreadCount.get(pid.toString()) || 0;
        chat.unreadCount.set(pid.toString(), prev + 1);
      }
    }

    await chat.save();

    const savedMsg = chat.messages[chat.messages.length - 1];

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

    // Temps réel : sans ça, chaque participant ne voit un nouveau message
    // qu'au prochain cycle de polling (jusqu'à 5s pour la conversation ouverte,
    // 20s pour la liste) — inacceptable pour un vrai support client en direct.
    // Tous les utilisateurs authentifiés (client, partenaire, admin) rejoignent
    // `user_${id}` à la connexion (voir server.js), donc un seul canal suffit
    // quel que soit le rôle du destinataire.
    const io = global._io;
    if (io) {
      const payload = { chatId: chat._id.toString(), message: savedMsg, type: chat.type };
      for (const otherId of others) io.to(`user_${otherId}`).emit("chat:message", payload);
      // Pour les conversations de support, tout admin doit voir apparaître la
      // demande en direct dans sa file partagée même s'il n'est pas encore
      // participant (voir findAccessibleChat) — sans ceci, seul l'admin déjà
      // ajouté aux participants recevrait l'événement ci-dessus.
      if (SUPPORT_TYPES.includes(chat.type)) io.to("admins").emit("chat:message", payload);
    }

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

// ── Inbox support (admin uniquement) ──────────────────────────────────────
// Liste TOUTES les conversations client_support/partner_support, quel que soit
// l'admin nominalement participant — une file partagée, pas une boîte privée par
// admin (voir findAccessibleChat). "-messages" : on ne charge jamais le contenu
// complet des conversations pour une simple liste, uniquement les métadonnées déjà
// dénormalisées sur le document (lastMessage, lastMessageSenderRole...).
export const getSupportChats = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const chats = await Chat.find({ type: { $in: SUPPORT_TYPES } })
      .select("-messages")
      .sort({ lastMessageAt: -1 })
      .populate("participants", "firstName lastName email role profilePhoto");

    const result = chats.map((c) => {
      const requester = c.participants.find((p) => p.role !== "admin");
      return {
        _id:           c._id,
        type:          c.type,
        requester,
        lastMessage:   c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unread:        c.unreadCount?.get?.(myId) || 0,
        // Aucun admin n'a encore répondu au dernier message → nécessite une action.
        needsReply:    c.lastMessageSenderRole != null && c.lastMessageSenderRole !== "admin",
      };
    });

    res.json({ chats: result });
  } catch (err) {
    logger.error("getSupportChats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
