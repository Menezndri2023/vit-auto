// Booking Engine (2026-09) — point d'entrée UNIQUE pour toute action sur une
// réservation, quel que soit le canal d'origine (dashboard, WhatsApp, futur
// email/push). Plutôt que de dupliquer la machine à états déjà construite et
// testée dans bookingController.js (updateBookingStatus/adminValidateBooking),
// ce service les invoque programmatiquement via invokeController — la même
// fonction s'exécute qu'elle soit appelée par une vraie requête HTTP
// (dashboard) ou par ce service (WhatsApp, auto-approbation par score de
// fraude) : jamais deux implémentations différentes de la même transition.
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import logger from "../utils/logger.js";
import { invokeController } from "../utils/invokeController.js";
import { computeLocationTotal } from "../utils/seasonalPricing.js";

// Import dynamique pour éviter un cycle d'imports au chargement du module
// (bookingController.js n'a pas besoin d'importer ce fichier en retour).
async function getBookingController() {
  return import("../controllers/bookingController.js");
}

// ── ACCEPT ────────────────────────────────────────────────────────────────
// Booking Engine — livraison (2026-09) : accepter une réservation confirme
// AUSSI la livraison du même geste si le client a choisi ce mode — pas
// d'étape séparée, conforme au principe "le moins d'étapes possible" du
// cahier des charges. "Refuser un autre horaire ?" reste possible ensuite
// via proposeAlternative (réutilise proposedStartDate, voir plus bas).
export async function acceptBooking({ bookingId, actorId, source = "API" }) {
  const { updateBookingStatus, notify: notifyClient } = await getBookingController();
  const result = await invokeController(updateBookingStatus, {
    params: { id: bookingId },
    body:   { status: "confirmed" },
    user:   { _id: actorId, role: "partenaire" },
    source,
  });

  if (result.statusCode < 400) {
    const booking = await Booking.findById(bookingId);
    if (booking?.location?.pickupMethod === "livraison" && booking.delivery?.status === "requested") {
      booking.delivery.status      = "confirmed";
      booking.delivery.confirmedBy = actorId || null;
      booking.delivery.confirmedAt = new Date();
      await booking.save();

      if (booking.client) {
        const when = booking.delivery.requestedDateTime
          ? new Date(booking.delivery.requestedDateTime).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
          : "";
        const addr = booking.location.pickupPosition?.address || booking.location.pickupLocation || "";
        await notifyClient(
          booking.client, "system", "📍 Livraison confirmée",
          `Votre véhicule (réservation ${booking.reference}) sera livré à ${addr}${when ? ` le ${when}` : ""}. Vous serez informé lorsqu'il sera en route.`,
          "/dashboard",
        ).catch(() => {});
      }
    }
  }

  return result;
}

// ── REJECT ────────────────────────────────────────────────────────────────
// N'existait nulle part avant cette phase pour une réservation `pending` —
// seul un admin pouvait refuser via adminValidateBooking, et seulement avant
// approbation. Le partenaire peut désormais refuser directement une demande
// qui lui a été assignée.
export async function rejectBooking({ bookingId, actorId, reasonCode, source = "API" }) {
  const { updateBookingStatus } = await getBookingController();
  return invokeController(updateBookingStatus, {
    params: { id: bookingId },
    body:   { status: "cancelled", cancelReasonCode: reasonCode || "vehicule_indisponible" },
    user:   { _id: actorId, role: "partenaire" },
    source,
  });
}

// ── AUTO-APPROBATION PAR SCORE DE FRAUDE ────────────────────────────────────
// Appelée depuis server/queue/workers/ai.worker.js (fraud_detection) pour un
// risque "low"/"medium" — remplace la validation admin manuelle par défaut,
// tout en réutilisant EXACTEMENT le même chemin (adminValidateBooking) qu'un
// vrai admin pour un risque "high" (queue existante, inchangée).
export async function autoApproveBooking({ bookingId, riskLevel, flags }) {
  await Booking.findByIdAndUpdate(bookingId, {
    $set: { fraudCheck: { riskLevel, flags, checkedAt: new Date() } },
  }).catch((e) => logger.error("autoApproveBooking — écriture fraudCheck:", { error: e.message }));

  const { adminValidateBooking } = await getBookingController();
  const result = await invokeController(adminValidateBooking, {
    params: { id: bookingId },
    body:   { decision: "approved", fraudCheck: { riskLevel, flags } },
    user:   { role: "system" },
    source: "SYSTEM",
  });
  if (result.statusCode >= 400) {
    logger.warn("autoApproveBooking — approbation refusée", { bookingId, statusCode: result.statusCode, message: result.body?.message });
  }
  return result;
}

