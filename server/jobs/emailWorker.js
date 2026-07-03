import { Worker } from "bullmq";
import { createBullMQConnection } from "../config/redis.js";
import { sendEmail } from "../services/communication/channels/EmailChannel.js";
import { logSend }   from "../services/communication/analytics/CommunicationAnalytics.js";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js";

export function startEmailWorker() {
  const conn = createBullMQConnection();
  if (!conn) return;

  const worker = new Worker("email", async (job) => {
    const { to, subject, html, template, userId, attachments } = job.data;
    const trackingId = randomUUID();

    try {
      const { messageId, provider } = await sendEmail({ to, subject, html, trackingId, userId, attachments });

      await logSend({
        userId, to, channel: "email", template, subject,
        preview: subject, provider, messageId, status: "sent",
        trackingId,
      });

      logger.debug("Email envoyé (worker)", { to, subject, messageId });
    } catch (err) {
      await logSend({
        userId, to, channel: "email", template, subject,
        provider: "resend", status: "failed", errorMessage: err.message,
      });
      logger.error("Email worker erreur", { to, subject, error: err.message });
      throw err; // BullMQ va retenter
    }
  }, {
    connection: conn,
    concurrency: 5,
  });

  worker.on("failed", (job, err) => {
    logger.error("Email job échoué définitivement", { jobId: job?.id, error: err.message });
  });

  logger.info("Email worker démarré");
  return worker;
}
