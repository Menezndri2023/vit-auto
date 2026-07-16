/**
 * VIT AUTO — WhatsApp Worker
 *
 * Types: booking_confirmed | payment_received | loi_ready | agreement_ready | generic
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { captureException } from "../../config/sentry.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processWhatsAppJob(job) {
  const { to, template, components, text, language, userId, data } = job.data;
  logger.debug("[WAWorker] Traitement", { template, to, jobId: job.id });

  const { sendViaWhatsApp } = await import("../../services/communication/CommunicationService.js");
  return sendViaWhatsApp({ to, template, components, text, language, userId, context: { jobId: job.id, data } });
}

export function startWhatsAppWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.WHATSAPP,
    processWhatsAppJob,
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.WHATSAPP],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[WAWorker] Échec", { jobId: job?.id, template: job?.data?.template, error: err.message });
    captureException(err, { worker: "WAWorker", jobId: job?.id });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) {
      logger.error("[WAWorker] Erreur worker", { error: err.message });
      captureException(err, { worker: "WAWorker", source: "workerError" });
    }
  });

  logger.info("[WhatsAppWorker] Démarré", { queue: QUEUE_NAMES.WHATSAPP });
  return worker;
}
