import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeRedisClient } from "./helpers/fakeRedis.js";

// config/redis.js dégrade en no-op si REDIS_URL est absente (voir tests/setup.js,
// vidée volontairement pour qu'aucun test ne touche un vrai service externe) —
// on simule donc ici un Redis "disponible" avec un faux client en mémoire pour
// exercer la vraie logique de tokenRevocation.js (calcul du TTL, clé, etc.).
let redisAvailable = true;
const fakeClient = createFakeRedisClient();
vi.mock("../config/redis.js", () => ({
  isRedisAvailable: () => redisAvailable,
  getRedisClient:   () => fakeClient,
}));

const { revokeAccessToken, isAccessTokenRevoked } = await import("../utils/tokenRevocation.js");

describe("tokenRevocation — révocation d'un access token précis à la déconnexion", () => {
  beforeEach(() => {
    redisAvailable = true;
    fakeClient.store.clear();
  });

  it("un jti jamais révoqué n'est pas considéré comme révoqué", async () => {
    expect(await isAccessTokenRevoked("jti-inconnu")).toBe(false);
  });

  it("révoque un jti puis le détecte comme révoqué", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600; // expire dans 1h
    await revokeAccessToken("jti-abc", exp);
    expect(await isAccessTokenRevoked("jti-abc")).toBe(true);
    expect(await isAccessTokenRevoked("jti-autre")).toBe(false);
  });

  it("ne fait rien (no-op silencieux) si jti est absent", async () => {
    await revokeAccessToken(null, Math.floor(Date.now() / 1000) + 3600);
    expect(fakeClient.store.size).toBe(0);
  });

  // Faille corrigée (audit) : la révocation ne doit JAMAIS bloquer
  // l'authentification si Redis est indisponible (dégradé, comme le reste du
  // projet — voir config/redis.js) — sinon une panne Redis déconnecterait
  // silencieusement tous les utilisateurs de la plateforme.
  it("se dégrade silencieusement (jamais révoqué) si Redis est indisponible", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    await revokeAccessToken("jti-xyz", exp); // Redis dispo → révoqué
    expect(await isAccessTokenRevoked("jti-xyz")).toBe(true);

    redisAvailable = false;
    expect(await isAccessTokenRevoked("jti-xyz")).toBe(false); // Redis en panne → fail open
  });
});
