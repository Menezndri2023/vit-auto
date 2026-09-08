import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import logger from "../utils/logger.js";
import { failOpen, makeRateLimitStore } from "../utils/rateLimitStore.js";

// Panne d'authentification évitée (audit 2026-09-08).
//
// Les limiteurs de débit ont été branchés sur Redis pour que les compteurs
// survivent aux redémarrages. Effet de bord non voulu : express-rate-limit
// enveloppe le magasin dans `handleAsyncErrors`, donc toute promesse rejetée
// part en `next(error)` — c'est-à-dire en HTTP 500. La connexion, l'inscription
// et la réinitialisation de mot de passe devenaient tributaires d'Upstash : une
// panne, une coupure réseau ou un dépassement de quota (déjà vécu sur ce
// projet) coupait l'authentification pour TOUS les utilisateurs.
//
// Arbitrage retenu et verrouillé ici : en cas de défaillance du magasin, la
// requête PASSE (échec en ouvert) et l'incident est journalisé. Le compte reste
// protégé par le verrouillage progressif, dont les compteurs vivent en base
// MongoDB et ne dépendent pas de Redis (voir loginLockoutScoping.test.js).

const PANNE = "READONLY quota Upstash dépassé";

// Magasin conforme à l'interface d'express-rate-limit, mais entièrement en panne.
const magasinEnPanne = () => ({
  init: () => {},
  increment: async () => { throw new Error(PANNE); },
  decrement: async () => { throw new Error(PANNE); },
  resetKey:  async () => { throw new Error(PANNE); },
  resetAll:  async () => { throw new Error(PANNE); },
  get:       async () => { throw new Error(PANNE); },
});

function appAvec(store) {
  const app = express();
  app.use("/login", rateLimit({ windowMs: 60_000, limit: 5, store }));
  app.post("/login", (_req, res) => res.json({ ok: true }));
  // Reproduit le gestionnaire d'erreurs d'Express : c'est lui qui transformait
  // l'erreur du magasin en 500.
  // Les 4 paramètres sont obligatoires : Express reconnaît un gestionnaire
  // d'erreurs à `fn.length === 4`, même si le dernier n'est pas utilisé.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));
  return app;
}

describe("Limitation de débit — défaillance du magasin Redis", () => {
  beforeEach(() => { vi.spyOn(logger, "error").mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it("SANS l'enveloppe, un magasin en panne coupe la connexion (500)", async () => {
    // Démontre le danger : c'est le comportement natif d'express-rate-limit,
    // et donc ce qui se serait produit en production lors d'un incident Redis.
    const res = await request(appAvec(magasinEnPanne())).post("/login");
    expect(res.status).toBe(500);
    expect(res.body.message).toContain("Upstash");
  });

  it("AVEC l'enveloppe de production, la requête passe malgré la panne", async () => {
    const store = failOpen(magasinEnPanne(), "test");
    const res = await request(appAvec(store)).post("/login");
    expect(res.status, "une panne Redis ne doit jamais bloquer l'authentification").toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("l'incident est journalisé — un échec en ouvert ne doit jamais être silencieux", async () => {
    const store = failOpen(magasinEnPanne(), "mon-prefixe");
    await request(appAvec(store)).post("/login");

    expect(logger.error).toHaveBeenCalled();
    const [message, meta] = logger.error.mock.calls[0];
    expect(message).toContain("Redis");
    expect(meta.prefix).toBe("mon-prefixe");
    expect(meta.operation).toBe("increment");
  });

  it("`increment` renvoie un compteur qui n'atteint jamais le plafond", async () => {
    // Contrat attendu par express-rate-limit : sans `totalHits`, le middleware
    // planterait au lieu de laisser passer.
    const store = failOpen(magasinEnPanne(), "test");
    const resultat = await store.increment("une-cle");
    expect(resultat).toEqual({ totalHits: 1, resetTime: undefined });
  });

  it("les autres opérations ne rejettent plus", async () => {
    const store = failOpen(magasinEnPanne(), "test");
    await expect(store.decrement("k")).resolves.toBeUndefined();
    await expect(store.resetKey("k")).resolves.toBeUndefined();
    await expect(store.resetAll()).resolves.toBeUndefined();
    await expect(store.get("k")).resolves.toBeUndefined();
  });

  it("sans REDIS_URL, le repli mémoire d'express-rate-limit reste en place", async () => {
    // Comportement historique conservé : pas de Redis configuré ⇒ `undefined`,
    // et express-rate-limit utilise son MemoryStore.
    expect(makeRateLimitStore("test")).toBeUndefined();
  });
});
