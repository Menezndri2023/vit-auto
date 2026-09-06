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
import { sendViaWhatsApp } from "../services/communication/CommunicationService.js";

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

// Booking Engine — livraison (2026-09). Boutons interactifs Meta (quick_reply)
// avec un payload portant l'ID de réservation — relu par
// whatsappController.handleInteractiveButton, qui appelle
// bookingActionService.markVehicleOnTheWay/markVehicleDelivered (jamais de
// logique de statut dupliquée ici). Nécessite un template Meta approuvé
// nommé "delivery_reminder_partner" (catégorie UTILITY), même principe que
// "new_booking_partner" (voir queue/index.js dispatch.partnerBookingApproved).
async function sendPartnerDeliveryReminder(booking) {
  const User = (await import("../models/User.js")).default;
  const ownerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
  if (!ownerId) return;
  const owner = await User.findById(ownerId).select("phone firstName").lean();
  if (!owner?.phone) return;

  const pickupDate = new Date(booking.location.startDate).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const addr = booking.location.pickupPosition?.address || booking.location.pickupLocation || "";

  await sendViaWhatsApp({
    to: owner.phone,
    template: "delivery_reminder_partner",
    language: "fr",
    userId: ownerId,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: owner.firstName || "Partenaire" },
          { type: "text", text: booking.reference || "" },
          { type: "text", text: booking.vehicle?.title || "votre annonce" },
          { type: "text", text: addr },
          { type: "text", text: pickupDate },
        ],
      },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `ON_THE_WAY_${booking._id}` }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `DELIVERED_${booking._id}` }] },
    ],
  });
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
    }).select("client clientInfo reference location vehicle delivery")
      .populate("vehicle", "owner title")
      .lean();

    let sent = 0;
    for (const booking of due) {
      const userId = booking.client;
      const pickupDate = new Date(booking.location.startDate).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
      const methodTxt = booking.location.pickupMethod === "livraison" ? "livraison à votre adresse" : "retrait en agence";
      if (userId) {
        await notifyClient(
          userId,
          "🚗 Votre location commence bientôt",
          `Réservation ${booking.reference || ""} : ${methodTxt} prévu(e) le ${pickupDate}. Munissez-vous de votre pièce d'identité et de votre permis de conduire.`,
          `/dashboard`
        );
      }

      // Booking Engine — livraison (2026-09) : au même moment, le partenaire
      // reçoit ses boutons de suivi (EN ROUTE/LIVRÉ) — jamais au moment de
      // l'approbation, Meta limite à 3 boutons/message et ACCEPTER/REFUSER/
      // ALTERNATIVE les occupent déjà (voir dispatch.partnerBookingApproved).
      if (booking.location.pickupMethod === "livraison" && booking.delivery?.status === "confirmed") {
        await sendPartnerDeliveryReminder(booking).catch((e) =>
          logger.error("[BookingReminders] Rappel livraison partenaire échoué:", { bookingId: booking._id, error: e.message })
        );
      }

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
