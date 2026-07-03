import { Queue } from "bullmq";
import logger from "../../../utils/logger.js";

const QUEUE_NAMES = {
  email:    "comm:email",
  sms:      "comm:sms",
  whatsapp: "comm:whatsapp",
  push:     "comm:push",
  internal: "comm:internal",
};

const JOB_DEFAULTS = {
  removeOnComplete: { count: 200 },
  removeOnFail:     { count: 100 },
  attempts:         3,
  backoff:          { type: "exponential", delay: 3000 },
};

const PRIORITY_MAP = { urgent: 1, high: 2, normal: 3, low: 4 };

let _queues = {};
let _ready  = false;

export async function initCommunicationQueues() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("[CommQueue] REDIS_URL absent — mode synchrone activé");
    return;
  }

  try {
    const { default: IORedis } = await import("ioredis");
    const conn = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    const options = { connection: conn };

    for (const [channel, name] of Object.entries(QUEUE_NAMES)) {
      _queues[channel] = new Queue(name, { ...options, defaultJobOptions: JOB_DEFAULTS });
    }

    _ready = true;
    logger.info("[CommQueue] Queues communication initialisées", { channels: Object.keys(QUEUE_NAMES) });
  } catch (err) {
    logger.error("[CommQueue] Erreur initialisation queues", { error: err.message });
  }
}

export function areQueuesReady() { return _ready; }

export async function enqueueMessage({ channel, priority = "normal", delay = 0, ...payload }) {
  if (!_ready || !_queues[channel]) return false;

  try {
    const opts = {
      priority: PRIORITY_MAP[priority] || 3,
      ...(delay > 0 ? { delay } : {}),
    };
    await _queues[channel].add(`${channel}-${Date.now()}`, payload, opts);
    return true;
  } catch (err) {
    logger.error("[CommQueue] Erreur enqueue", { channel, error: err.message });
    return false;
  }
}

export async function scheduleMessage({ channel, sendAt, ...payload }) {
  const delay = Math.max(0, new Date(sendAt).getTime() - Date.now());
  return enqueueMessage({ channel, delay, priority: "normal", ...payload });
}

export function getQueueStats() {
  if (!_ready) return null;
  return Promise.all(
    Object.entries(_queues).map(async ([ch, q]) => {
      const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      return [ch, counts];
    })
  ).then(Object.fromEntries);
}