// ── ALTERNATIVE (proposée par le partenaire) ───────────────────────────────
// Nouveau : jusqu'ici un partenaire ne pouvait que confirmer ou annuler —
// aucun moyen de proposer un autre véhicule/créneau sans faire recommencer
// le client depuis zéro.
export async function proposeAlternative({ bookingId, actorId, proposedVehicleId, proposedStartDate, proposedEndDate, proposedPrice, note, source = "API" }) {
  const booking = await Booking.findById(bookingId).populate("vehicle", "owner");
  if (!booking) return { statusCode: 404, body: { message: "Réservation introuvable." } };

  const vehicleOwnerId = booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString();
  if (actorId && vehicleOwnerId && actorId.toString() !== vehicleOwnerId) {
    return { statusCode: 403, body: { message: "Accès refusé." } };
  }
  if (!["pending", "confirmed"].includes(booking.status)) {
    return { statusCode: 409, body: { message: `Impossible de proposer une alternative pour le statut "${booking.status}".` } };
  }

  booking.alternative = {
    proposedVehicle:   proposedVehicleId || booking.vehicle?._id,
    proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : booking.location?.startDate,
    proposedEndDate:   proposedEndDate   ? new Date(proposedEndDate)   : booking.location?.endDate,
    proposedPrice:     proposedPrice ?? null,
    note:              note ? String(note).trim().slice(0, 500) : null,
    proposedAt:        new Date(),
    clientResponse:    "pending",
    respondedAt:       null,
  };
  // Booking Engine — livraison (2026-09) : une ALTERNATIVE sur une réservation
  // en livraison est le plus souvent "un autre horaire de livraison" (même
  // véhicule, nouvelle proposedStartDate) — aucun nouveau mécanisme dédié,
  // ce champ existant suffit déjà (voir respondToAlternative ci-dessous).
  if (booking.location?.pickupMethod === "livraison" && booking.delivery) {
    booking.delivery.status = "rescheduled";
  }
  booking.auditTrail.push({ action: "alternative_proposed", actorType: "PARTNER", actorId, source });
  await booking.save();

  if (booking.client) {
    const { notify: notifyClient } = await getBookingController();
    await notifyClient(
      booking.client, "system", "🔄 Alternative proposée",
      `Votre véhicule initial n'est plus disponible pour ${booking.reference}. Le partenaire propose une alternative — consultez votre tableau de bord.`,
      "/dashboard",
    ).catch(() => {});
  }

  return { statusCode: 200, body: { booking } };
}

// ── Réponse du client à une alternative ────────────────────────────────────
export async function respondToAlternative({ bookingId, clientId, accept }) {
  const booking = await Booking.findById(bookingId).populate("vehicle");
  if (!booking) return { statusCode: 404, body: { message: "Réservation introuvable." } };
  if (clientId && booking.client && clientId.toString() !== booking.client.toString()) {
    return { statusCode: 403, body: { message: "Accès refusé." } };
  }
  if (!booking.alternative?.proposedAt || booking.alternative.clientResponse !== "pending") {
    return { statusCode: 409, body: { message: "Aucune alternative en attente de réponse." } };
  }

  booking.alternative.clientResponse = accept ? "accepted" : "declined";
  booking.alternative.respondedAt    = new Date();

  if (accept) {
    const alt = booking.alternative;
    if (alt.proposedVehicle && alt.proposedVehicle.toString() !== (booking.vehicle?._id || booking.vehicle)?.toString()) {
      const newVehicle = await Vehicle.findById(alt.proposedVehicle).lean();
      if (newVehicle) booking.vehicle = newVehicle._id;
    }
    if (alt.proposedStartDate) booking.location.startDate = alt.proposedStartDate;
    if (alt.proposedEndDate)   booking.location.endDate   = alt.proposedEndDate;
    const days = booking.location.days || 1;
    const vehicleForPrice = await Vehicle.findById(booking.vehicle).lean();
    booking.montantBase  = alt.proposedPrice ?? computeLocationTotal(vehicleForPrice, alt.proposedStartDate, days);
    booking.montantTotal = booking.montantBase + (booking.montantOptions || 0) + (booking.location.deliveryFee || 0);
    booking.status = "confirmed";
    // Livraison reprogrammée acceptée par le client → re-confirmée avec le
    // nouvel horaire (voir proposeAlternative ci-dessus).
    if (booking.location?.pickupMethod === "livraison" && booking.delivery?.status === "rescheduled") {
      booking.delivery.status = "confirmed";
      booking.delivery.requestedDateTime = alt.proposedStartDate || booking.delivery.requestedDateTime;
      booking.delivery.confirmedAt = new Date();
    }
  } else {
    booking.status       = "cancelled";
    booking.cancelledAt  = new Date();
    booking.cancelledBy  = "client";
    booking.cancelReasonCode = "offre_trouvee_ailleurs";
    booking.cancelReason = "Alternative proposée par le partenaire refusée par le client.";
  }
  booking.auditTrail.push({ action: `alternative_${booking.alternative.clientResponse}`, actorType: "CLIENT", actorId: clientId });
  await booking.save();

  const { emitBookingUpdate, syncVehicleAvailability } = await getBookingController();
  emitBookingUpdate?.(booking);
  syncVehicleAvailability(booking.vehicle?._id || booking.vehicle).catch(() => {});

  return { statusCode: 200, body: { booking } };
}

