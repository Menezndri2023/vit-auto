import { Worker } from "bullmq";
import { createBullMQConnection } from "../config/redis.js";
import { sendSms }      from "../services/communication/channels/SmsChannel.js";
import { sendWhatsApp } from "../services/communication/channels/WhatsAppChannel.js";
import { sendPush }     from "../services/communication/channels/PushChannel.js";
import logger from "../utils/logger.js";

export function startNotificationWorker() {
  const conn = createBullMQConnection();
  if (!conn) return;

  const worker = new Worker("notifications", async (job) => {
    const { channel, to, userId, title, body, data, template, components, language } = job.data;

    switch (channel) {
      case "sms":
        await sendSms({ to, message: body, template, data });
        break;
      case "whatsapp":
        await sendWhatsApp({ to, template, components, text: body, language });
        break;
      case "push":
        await sendPush({ to: to || userId, title, body, data });
        break;
      default:
        logger.warn("Canal notification inconnu", { channel });
    }
  }, {
    connection: conn,
    concurrency: 10,
  });

  worker.on("failed", (job, err) => {
    logger.error("Notification job échoué", { jobId: job?.id, error: err.message });
  });

  logger.info("Notification worker démarré");
  return worker;
}
