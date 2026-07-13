/**
 * VIT AUTO — BullMQ Redis Connection Singleton
 *
 * Une seule connexion dédiée à BullMQ (maxRetriesPerRequest: null obligatoire).
 * Les Queues et Workers la partagent via initQueueConnection().
 */
import logger from "../utils/logger.js";

let _conn = null;

// ── Détection de panne "dure" (ex: quota Upstash dépassé) ────────────────────
// Une erreur de connexion réseau se résorbe seule (retryStrategy d'ioredis).
// Mais un quota dépassé fait échouer CHAQUE commande alors que la connexion
// reste "ready" — ioredis ne backoff jamais dans ce cas, et les Workers BullMQ
// (qui partagent cette même connexion) re-sollicitent Redis en boucle serrée,
// inondant les logs et aggravant le dépassement de quota. On détecte ce motif
// pour permettre à queue/index.js de mettre les workers en pause le temps que
// ça se résorbe, sans jamais perdre de job (le fallback synchrone prend le relai).
const HARD_FAILURE_PATTERN = /max requests limit exceeded|max number of clients|OOM command not allowed/i;
const HARD_FAILURE_COOLDOWN_MS = 60_000;
let _hardFailureUntil = 0;

export function isConnectionHardBroken() {
  return Date.now() < _hardFailureUntil;
}

// Point d'entrée unique pour signaler une erreur Redis, quelle que soit sa
// provenance (connexion ioredis elle-même, ou erreur 'error' d'un Worker BullMQ
// pendant son polling interne — ce sont deux émetteurs distincts).
export function noteRedisError(err) {
  const message = err?.message || String(err);
  if (HARD_FAILURE_PATTERN.test(message)) {
    const wasAlreadyBroken = isConnectionHardBroken();
    _hardFailureUntil = Date.now() + HARD_FAILURE_COOLDOWN_MS;
    if (!wasAlreadyBroken) logger.warn("[Queue] Panne dure détectée — workers en pause temporaire", { error: message });
    return true;
  }
  return false;
}

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
    _conn.on("error",    (e) => {
      if (noteRedisError(e)) return;
      logger.warn("[Queue] Redis erreur", { error: e.message });
    });
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
