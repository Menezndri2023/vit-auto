import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { register } from "../controllers/authController.js";
import User from "../models/User.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Registre de Commerce exigé dès l'inscription des partenaires exerçant au nom
// d'une société. Sans lui, une entreprise entre au catalogue sans que
// l'administration puisse vérifier son existence légale.

let n = 0;
const inscrire = async (extra = {}) => {
  const { req, res } = mockReqRes({
    body: {
      firstName: "Test", lastName: "Partenaire",
      email: `p${++n}-${Date.now()}@exemple.test`,
      password: "MotDePasse123",
      role: "partenaire",
      activity: "loueur",
      birthDate: "1990-01-01",
      ...extra,
    },
  });
  await register(req, res);
  return res;
};

describe("Inscription partenaire — Registre de Commerce", () => {
  it("refuse une entreprise sans numéro de RC", async () => {
    const res = await inscrire({ entityType: "entreprise" });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Registre de Commerce/i);
  });

  it("refuse aussi un professionnel et un concessionnaire sans RC", async () => {
    for (const entityType of ["professionnel", "concessionnaire"]) {
      const res = await inscrire({ entityType });
      expect(res.statusCode, `${entityType} doit être refusé`).toBe(400);
    }
  });

  it("enregistre le numéro de RC sur le compte, côté administration", async () => {
    const res = await inscrire({ entityType: "entreprise", rccm: "CI-ABJ-2020-B-00123" });
    expect(res.statusCode).not.toBe(400);
    const cree = await User.findOne({ email: res.body?.user?.email || /./ }).sort({ createdAt: -1 }).lean();
    expect(cree.business?.rccm).toBe("CI-ABJ-2020-B-00123");
  });

  it("n'exige rien d'un particulier — il n'a pas de registre de commerce", async () => {
    // Garde-fou : l'exigence ne doit pas déborder sur les particuliers, qui
    // seraient alors bloqués par un document qui n'existe pas pour eux.
    const res = await inscrire({ entityType: "particulier" });
    expect(res.statusCode).not.toBe(400);
  });

  it("refuse un numéro manifestement invalide", async () => {
    const res = await inscrire({ entityType: "entreprise", rccm: "x" });
    expect(res.statusCode).toBe(400);
  });
});

// Les cas ci-dessus appellent le contrôleur DIRECTEMENT : ils ne voient donc
// pas le schéma de validation de la route, qui supprime silencieusement toute
// clé non déclarée. C'est précisément ce qui s'est produit — `rccm` n'atteignait
// pas le contrôleur, et la fonctionnalité était inerte alors que ces tests
// passaient. Ce bloc traverse la vraie route HTTP.
describe("Registre de Commerce — bout en bout via la route HTTP", () => {
  let app, User;
  beforeAll(async () => {
    ({ default: app } = await import("../server.js"));
    ({ default: User } = await import("../models/User.js"));
  });

  const charge = (extra = {}) => ({
    firstName: "Jean", lastName: "Partenaire",
    email: `rc.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
    password: "password123", birthDate: "1990-01-01",
    role: "partenaire", activity: "loueur",
    ...extra,
  });

  it("le numéro traverse la validation de route et atterrit en base", async () => {
    const res = await request(app).post("/api/auth/register")
      .send(charge({ entityType: "entreprise", rccm: "CI-ABJ-2021-B-04242" }));

    expect(res.status).toBe(201);
    const cree = await User.findOne({ email: res.body.user.email }).lean();
    expect(cree.business?.rccm).toBe("CI-ABJ-2021-B-04242");
  });

  it("une entreprise sans RC est refusée par la route", async () => {
    const res = await request(app).post("/api/auth/register")
      .send(charge({ entityType: "entreprise" }));

    expect(res.status).toBe(400);
  });
});
