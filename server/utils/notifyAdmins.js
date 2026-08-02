import User from "../models/User.js";
import Notification from "../models/Notification.js";
import logger from "./logger.js";

// ── Notifier tous les admins (in-app + temps réel) ──────────────────────────
// Bug réel corrigé (audit) : createVehicle/createDriver ne notifiaient jamais
// les admins d'une nouvelle annonce/d'un nouveau profil en attente — l'admin
// ne le découvrait qu'en rechargeant manuellement le dashboard. Même pattern
// que notifyAdmins() dans bookingController.js (litiges), centralisé ici pour
// être réutilisable ailleurs. La copie email est automatique via le hook
// post-save de models/Notification.js (voir utils/adminAlertEmail.js).
export async function notifyAdmins(type, titre, message, lien = "/admin") {
  const admins = await User.find({ role: "admin" }).select("_id").lean();
  await Promise.all(admins.map(async (a) => {
    const notif = await Notification.create({ user: a._id, type, titre, message, lien }).catch((err) => {
      logger.error("notifyAdmins (non bloquant) :", err.message);
      return null;
    });
    if (notif && global._io) {
      global._io.to(`user_${a._id}`).emit("notification_new", {
        _id: notif._id, type, titre, message, lien, lu: false, createdAt: notif.createdAt,
      });
    }
  }));
}
