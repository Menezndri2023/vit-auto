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

// PANNE REDIS = AUTHENTIFICATION COUPÉE, si l'on n'y prend pas garde.
// express-rate-limit enveloppe le magasin dans `handleAsyncErrors` : toute
// promesse rejetée part dans `next(error)`, donc en HTTP 500. Brancher les
// limiteurs sur Redis a ainsi rendu /login, /register, /forgot-password et la
// vérification des codes à usage unique tributaires d'Upstash : une panne, une
// coupure réseau ou un DÉPASSEMENT DE QUOTA (déjà vécu sur ce projet) renvoyait
// 500 à tout le monde. On échangeait une faiblesse anti-force-brute contre une
// panne d'authentification totale — un très mauvais marché.
//
// On échoue donc en OUVERT : si Redis ne répond pas, la requête passe et
// l'incident est journalisé. La limitation de débit est une mesure
// d'atténuation, jamais un contrôle d'autorisation, et le compte reste protégé
// par le verrouillage progressif (compteurs en base MongoDB, indépendants de
// Redis) — la défense en profondeur tient pendant l'incident.
// Exportée pour être testée directement : sans REDIS_URL, `makeRateLimitStore`
// renvoie `undefined` et l'enveloppe ne serait jamais exercée par les tests.
export function failOpen(store, prefix) {
  const wrap = (name) => {
    const original = store[name];
    if (typeof original !== "function") return;
    store[name] = async (...args) => {
      try {
        return await original.apply(store, args);
      } catch (err) {
        logger.error("[RateLimit] Redis injoignable — requête laissée passer", {
          operation: name, prefix, error: err.message,
        });
        // Forme attendue par express-rate-limit pour `increment` : un compteur
        // à 1 n'atteint jamais le plafond, donc la requête n'est pas bloquée.
        return name === "increment" ? { totalHits: 1, resetTime: undefined } : undefined;
      }
    };
  };
  ["increment", "decrement", "resetKey", "resetAll", "get"].forEach(wrap);
  return store;
}

export function makeRateLimitStore(prefix) {
  const client = getRedisClient();
  if (!client) return undefined; // express-rate-limit retombe sur MemoryStore

  try {
    return failOpen(new RedisStore({
      // ioredis : `call` est la forme attendue par rate-limit-redis.
      sendCommand: (...args) => client.call(...args),
      prefix: `rl:${prefix}:`,
    }), prefix);
  } catch (err) {
    logger.error("[RateLimit] Magasin Redis indisponible — repli en mémoire", { error: err.message, prefix });
    return undefined;
  }
}
