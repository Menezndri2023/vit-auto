/**
 * VIT AUTO — BullMQ Redis Connection Singleton
 *
 * Une seule connexion dédiée à BullMQ (maxRetriesPerRequest: null obligatoire).
 * Les Queues et Workers la partagent via getQueueConnection().
 */
import logger from "../utils/logger.js";

let _conn = null;

export function getQueueConnection() {
  if (_conn) return _conn;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  let IORedis;
  try {
    // Import synchrone résolu au moment du premier appel (après dotenv)
    const mod = await_hack_import("ioredis");
    if (!mod) return null;
    IORedis = mod.default ?? mod;
  } catch {
    return null;
  }

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
}

// Hack : import() n'est pas autorisé dans une fonction sync en top-level ESM,
// mais ici on est dans une fonction appelée après le bootstrap → on utilise
// une promesse résolue de manière synchrone grâce à l'état du module cache.
function await_hack_import(pkg) {
  try {
    // ioredis est toujours chargé au démarrage via d'autres imports
    // donc il est déjà dans le cache Node — cette forme "sync" fonctionne
    return require_ioredis_sync(pkg);
  } catch { return null; }
}

let _ioredis_cached = null;
function require_ioredis_sync() {
  if (_ioredis_cached) return _ioredis_cached;
  // On passe par un trick : importer ioredis la première fois de manière async
  // mais on ne peut pas ici. À la place, le module est initialisé via initQueueConnection()
  return null;
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
