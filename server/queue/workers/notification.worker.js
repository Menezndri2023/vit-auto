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
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) logger.error("[NotifWorker] Erreur worker", { error: err.message });
  });

  logger.info("[NotificationWorker] Démarré", { queue: QUEUE_NAMES.NOTIFICATION });
  return worker;
}
