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
  if (!jti) return;
  // Bug réel corrigé (audit) : isRedisAvailable() était vérifié AVANT tout
  // appel à getRedisClient() — qui est pourtant la seule fonction créant
  // réellement le client (voir config/redis.js, _client lazy). Comme rien
  // d'autre dans le projet n'appelle getRedisClient() sans passer par ce
  // garde-fou, le client n'était JAMAIS instancié : isRedisAvailable()
  // restait bloqué à `false` pour toujours, même avec un Redis parfaitement
  // sain (confirmé par la connexion BullMQ séparée, elle bien "ready"). La
  // révocation d'un token d'accès à la déconnexion était donc un no-op
  // silencieux permanent en production, jamais seulement en cas de vraie
  // panne Redis. getRedisClient() doit être appelé EN PREMIER pour amorcer
  // la connexion, avant de vérifier isRedisAvailable().
  const client = getRedisClient();
  if (!client || !isRedisAvailable()) return;
  const ttlSeconds = Math.max(1, Math.floor(exp - Date.now() / 1000));
  try {
    await client.set(`${PREFIX}${jti}`, "1", "EX", ttlSeconds);
  } catch (err) {
    logger.warn("revokeAccessToken (non bloquant) :", err.message);
  }
}

export async function isAccessTokenRevoked(jti) {
  if (!jti) return false;
  const client = getRedisClient(); // amorce la connexion si pas déjà fait — voir revokeAccessToken
  if (!client || !isRedisAvailable()) return false;
  try {
    return (await client.exists(`${PREFIX}${jti}`)) === 1;
  } catch {
    return false; // Redis en panne : on ne bloque jamais l'authentification pour ça
  }
}
