import { Queue } from "bullmq";
import { createBullMQConnection } from "../config/redis.js";
import logger from "../utils/logger.js";

let _emailQueue       = null;
let _pdfQueue         = null;
let _notifQueue       = null;
let _queuesInitialized = false;

function makeQueue(name, connection) {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail:     { count: 100 },
    },
  });
}

export function initQueues() {
  const conn = createBullMQConnection();
  if (!conn) {
    logger.warn("BullMQ: Redis absent — toutes les tâches seront synchrones");
    return;
  }

  _emailQueue  = makeQueue("email", conn);
  _pdfQueue    = makeQueue("pdf",   conn);
  _notifQueue  = makeQueue("notifications", conn);
  _queuesInitialized = true;

  logger.info("BullMQ queues initialisées (email, pdf, notifications)");
}

export const getEmailQueue       = () => _emailQueue;
export const getPdfQueue         = () => _pdfQueue;
export const getNotifQueue       = () => _notifQueue;
export const areQueuesReady      = () => _queuesInitialized;

// ── Helpers d'ajout — ne throw jamais ───────────────────────────────────────

export async function enqueueEmail(payload) {
  if (!_emailQueue) return false;
  try {
    await _emailQueue.add("send", payload);
    return true;
  } catch (err) {
    logger.error("Enqueue email erreur", { error: err.message });
    return false;
  }
}

export async function enqueuePdf(payload) {
  if (!_pdfQueue) return false;
  try {
    await _pdfQueue.add("generate", payload);
    return true;
  } catch (err) {
    logger.error("Enqueue PDF erreur", { error: err.message });
    return false;
  }
}

export async function enqueueNotification(payload) {
  if (!_notifQueue) return false;
  try {
    await _notifQueue.add("send", payload);
    return true;
  } catch (err) {
    logger.error("Enqueue notification erreur", { error: err.message });
    return false;
  }
}
