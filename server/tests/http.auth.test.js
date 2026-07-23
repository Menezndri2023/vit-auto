import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// server.js n'exporte `app` correctement (et ne démarre pas Mongo/queues/HTTP)
// que depuis le refactor "isMainModule" — import dynamique, après que
// tests/setup.js ait positionné MONGO_URI/JWT_SECRET/etc. dans son propre
// beforeAll (les hooks de setupFiles s'exécutent avant ceux du fichier de test).
let app;
beforeAll(async () => {
  ({ default: app } = await import("../server.js"));
});

const validPayload = (overrides = {}) => ({
  firstName: "Jean",
  lastName: "Testeur",
  email: `jean.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
  password: "password123",
  birthDate: "1990-01-01",
  ...overrides,
});

describe("HTTP /api/auth (via supertest, cycle complet middleware+controller)", () => {
  // Régression directe du bug trouvé en écrivant ce test : registerSchema (Zod)
  // ne déclarait pas birthDate → validate() le supprimait silencieusement de
  // req.body avant même d'atteindre le controller → 100% des inscriptions
  // échouaient avec "Date de naissance requise" (corrigé le même jour, voir
  // server/validators/auth.validators.js).
  it("crée un compte quand birthDate est fourni (régression registerSchema)", async () => {
    const res = await request(app).post("/api/auth/register").send(validPayload());

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBeTruthy();
    expect(res.body.user.password).toBeUndefined();
  });

  // Régression trouvée en testant réellement l'inscription en conditions
  // proches de la prod (session Playwright) : register() ne renvoyait jamais
  // de refreshToken, contrairement à login()/oauthGoogle(). Sans lui, le moindre
  // 401 prématuré juste après l'inscription (avant que l'utilisateur ne se
  // reconnecte manuellement) déconnectait silencieusement le compte fraîchement
  // créé — apiClient.js tentait un rafraîchissement automatique, ne trouvait
  // aucun refresh token à utiliser, et effaçait toute la session.
  it("renvoie un refreshToken à l'inscription, comme login()", async () => {
    const res = await request(app).post("/api/auth/register").send(validPayload());

    expect(res.status).toBe(201);
    expect(res.body.refreshToken).toBeTruthy();
    expect(typeof res.body.refreshToken).toBe("string");
  });

  it("refuse une inscription sans date de naissance", async () => {
    const payload = validPayload();
    delete payload.birthDate;
    const res = await request(app).post("/api/auth/register").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date de naissance/i);
  });

  it("refuse une inscription pour un mineur (< 18 ans)", async () => {
    const res = await request(app).post("/api/auth/register").send(
      validPayload({ birthDate: new Date(Date.now() - 10 * 365.25 * 24 * 3600 * 1000).toISOString() })
    );

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MINOR_NOT_ALLOWED");
  });

  it("refuse un email déjà utilisé", async () => {
    const payload = validPayload();
    const first = await request(app).post("/api/auth/register").send(payload);
    expect(first.status).toBe(201);

    const dup = await request(app).post("/api/auth/register").send(validPayload({ email: payload.email }));
    expect(dup.status).toBe(409);
  });

  it("connecte un utilisateur avec les bons identifiants puis rejette un mauvais mot de passe", async () => {
    const payload = validPayload();
    await request(app).post("/api/auth/register").send(payload);

    const ok = await request(app).post("/api/auth/login").send({ identifier: payload.email, password: payload.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.refreshToken).toBeTruthy();

    const bad = await request(app).post("/api/auth/login").send({ identifier: payload.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("GET /api/auth/me renvoie le profil avec un token valide, 401 sans token", async () => {
    const payload = validPayload();
    const reg = await request(app).post("/api/auth/register").send(payload);

    const authed = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${reg.body.token}`);
    expect(authed.status).toBe(200);
    expect(authed.body.email ?? authed.body.user?.email).toBe(payload.email);

    const anon = await request(app).get("/api/auth/me");
    expect(anon.status).toBe(401);
  });
});
