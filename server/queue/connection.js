/**
 * VIT AUTO — BullMQ Redis Connection Singleton
 *
 * Une seule connexion dédiée à BullMQ (maxRetriesPerRequest: null obligatoire).
 * Les Queues et Workers la partagent via initQueueConnection().
 */
import logger from "../utils/logger.js";

let _conn = null;

export async function initQueueConnection() {
  if (_conn) return _conn;
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("[Queue] REDIS_URL absent — toutes les queues en mode synchrone (fallback inline)");
    return null;
  }
  try {
    const { default: IORedis } = await import("ioredis");
    _conn = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      lazyConnect:          false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    _conn.on("connect",  () => logger.info("[Queue] Redis connecté"));
    _conn.on("error",    (e) => logger.warn("[Queue] Redis erreur", { error: e.message }));
    _conn.on("close",    () => logger.warn("[Queue] Redis connexion fermée"));
    return _conn;
  } catch (err) {
    logger.error("[Queue] Impossible de créer la connexion Redis", { error: err.message });
    return null;
  }
}

export function isQueueConnected() {
  return _conn?.status === "ready" || _conn?.status === "connect";
}

export async function closeQueueConnection() {
  if (_conn) { await _conn.quit().catch(() => {}); _conn = null; }
}
