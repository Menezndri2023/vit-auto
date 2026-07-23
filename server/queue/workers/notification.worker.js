/**
 * VIT AUTO — Notification Worker (Internal + Push)
 *
 * Types:
 *   internal  → Socket.io + MongoDB Notification
 *   push      → Firebase Cloud Messaging
 *   broadcast → envoyer à tous les utilisateurs d'un rôle
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { captureException } from "../../config/sentry.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processNotificationJob(job) {
  const { channel = "internal", ...payload } = job.data;
  logger.debug("[NotifWorker] Traitement", { channel, jobId: job.id });

  const comm = await import("../../services/communication/CommunicationService.js");

  switch (channel) {
    case "push":
      return comm.sendViaPush(payload);

    case "broadcast":
      return comm.broadcast(payload);

    // Rappel différé (sondage post-service) — voir bookingController
    // .schedulePostServiceSurvey. Revérifie l'état de la commande au moment de
    // l'envoi (24h après planification) : si le client a déjà laissé un avis,
    // ou si la commande n'est plus "completed" (litige rouvert entre-temps...),
    // la relance n'a plus lieu d'être.
    case "booking_review_reminder": {
      const { bookingId, ...notifPayload } = payload;
      const Booking = (await import("../../models/Booking.js")).default;
      const booking = await Booking.findById(bookingId).select("status review").lean();
      if (!booking || booking.status !== "completed" || booking.review) return null;
      return comm.sendViaInternal(notifPayload);
    }

    case "internal":
    default:
      return comm.sendViaInternal(payload);
  }
}

export function startNotificationWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.NOTIFICATION,
    processNotificationJob,
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.NOTIFICATION],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[NotifWorker] Échec", { jobId: job?.id, channel: job?.data?.channel, error: err.message });
    captureException(err, { worker: "NotifWorker", jobId: job?.id });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) {
      logger.error("[NotifWorker] Erreur worker", { error: err.message });
      captureException(err, { worker: "NotifWorker", source: "workerError" });
    }
  });

  logger.info("[NotificationWorker] Démarré", { queue: QUEUE_NAMES.NOTIFICATION });
  return worker;
}
