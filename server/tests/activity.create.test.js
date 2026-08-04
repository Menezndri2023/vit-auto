import { describe, it, expect } from "vitest";
import { createActivity } from "../controllers/activityController.js";
import Activity from "../models/Activity.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Même logique d'accès que vehicleController.createVehicle/driverController
// .createDriver (voir driver.create.test.js) — portes KYC/certification/
// suspension partagées. Contrairement au chauffeur, aucune pièce
// supplémentaire (identité/permis) n'est exigée ici.
const minimalActivity = (overrides = {}) => ({
  activityType: "QUAD", title: "Sortie Quad 2h dans les dunes",
  price: 50, priceUnit: "per_person",
  durationMinutes: 120, capacity: 4,
  images: ["https://cdn.example.test/quad.jpg"],
  ...overrides,
});

describe("activityController.createActivity — contrôle d'accès à la publication", () => {
  it("refuse un rôle client", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: minimalActivity() });
    await createActivity(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("autorise un Founding Partner sans KYC ni certification", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalActivity() });
    await createActivity(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.activity.status).toBe("pending");
    const saved = await Activity.findById(res.body.activity._id);
    expect(saved.owner.toString()).toBe(founder._id.toString());
  });

  it("bloque un particulier non-fondateur sans KYC vérifié (KYC_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "EN_ATTENTE" });
    const { req, res } = mockReqRes({ user: seller, body: minimalActivity() });
    await createActivity(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("KYC_REQUIRED");
  });

  it("bloque un professionnel sans badge de certification (CERTIFICATION_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "professionnel", certificationBadge: "none" });
    const { req, res } = mockReqRes({ user: seller, body: minimalActivity() });
    await createActivity(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("CERTIFICATION_REQUIRED");
  });

  it("rejette un type d'activité hors énumération", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalActivity({ activityType: "LICORNE" }) });
    await createActivity(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejette une annonce sans photo", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalActivity({ images: [] }) });
    await createActivity(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("les champs serveur (owner, status) ne sont jamais pris depuis req.body", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, country: "CI" });
    const intruderId = (await createUser())._id.toString();
    const { req, res } = mockReqRes({
      user: founder,
      body: minimalActivity({ owner: intruderId, status: "approved" }),
    });
    await createActivity(req, res);

    expect(res.body.activity.owner.toString()).toBe(founder._id.toString());
    expect(res.body.activity.status).toBe("pending");
    expect(res.body.activity.country).toBe("CI");
  });

  it("essaiDisponible désactivé par défaut si non fourni", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalActivity() });
    await createActivity(req, res);
    expect(res.body.activity.essaiDisponible).toBe(false);
  });
});
