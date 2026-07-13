/**
 * VIT AUTO — Partner Feed Worker
 *
 * Traite les imports de flotte en masse des partenaires (CSV/Excel/Google Sheet).
 *
 * Types:
 *   process_import_batch → Créer les véhicules d'un VehicleImportBatch
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processPartnerFeedJob(job) {
  const { type, batchId } = job.data;

  switch (type) {
    case "process_import_batch": {
      const { processImportBatch } = await import("../../services/vehicleImportService.js");
      await processImportBatch(batchId);
      logger.info("[PartnerFeedWorker] Batch traité", { batchId });
      return { batchId, done: true };
    }

    default:
      logger.warn("[PartnerFeedWorker] Type inconnu", { type });
      return { skipped: true };
  }
}

export function startPartnerFeedWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.PARTNER_FEED,
    async (job) => {
      logger.debug("[PartnerFeedWorker] Traitement", { type: job.data.type, jobId: job.id });
      return processPartnerFeedJob(job);
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.PARTNER_FEED],
    }
  );

  worker.on("failed", async (job, err) => {
    logger.error("[PartnerFeedWorker] Échec", { jobId: job?.id, batchId: job?.data?.batchId, error: err.message });

    // Backstop : si tous les essais BullMQ sont épuisés, s'assurer que le batch ne reste
    // pas indéfiniment en "processing" (processImportBatch a normalement déjà mis "failed",
    // mais on protège contre un crash process avant d'y arriver).
    if (job?.attemptsMade >= job?.opts?.attempts && job?.data?.batchId) {
      try {
        const { default: VehicleImportBatch } = await import("../../models/VehicleImportBatch.js");
        await VehicleImportBatch.updateOne(
          { _id: job.data.batchId, status: "processing" },
          { status: "failed", errorMessage: err.message || "Échec du traitement après plusieurs tentatives." }
        );
      } catch (updateErr) {
        logger.error("[PartnerFeedWorker] Échec mise à jour statut batch", { error: updateErr.message });
      }
    }
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) logger.error("[PartnerFeedWorker] Erreur worker", { error: err.message });
  });

  logger.info("[PartnerFeedWorker] Démarré", { queue: QUEUE_NAMES.PARTNER_FEED });
  return worker;
}
