import logger from "../utils/logger.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

// ── Mes notifications ─────────────────────────────────────────────────────
export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const nonLues = await Notification.countDocuments({ user: req.user._id, lu: false });

    res.json({ notifications, nonLues });
  } catch (err) {
    logger.error("getMyNotifications:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Marquer une notification comme lue ───────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { lu: true, luAt: new Date() },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Notification introuvable." });
    res.json({ notification: notif });
  } catch (err) {
    logger.error("markAsRead:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Marquer toutes comme lues ─────────────────────────────────────────────
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, lu: false },
      { lu: true, luAt: new Date() }
    );
    res.json({ message: "Toutes les notifications marquées comme lues." });
  } catch (err) {
    logger.error("markAllAsRead:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Supprimer une notification ────────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: "Notification supprimée." });
  } catch (err) {
    logger.error("deleteNotification:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Enregistrer un token push (app native iOS/Android) ────────────────────
export const registerPushToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token requis." });
    await User.updateOne({ _id: req.user._id }, { $addToSet: { pushTokens: token } });
    res.json({ message: "Token enregistré." });
  } catch (err) {
    logger.error("registerPushToken:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Retirer un token push (déconnexion / désinstallation) ─────────────────
export const unregisterPushToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token requis." });
    await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: token } });
    res.json({ message: "Token retiré." });
  } catch (err) {
    logger.error("unregisterPushToken:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Envoyer une notification système (admin) ──────────────────────────────
export const sendAdminNotification = async (req, res) => {
  try {
    const { titre, message, targetRole, lien } = req.body;
    if (!titre || !message) {
      return res.status(400).json({ message: "Titre et message requis." });
    }

    const filter = { isActive: true };
    if (targetRole && targetRole !== "all") filter.role = targetRole;

    const users = await User.find(filter).select("_id");
    if (!users.length) return res.status(404).json({ message: "Aucun utilisateur trouvé." });

    const docs = users.map((u) => ({
      user:  u._id,
      type:  "system",
      titre,
      message,
      lien:  lien || null,
    }));

    await Notification.insertMany(docs);
    res.json({ sent: docs.length, message: `Notification envoyée à ${docs.length} utilisateur(s).` });
  } catch (err) {
    logger.error("sendAdminNotification:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
