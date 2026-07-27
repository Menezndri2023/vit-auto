import { getRedisClient, isRedisAvailable } from "../config/redis.js";
import logger from "./logger.js";

// ── Révocation d'un token d'accès précis (déconnexion explicite) ────────────
// Le JWT d'accès (7 jours) reste valide par signature jusqu'à son expiration
// naturelle même après un changement de mot de passe/2FA — voir tokenVersion,
// middleware/auth.js. Ce mécanisme bumpe une valeur GLOBALE (toutes sessions),
// ce qui est le comportement voulu pour ces cas (sécurité prime), mais serait
// disproportionné pour une simple déconnexion volontaire d'un seul appareil
// (déconnecterait aussi les autres appareils de l'utilisateur). Pour CE cas
// précis, on révoque uniquement le jti du token présenté à la déconnexion,
// dans Redis avec un TTL borné à sa durée de vie restante — sans dépendance
// dure à Redis (dégradé si absent/indisponible, comme le reste du projet :
// voir config/redis.js, queue/connection.js).
const PREFIX = "revoked_jwt:";

export async function revokeAccessToken(jti, exp) {
  if (!jti || !isRedisAvailable()) return;
  const ttlSeconds = Math.max(1, Math.floor(exp - Date.now() / 1000));
  try {
    await getRedisClient().set(`${PREFIX}${jti}`, "1", "EX", ttlSeconds);
  } catch (err) {
    logger.warn("revokeAccessToken (non bloquant) :", err.message);
  }
}

export async function isAccessTokenRevoked(jti) {
  if (!jti || !isRedisAvailable()) return false;
  try {
    return (await getRedisClient().exists(`${PREFIX}${jti}`)) === 1;
  } catch {
    return false; // Redis en panne : on ne bloque jamais l'authentification pour ça
  }
}