// ── Suivi de livraison (Booking Engine, 2026-09) ──────────────────────────
function resolveOwnerId(booking) {
  return booking.vehicle?.owner?._id?.toString() || booking.vehicle?.owner?.toString() || null;
}

async function assertDeliveryActor(booking, actorId) {
  const ownerId = resolveOwnerId(booking);
  if (actorId && ownerId && actorId.toString() !== ownerId) {
    return { statusCode: 403, body: { message: "Accès refusé." } };
  }
  return null;
}

// Le véhicule vient de partir vers le client. Réutilise la transition
// existante `confirmed → in_progress` de updateBookingStatus — son message
// client déjà défini ("🚀 En route vers vous ! ... Préparez votre pièce
// d'identité") correspond exactement à cet événement, aucun doublon créé.
// Jamais de suivi GPS continu (hors périmètre, voir le plan de cette phase).
export async function markVehicleOnTheWay({ bookingId, actorId, source = "API" }) {
  const booking = await Booking.findById(bookingId).populate("vehicle", "owner");
  if (!booking) return { statusCode: 404, body: { message: "Réservation introuvable." } };
  const denied = await assertDeliveryActor(booking, actorId);
  if (denied) return denied;
  if (booking.location?.pickupMethod !== "livraison") {
    return { statusCode: 409, body: { message: "Cette réservation n'est pas en mode livraison." } };
  }
  if (booking.delivery?.status !== "confirmed") {
    return { statusCode: 409, body: { message: `Livraison non confirmée (statut actuel : ${booking.delivery?.status}).` } };
  }

  booking.delivery.status = "on_the_way";
  booking.delivery.onTheWaySentAt = new Date();
  booking.auditTrail.push({ action: "delivery_on_the_way", actorType: "PARTNER", actorId, source });
  await booking.save();

  const { updateBookingStatus } = await getBookingController();
  return invokeController(updateBookingStatus, {
    params: { id: bookingId },
    body:   { status: "in_progress" },
    user:   { _id: actorId, role: "partenaire" },
    source,
  });
}

// Le véhicule vient d'être remis au client — réutilise updateBookingStatus
// (status → "client_arrived", même transition/effets de bord qu'un retrait
// en agence) plutôt que d'inventer un statut "vehicle_delivered" séparé.
// Nécessite d'être passé par markVehicleOnTheWay d'abord (in_progress →
// client_arrived est la seule transition valide vers client_arrived pour une
// réservation déjà confirmée — voir VALID_TRANSITIONS de updateBookingStatus).
export async function markVehicleDelivered({ bookingId, actorId, source = "API" }) {
  const booking = await Booking.findById(bookingId).populate("vehicle", "owner");
  if (!booking) return { statusCode: 404, body: { message: "Réservation introuvable." } };
  const denied = await assertDeliveryActor(booking, actorId);
  if (denied) return denied;
  if (booking.location?.pickupMethod !== "livraison") {
    return { statusCode: 409, body: { message: "Cette réservation n'est pas en mode livraison." } };
  }
  if (booking.delivery?.status !== "on_the_way") {
    return { statusCode: 409, body: { message: `Le véhicule doit d'abord être signalé "en route" (statut actuel : ${booking.delivery?.status}).` } };
  }

  booking.delivery.status = "delivered";
  booking.delivery.deliveredAt = new Date();
  booking.auditTrail.push({ action: "delivery_delivered", actorType: "PARTNER", actorId, source });
  await booking.save();

  const { updateBookingStatus } = await getBookingController();
  const result = await invokeController(updateBookingStatus, {
    params: { id: bookingId },
    body:   { status: "client_arrived" },
    user:   { _id: actorId, role: "partenaire" },
    source,
  });

  if (result.statusCode < 400 && booking.client) {
    const { notify: notifyClient } = await getBookingController();
    await notifyClient(booking.client, "system", "📦 Véhicule livré",
      `Votre véhicule (réservation ${booking.reference}) a été livré.`, "/dashboard").catch(() => {});
  }
  return result;
}
