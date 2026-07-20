import mongoose from "mongoose";
import logger from "../../../utils/logger.js";
import { sendPush, isAvailable as pushAvailable } from "./PushChannel.js";

// Relaie vers les appareils natifs (iOS/Android) de l'utilisateur si des
// tokens FCM sont enregistrés — jamais attendu par l'appelant (l'in-app via
// Socket.io reste la voie principale, le push est un bonus best-effort).
async function fanOutPush(userId, title, body, data) {
  try {
    const User = (await import("../../../models/User.js")).default;
    const u = await User.findById(userId).select("pushTokens").lean();
    if (u?.pushTokens?.length) {
      await sendPush({ to: u.pushTokens, title, body, data });
    }
  } catch (err) {
    logger.warn("[InternalChannel] fan-out push échoué", { error: err.message, userId });
  }
}

const EVENT_ICONS = {
  booking:           "🚗",
  payment:           "💳",
  kyc:               "🔍",
  partner:           "🤝",
  system:            "⚙️",
  alert:             "⚠️",
  success:           "✅",
  ie_reservation:    "📦",
  ie_step_update:    "📋",
  ie_escrow_released:"💰",
  driver:            "👨‍✈️",
  review:            "⭐",
  contract:          "📄",
  loi_ready:         "📝",
  agreement_ready:   "🤝",
  invoice:           "🧾",
};

export async function sendInternal({ userId, type = "system", titre, message, lien, priority = "normal", metadata = {} }) {
  if (!userId) {
    logger.warn("[InternalChannel] userId manquant");
    return { sent: false };
  }

  try {
    const Notification = (await import("../../../models/Notification.js")).default;
    const icon = EVENT_ICONS[type] || "🔔";

    const notif = await Notification.create({
      user:    userId,
      type,
      titre:   titre ? `${icon} ${titre}` : icon,
      message,
      lien:    lien || null,
      lu:      false,
      channel: "internal",
    });

    // Émission Socket.io temps-réel
    if (global._io) {
      const payload = {
        _id:     notif._id,
        type,
        titre:   notif.titre,
        message,
        lien:    lien || null,
        createdAt: notif.createdAt,
        priority,
      };
      global._io.to(`user_${userId}`).emit("notification_new", payload);
    }

    if (pushAvailable()) fanOutPush(userId, notif.titre, message, { lien: lien || "", type });

    logger.debug("[InternalChannel] Notification envoyée", { userId, type, titre });
    return { sent: true, notifId: notif._id, provider: "socket" };
  } catch (err) {
    logger.error("[InternalChannel] Erreur", { error: err.message, userId });
    return { sent: false, error: err.message };
  }
}

export async function sendInternalBroadcast({ role, type, titre, message, lien }) {
  try {
    const User = (await import("../../../models/User.js")).default;
    const users = await User.find({ role, isActive: true }).select("_id pushTokens").lean();

    if (!users.length) return { sent: false, count: 0 };

    const Notification = (await import("../../../models/Notification.js")).default;
    const icon = EVENT_ICONS[type] || "🔔";
    const titreWithIcon = titre ? `${icon} ${titre}` : icon;

    const notifs = await Notification.insertMany(
      users.map((u) => ({ user: u._id, type, titre: titreWithIcon, message, lien, channel: "internal" }))
    );

    if (global._io) {
      users.forEach((u) => {
        global._io.to(`user_${u._id}`).emit("notification_new", {
          type, titre: titreWithIcon, message, lien, createdAt: new Date(),
        });
      });
    }

    if (pushAvailable()) {
      const allTokens = users.flatMap((u) => u.pushTokens || []);
      if (allTokens.length) {
        sendPush({ to: allTokens, title: titreWithIcon, body: message, data: { lien: lien || "", type } })
          .catch((err) => logger.warn("[InternalChannel] fan-out push broadcast échoué", { error: err.message }));
      }
    }

    logger.info("[InternalChannel] Broadcast envoyé", { role, count: users.length, type });
    return { sent: true, count: notifs.length };
  } catch (err) {
    logger.error("[InternalChannel] Broadcast error", { error: err.message });
    return { sent: false, error: err.message };
  }
}
