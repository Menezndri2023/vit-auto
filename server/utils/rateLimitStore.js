import RedisStore from "rate-limit-redis";
import logger from "./logger.js";
import { getRedisClient } from "../config/redis.js";

// ═══════════════════════════════════════════════════════════════════════════
// MAGASIN PARTAGÉ POUR LA LIMITATION DE DÉBIT
// ═══════════════════════════════════════════════════════════════════════════
// Tous les limiteurs du projet (anti-force brute sur la connexion, sur la
// réinitialisation de mot de passe, sur les codes à usage unique…) utilisaient
// le magasin PAR DÉFAUT d'express-rate-limit : un simple objet en mémoire,
// propre à chaque processus. Deux conséquences réelles (audit sécurité 2026-09) :
//
//   • Les compteurs sont REMIS À ZÉRO à chaque redémarrage. Sur une offre
//     d'hébergement qui met le service en veille après inactivité, un attaquant
//     provoque lui-même la remise à zéro : il épuise ses 10 tentatives, laisse
//     l'instance s'endormir, et repart de zéro. La protection anti-force brute
//     de 15 minutes ne tient jamais. Idem à chaque déploiement.
//
//   • Toute montée à deux instances multiplie mécaniquement chaque quota par
//     deux, chaque processus comptant dans son coin.
//
// Redis est déjà connecté au démarrage pour d'autres usages ; on s'en sert.
// REPLI : sans Redis, on revient au magasin mémoire — une limitation imparfaite
// vaut mieux qu'une API qui refuse de démarrer.

export function makeRateLimitStore(prefix) {
  const client = getRedisClient();
  if (!client) return undefined; // express-rate-limit retombe sur MemoryStore

  try {
    return new RedisStore({
      // ioredis : `call` est la forme attendue par rate-limit-redis.
      sendCommand: (...args) => client.call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    logger.error("[RateLimit] Magasin Redis indisponible — repli en mémoire", { error: err.message, prefix });
    return undefined;
  }
}
