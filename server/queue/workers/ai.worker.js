/**
 * VIT AUTO — AI/ML Worker
 *
 * Tâches d'intelligence artificielle exécutées en arrière-plan.
 *
 * Types:
 *   score_vehicle        → Re-calcul score qualité annonce (déjà fait inline, ici pour refresh)
 *   fraud_detection      → Détection de fraude sur une réservation ou un paiement
 *   recommend_vehicles   → Générer des recommandations personnalisées
 *   score_partner        → Score de performance partenaire (réponse, avis, taux completion)
 *   analyze_booking_risk → Évaluer le risque d'une réservation (client non vérifié, gros montant, etc.)
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { captureException } from "../../config/sentry.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processAiJob(job) {
  const { type, data = {} } = job.data;

  switch (type) {
    case "score_vehicle": {
      const { vehicleId } = data;
      const Vehicle = (await import("../../models/Vehicle.js")).default;
      const vehicle = await Vehicle.findById(vehicleId).lean();
      if (!vehicle) return { skipped: true };

      // Score simple basé sur la complétude des données
      let score = 0;
      if (vehicle.images?.length >= 3)         score += 20;
      if (vehicle.description?.length >= 100)  score += 15;
      if (vehicle.pricePerDay > 0)             score += 10;
      if (vehicle.nombrePlaces >= 2)           score += 5;
      if (vehicle.carburant)                   score += 5;
      if (vehicle.transmission)                score += 5;
      if (vehicle.annee >= 2015)               score += 10;
      if (vehicle.noteMoyenne >= 4)            score += 15;
      if (vehicle.nombreAvis >= 5)             score += 10;
      if (vehicle.withDriver)                  score += 5;
      score = Math.min(score, 100);

      await Vehicle.findByIdAndUpdate(vehicleId, { $set: { aiScore: score } });
      return { vehicleId, aiScore: score };
    }

    case "fraud_detection": {
      const { bookingId, userId, amount } = data;
      const flags = [];

      const User = (await import("../../models/User.js")).default;
      const Booking = (await import("../../models/Booking.js")).default;

      const [user, recentBookings] = await Promise.all([
        User.findById(userId).select("kycStatus createdAt emailVerified").lean(),
        Booking.countDocuments({ client: userId, createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } }),
      ]);

      if (!user?.emailVerified)                 flags.push("email_non_verifie");
      if (user?.kycStatus !== "VERIFIE")        flags.push("kyc_non_verifie");
      if (amount > 500000)                      flags.push("montant_eleve");
      if (recentBookings >= 5)                  flags.push("trop_de_reservations_24h");
      const accountAgeDays = (Date.now() - new Date(user?.createdAt).getTime()) / 86400000;
      if (accountAgeDays < 1)                   flags.push("compte_tres_recent");

      const riskLevel = flags.length >= 3 ? "high" : flags.length >= 1 ? "medium" : "low";

      if (riskLevel === "high") {
        logger.warn("[AiWorker] Fraude potentielle détectée", { bookingId, userId, flags });
        const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");
        await sendViaInternal({
          userId:  null, // admins
          type:    "system",
          titre:   "⚠️ Alerte fraude potentielle",
          message: `Réservation ${bookingId} — Risque: ${riskLevel} — Flags: ${flags.join(", ")}`,
          lien:    `/admin`,
        }).catch(() => {});
        // Risque élevé : reste "pending" pour la revue humaine d'exception
        // (queue admin existante, getPendingValidationBookings) — on écrit
        // quand même fraudCheck pour que l'admin voie le détail des drapeaux.
        const Booking = (await import("../../models/Booking.js")).default;
        await Booking.findByIdAndUpdate(bookingId, {
          $set: { fraudCheck: { riskLevel, flags, checkedAt: new Date() } },
        }).catch(() => {});
      } else if (bookingId) {
        // Booking Engine (2026-09) : risque faible/moyen → approbation
        // automatique, remplace le gate admin manuel par défaut (voir
        // bookingActionService.autoApproveBooking, qui réutilise
        // adminValidateBooking tel quel).
        const { autoApproveBooking } = await import("../../services/bookingActionService.js");
        await autoApproveBooking({ bookingId, riskLevel, flags }).catch((e) =>
          logger.error("[AiWorker] autoApproveBooking échoué:", { bookingId, error: e.message })
        );
      }

      return { bookingId, riskLevel, flags };
    }

    case "score_partner": {
      const { partnerId } = data;
      const [Vehicle, Booking, Review] = await Promise.all([
        import("../../models/Vehicle.js").then(m => m.default),
        import("../../models/Booking.js").then(m => m.default),
        import("../../models/Review.js").then(m => m.default),
      ]);

      const [vehicles, completedBookings, reviews] = await Promise.all([
        Vehicle.countDocuments({ owner: partnerId, status: "approved" }),
        Booking.countDocuments({ status: "completed" }),
        Review.find({ target: partnerId }).select("rating").lean(),
      ]);

      const avgRating = reviews.length
        ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
        : 0;

      const score = Math.min(
        (vehicles * 5) +
        (completedBookings * 2) +
        (parseFloat(avgRating) * 10) +
        (reviews.length >= 10 ? 20 : reviews.length * 2),
        100
      );

      const PartnerShowroom = (await import("../../models/PartnerShowroom.js")).default;
      await PartnerShowroom.findOneAndUpdate(
        { partnerId },
        { $set: { "stats.aiPerformanceScore": score, "stats.avgRating": avgRating, "stats.totalReviews": reviews.length } },
        { upsert: false }
      ).catch(() => {});

      return { partnerId, performanceScore: score, avgRating, reviewCount: reviews.length };
    }

    case "analyze_booking_risk": {
      // Alias de fraud_detection avec contexte booking
      return processAiJob({ ...job, data: { type: "fraud_detection", data } });
    }

    default:
      logger.warn("[AiWorker] Type inconnu", { type });
      return { skipped: true };
  }
}

export function startAiWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.AI,
    async (job) => {
      logger.debug("[AiWorker] Traitement", { type: job.data.type, jobId: job.id });
      return processAiJob(job);
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.AI],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[AiWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message });
    captureException(err, { worker: "AiWorker", jobId: job?.id });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) {
      logger.error("[AiWorker] Erreur worker", { error: err.message });
      captureException(err, { worker: "AiWorker", source: "workerError" });
    }
  });

  logger.info("[AiWorker] Démarré", { queue: QUEUE_NAMES.AI });
  return worker;
}
