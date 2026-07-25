import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { resolveRequirements } from "../utils/partnerRequirements.js";

// server.js n'exporte `app` correctement qu'après que tests/setup.js ait
// positionné MONGO_URI/JWT_SECRET dans son propre beforeAll (voir http.auth.test.js).
let app, User;
beforeAll(async () => {
  ({ default: app } = await import("../server.js"));
  ({ default: User } = await import("../models/User.js"));
});

const validPayload = (overrides = {}) => ({
  firstName: "Jean",
  lastName: "Partenaire",
  email: `partner.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
  password: "password123",
  birthDate: "1990-01-01",
  ...overrides,
});

describe("POST /api/auth/register — activity/entityType", () => {
  it("crée un compte client sans exiger activity/entityType", async () => {
    const res = await request(app).post("/api/auth/register").send(validPayload({ role: "client" }));
    expect(res.status).toBe(201);
    expect(res.body.user.activity).toBe(null);
    expect(res.body.user.entityType).toBe(null);
  });

  it("refuse un partenaire sans activity ni entityType", async () => {
    const res = await request(app).post("/api/auth/register").send(validPayload({ role: "partenaire" }));
    expect(res.status).toBe(400);
  });

  it("refuse un partenaire avec activity mais sans entityType", async () => {
    const res = await request(app).post("/api/auth/register").send(
      validPayload({ role: "partenaire", activity: "loueur" })
    );
    expect(res.status).toBe(400);
  });

  it("crée un partenaire particulier loueur : activity/entityType persistés, sellerType dérivé", async () => {
    const res = await request(app).post("/api/auth/register").send(
      validPayload({ role: "partenaire", activity: "loueur", entityType: "particulier" })
    );
    expect(res.status).toBe(201);
    expect(res.body.user.activity).toBe("loueur");
    expect(res.body.user.entityType).toBe("particulier");
    expect(res.body.user.sellerType).toBe("particulier");

    const created = await User.findOne({ email: res.body.user.email });
    expect(created.partnerActivity).toBe("loueur");
  });

  it("crée un partenaire concessionnaire vendeur : sellerType dérivé à entreprise (pas de valeur directe)", async () => {
    const res = await request(app).post("/api/auth/register").send(
      validPayload({ role: "partenaire", activity: "vendeur", entityType: "concessionnaire" })
    );
    expect(res.status).toBe(201);
    expect(res.body.user.entityType).toBe("concessionnaire");
    expect(res.body.user.sellerType).toBe("entreprise");
  });

  it("rejette une activity ou un entityType hors enum (filtré par Zod avant le controller)", async () => {
    const res = await request(app).post("/api/auth/register").send(
      validPayload({ role: "partenaire", activity: "pas-une-activite", entityType: "particulier" })
    );
    expect(res.status).toBe(422);
  });

  it("accepte encore l'ancien champ sellerType seul (compat) et en dérive entityType", async () => {
    const res = await request(app).post("/api/auth/register").send(
      validPayload({ role: "partenaire", activity: "vendeur", sellerType: "professionnel" })
    );
    expect(res.status).toBe(201);
    expect(res.body.user.entityType).toBe("professionnel");
    expect(res.body.user.sellerType).toBe("professionnel");
  });
});

describe("resolveRequirements — table de redirection post-inscription", () => {
  it("particulier (loueur/vendeur/exportateur) -> /kyc seul", () => {
    for (const activity of ["loueur", "vendeur", "exportateur"]) {
      expect(resolveRequirements({ activity, entityType: "particulier" }).postRegistrationRedirect).toBe("/kyc");
    }
  });

  it("chauffeur -> /kyc?next=driver-docs quel que soit entityType", () => {
    for (const entityType of ["particulier", "professionnel", "entreprise", "concessionnaire"]) {
      expect(resolveRequirements({ activity: "chauffeur", entityType }).postRegistrationRedirect).toBe("/kyc?next=driver-docs");
    }
  });

  it("professionnel/entreprise/concessionnaire (non-chauffeur) -> /kyc?next=partner-onboarding", () => {
    for (const entityType of ["professionnel", "entreprise", "concessionnaire"]) {
      for (const activity of ["loueur", "vendeur", "exportateur"]) {
        expect(resolveRequirements({ activity, entityType }).postRegistrationRedirect).toBe("/kyc?next=partner-onboarding");
      }
    }
  });
});
