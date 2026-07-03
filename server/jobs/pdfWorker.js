import { Worker } from "bullmq";
import { createBullMQConnection } from "../config/redis.js";
import logger from "../utils/logger.js";

export function startPdfWorker() {
  const conn = createBullMQConnection();
  if (!conn) return;

  const worker = new Worker("pdf", async (job) => {
    const { type, data } = job.data;
    logger.debug("PDF worker — génération", { type, jobId: job.id });

    // Import dynamique du générateur PDF (évite circular deps)
    const { generateInvoicePdf, generateContractPdf } = await import("../utils/pdfGenerator.js");

    switch (type) {
      case "invoice":
        return await generateInvoicePdf(data);
      case "contract":
        return await generateContractPdf(data);
      default:
        throw new Error(`PDF type inconnu : ${type}`);
    }
  }, {
    connection: conn,
    concurrency: 2,
  });

  worker.on("failed", (job, err) => {
    logger.error("PDF job échoué", { jobId: job?.id, error: err.message });
  });

  logger.info("PDF worker démarré");
  return worker;
}
