/**
 * VIT AUTO — Délai de réponse partenaire (Booking Engine, 2026-09)
 *
 * Depuis la suppression du gate admin manuel, une réservation approuvée
 * (système ou admin) attend une action du partenaire (accepter/refuser/
 * proposer une alternative) — jusqu'ici rien ne relançait ce dernier ni ne
 * faisait avancer la réservation en cas de silence. Même pattern que
 * bookingReminders.js/partnerReminders.js : volontairement PAS un job BullMQ
 * (quota Redis Upstash déjà sous tension) — un setInterval en mémoire, scan
 * toutes les 5 min (fenêtre de réponse de 30 min, un scan horaire serait trop
 * grossier).
 */
import logger from "./logger.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import { dispatch } from "../queue/index.js";
import { notify } from "../controllers/bookingController.js";

const REMINDER_15_MS = 15 * 60 * 1000;
const REMINDER_25_MS = 25 * 60 * 1000;
const EXPIRE_30_MS   = 30 * 60 * 1000;

function resolveOwnerId(booking) {
  return booking.vehicle?.owner?._id?.toString()  || booking.vehicle?.owner?.toString()
    || booking.driver?.owner?._id?.toString()   || booking.driver?.owner?.toString()
    || booking.activity?.owner?._id?.toString() || booking.activity?.owner?.toString()
    || null;
}

function serviceTitleOf(booking) {
  return booking.vehicle?.title
    || (booking.driver ? `${booking.driver.firstName || ""} ${booking.driver.lastName || ""}`.trim() : null)
    || booking.activity?.title
    || "votre annonce";
}

async function findAwaitingPartnerAction(olderThanMs, notOlderThanMs) {
  const now = new Date();
  const query = {
    status: "pending",
    "adminValidation.status": "approved",
    partnerNotifiedAt: { $ne: null, $lte: new Date(now.getTime() - olderThanMs) },
  };
  if (notOlderThanMs != null) {
    query.partnerNotifiedAt.$gt = new Date(now.getTime() - notOlderThanMs);
  }
  return Booking.find(query)
    .populate("vehicle",  "owner title")
    .populate("driver",   "owner firstName lastName")
    .populate("activity", "owner title");
}

export async function checkPartnerResponseTimeouts() {
  let reminded15 = 0, reminded25 = 0, expired = 0;
  try {
    // ── Rappel à 15 min ──────────────────────────────────────────────────────
    const due15 = (await findAwaitingPartnerAction(REMINDER_15_MS)).filter((b) => !b.reminder15SentAt);
    for (const booking of due15) {
      const ownerId = resolveOwnerId(booking);
      if (ownerId) {
        await notify(ownerId, "system", "⏰ Rappel — réservation en attente",
          `Réservation ${booking.reference} toujours en attente de votre réponse.`, "/vendor/dashboard");
        dispatch.partnerBookingApproved(booking, ownerId, serviceTitleOf(booking)).catch(() => {});
      }
      await Booking.updateOne({ _id: booking._id, reminder15SentAt: null }, { $set: { reminder15SentAt: new Date() } });
      reminded15 += 1;
    }

    // ── Deuxième rappel à 25 min ─────────────────────────────────────────────
    const due25 = (await findAwaitingPartnerAction(REMINDER_25_MS)).filter((b) => !b.reminder25SentAt);
    for (const booking of due25) {
      const ownerId = resolveOwnerId(booking);
      if (ownerId) {
        await notify(ownerId, "system", "⏰ Dernier rappel — réservation en attente",
          `Réservation ${booking.reference} expire dans 5 minutes sans réponse de votre part.`, "/vendor/dashboard");
        dispatch.partnerBookingApproved(booking, ownerId, serviceTitleOf(booking)).catch(() => {});
      }
      await Booking.updateOne({ _id: booking._id, reminder25SentAt: null }, { $set: { reminder25SentAt: new Date() } });
      reminded25 += 1;
    }

    // ── Expiration à 30 min ──────────────────────────────────────────────────
    const dueExpire = await findAwaitingPartnerAction(EXPIRE_30_MS);
    for (const booking of dueExpire) {
      const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: "pending" },
        {
          $set: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledBy: "system",
            cancelReasonCode: "partner_no_response",
            cancelReason: "Le partenaire n'a pas répondu dans le délai imparti (30 minutes).",
          },
          $push: { auditTrail: { action: "partner_response_expired", actorType: "SYSTEM", source: "SYSTEM" } },
        },
        { new: true },
      );
      if (!updated) continue; // déjà traité entre-temps (idempotence)

      if (booking.client) {
        await notify(booking.client, "booking_cancelled", "❌ Réservation expirée",
          `Votre réservation ${booking.reference} a expiré faute de réponse du partenaire. Nous vous invitons à réserver un autre véhicule.`,
          "/dashboard").catch(() => {});
      }
      const ownerId = resolveOwnerId(booking);
      if (ownerId) {
        await User.find({ role: "admin" }).select("_id").lean().then((admins) =>
          Promise.all(admins.map((a) => notify(a._id, "system", "⚠️ Expiration partenaire",
            `Réservation ${booking.reference} auto-annulée — le partenaire n'a jamais répondu.`, "/admin")))
        ).catch(() => {});
      }
      expired += 1;
    }

    if (reminded15 || reminded25 || expired) {
      logger.info("[PartnerResponseReminders] Cycle terminé", { reminded15, reminded25, expired });
    }
    return { reminded15, reminded25, expired };
  } catch (err) {
    logger.error("checkPartnerResponseTimeouts:", err);
    return { reminded15, reminded25, expired };
  }
}

let _interval = null;
export function startPartnerResponseScheduler() {
  if (_interval) return;
  setTimeout(() => checkPartnerResponseTimeouts(), 2 * 60 * 1000); // 2 min après le démarrage
  _interval = setInterval(() => checkPartnerResponseTimeouts(), 5 * 60 * 1000); // toutes les 5 min
}
