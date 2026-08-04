/**
 * VIT AUTO — Rappel automatique avant prise en charge
 *
 * N'existait pas du tout jusqu'ici : un client dont la location commence
 * demain ne recevait aucun rappel (pièce d'identité/passeport, lieu de
 * prise en charge) — seule la notification de création de réservation
 * existait, souvent envoyée des jours/semaines avant la date réelle.
 *
 * Même pattern que utils/partnerReminders.js : volontairement PAS un job
 * BullMQ (quota Redis Upstash déjà sous tension) — un setInterval en
 * mémoire suffit, avec un scan horaire (plus fin que le quotidien des
 * relances partenaire, une prise en charge étant datée à l'heure près).
 */
import logger from "./logger.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import { dispatch } from "../queue/index.js";

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready"];
const REMINDER_WINDOW_MS = 26 * 60 * 60 * 1000; // fenêtre "commence dans les 26h"

async function notifyClient(userId, titre, message, lien) {
  if (!userId) return;
  const notif = await Notification.create({ user: userId, type: "system", titre, message, lien }).catch(() => null);
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", {
      _id: notif._id, type: "system", titre, message, lien, lu: false, createdAt: notif.createdAt,
    });
  }
  dispatch.pushNotification(userId, titre, message, { lien, type: "system" }).catch(() => {});
}

export async function checkAndSendPickupReminders() {
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

    const due = await Booking.find({
      type: "location",
      status: { $in: ACTIVE_STATUSES },
      pickupReminderSentAt: null,
      "location.startDate": { $gte: now, $lte: windowEnd },
    }).select("client clientInfo reference location vehicle").lean();

    let sent = 0;
    for (const booking of due) {
      const userId = booking.client;
      if (!userId) continue; // réservation invité sans compte — pas de destinataire push/in-app
      const pickupDate = new Date(booking.location.startDate).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
      const methodTxt = booking.location.pickupMethod === "livraison" ? "livraison à votre adresse" : "retrait en agence";
      await notifyClient(
        userId,
        "🚗 Votre location commence bientôt",
        `Réservation ${booking.reference || ""} : ${methodTxt} prévu(e) le ${pickupDate}. Munissez-vous de votre pièce d'identité et de votre permis de conduire.`,
        `/dashboard`
      );
      await Booking.updateOne({ _id: booking._id, pickupReminderSentAt: null }, { $set: { pickupReminderSentAt: new Date() } });
      sent += 1;
    }
    if (sent > 0) logger.info("[BookingReminders] Rappels de prise en charge envoyés", { sent });
    return sent;
  } catch (err) {
    logger.error("checkAndSendPickupReminders:", err);
    return 0;
  }
}

let _interval = null;
export function startBookingReminderScheduler() {
  if (_interval) return;
  setTimeout(() => checkAndSendPickupReminders(), 5 * 60 * 1000); // 5 min après le démarrage
  _interval = setInterval(() => checkAndSendPickupReminders(), 60 * 60 * 1000); // toutes les heures
}
