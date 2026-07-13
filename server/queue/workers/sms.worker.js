/**
 * VIT AUTO — SMS Worker
 *
 * Types: otp_verification | otp_login | booking_confirmed | booking_reminder
 *        payment_received | driver_assigned | kyc_approved | kyc_rejected
 *        partner_approved | loi_ready | generic
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processSmsJob(job) {
  const { type, to, data = {}, message } = job.data;
  logger.debug("[SmsWorker] Traitement", { type, to, jobId: job.id });

  const { sendViaSms } = await import("../../services/communication/CommunicationService.js");
  return sendViaSms({
    to,
    template: type,
    data,
    message,
    userId: data.userId,
    context: { jobId: job.id },
  });
}

export function startSmsWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.SMS,
    processSmsJob,
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.SMS],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[SmsWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) logger.error("[SmsWorker] Erreur worker", { error: err.message });
  });

  logger.info("[SmsWorker] Démarré", { queue: QUEUE_NAMES.SMS });
  return worker;
}
