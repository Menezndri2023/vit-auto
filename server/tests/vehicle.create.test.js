import { describe, it, expect } from "vitest";
import { createVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Ce controller porte la logique d'accès la plus sensible du catalogue : qui a
// le droit de publier, sous quelle condition de vérification. Ces tests
// couvrent les portes d'accès (KYC/certification), pas le scoring de
// qualité d'annonce (vehicleScoring.js, hors périmètre ici) — un corps minimal
// { title, type } suffit à passer la validation Mongoose et exercer ces portes.
const minimalVehicle = (overrides = {}) => ({ title: "Toyota Corolla 2020", type: "vente", ...overrides });

describe("vehicleController.createVehicle — contrôle d'accès à la publication", () => {
  it("refuse un rôle client", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: minimalVehicle() });

    await createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("autorise un Founding Partner à publier sans KYC ni certification", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, sellerType: "particulier" });
    const { req, res } = mockReqRes({ user: founder, body: minimalVehicle() });

    await createVehicle(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.vehicle).toBeTruthy();
    const saved = await Vehicle.findById(res.body.vehicle._id);
    expect(saved.owner.toString()).toBe(founder._id.toString());
  });

  it("bloque un particulier non-fondateur sans KYC vérifié (KYC_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "EN_ATTENTE" });
    const { req, res } = mockReqRes({ user: seller, body: minimalVehicle() });

    await createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("KYC_REQUIRED");
  });

  it("laisse publier un particulier non-fondateur avec KYC vérifié", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "VERIFIE" });
    const { req, res } = mockReqRes({ user: seller, body: minimalVehicle() });

    await createVehicle(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.vehicle).toBeTruthy();
  });

  it("bloque un professionnel/entreprise sans badge de certification (CERTIFICATION_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "professionnel", certificationBadge: "none" });
    const { req, res } = mockReqRes({ user: seller, body: minimalVehicle() });

    await createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("CERTIFICATION_REQUIRED");
  });

  it("n'impose aucun plafond au nombre d'annonces actives pour un particulier vérifié", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "VERIFIE" });
    for (let i = 0; i < 5; i++) {
      await Vehicle.create({ ...minimalVehicle({ title: `Véhicule ${i}` }), owner: seller._id, status: "approved" });
    }

    const { req, res } = mockReqRes({ user: seller, body: minimalVehicle({ title: "Véhicule supplémentaire" }) });
    await createVehicle(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.vehicle).toBeTruthy();
  });

  it("refuse une annonce en doublon (même marque/modèle/année pour le même propriétaire)", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    await Vehicle.create({
      title: "Toyota Corolla 2020", type: "vente", owner: founder._id,
      marque: "Toyota", modele: "Corolla", annee: 2020, status: "approved",
    });

    const { req, res } = mockReqRes({
      user: founder,
      body: { title: "Toyota Corolla 2020 bis", type: "vente", marque: "Toyota", modele: "Corolla", annee: 2020 },
    });
    await createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("hérite du pays de l'entreprise choisie (businessId) plutôt que du compte", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, country: "CI" });
    const business = await PartnerBusiness.create({
      owner: founder._id, companyName: "Alpha Motors", country: "SN", ville: "Dakar",
    });

    const { req, res } = mockReqRes({ user: founder, body: minimalVehicle({ businessId: business._id.toString() }) });
    await createVehicle(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const saved = await Vehicle.findById(res.body.vehicle._id);
    expect(saved.country).toBe("SN");
    expect(saved.business.toString()).toBe(business._id.toString());
  });

  it("refuse un businessId qui n'appartient pas au partenaire", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const stranger = await createUser({ role: "partenaire", isFounder: true });
    const business = await PartnerBusiness.create({
      owner: stranger._id, companyName: "Alpha Motors", country: "SN", ville: "Dakar",
    });

    const { req, res } = mockReqRes({ user: founder, body: minimalVehicle({ businessId: business._id.toString() }) });
    await createVehicle(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
