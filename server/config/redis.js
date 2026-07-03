import { Redis } from "ioredis";
import logger from "../utils/logger.js";

let _client = null;
let _available = false;

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("Redis: REDIS_URL absent — cache désactivé, queues en mode synchrone");
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: null,   // requis par BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on("connect", () => {
    _available = true;
    logger.info("Redis connecté");
  });

  client.on("error", (err) => {
    _available = false;
    logger.warn("Redis erreur", { error: err.message });
  });

  client.on("close", () => {
    _available = false;
  });

  client.connect().catch((err) => {
    logger.warn("Redis connexion échouée — mode dégradé", { error: err.message });
  });

  return client;
}

export function getRedisClient() {
  if (!_client) _client = createRedisClient();
  return _client;
}

export function isRedisAvailable() {
  return _available;
}

// Connexion dédiée pour BullMQ (doit avoir maxRetriesPerRequest: null)
export function createBullMQConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
