import { describe, it, expect } from "vitest";
import * as pb from "../controllers/partnerBusinessController.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Vehicle from "../models/Vehicle.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const minimalBusiness = (overrides = {}) => ({
  companyName: "Transport Elite SARL",
  country: "CI",
  ville: "Abidjan",
  ...overrides,
});

describe("partnerBusinessController", () => {
  it("refuse un rôle client sur toutes les routes", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: minimalBusiness() });

    await pb.createBusiness(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("rejette une création sans nom/pays/ville", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { companyName: "" } });

    await pb.createBusiness(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("crée une entreprise et la marque par défaut automatiquement (première du compte)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: minimalBusiness() });

    await pb.createBusiness(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.business.isDefault).toBe(true);
  });

  it("ne marque par défaut que la dernière entreprise créée avec isDefault:true", async () => {
    const partner = await createUser({ role: "partenaire" });
    const first = await PartnerBusiness.create({ owner: partner._id, ...minimalBusiness(), isDefault: true });

    const { req, res } = mockReqRes({
      user: partner,
      body: minimalBusiness({ companyName: "Alpha Motors", ville: "Dakar", country: "SN", isDefault: true }),
    });
    await pb.createBusiness(req, res);

    expect(res.body.business.isDefault).toBe(true);
    const refreshedFirst = await PartnerBusiness.findById(first._id);
    expect(refreshedFirst.isDefault).toBe(false);
  });

  it("isole les entreprises par propriétaire (list/update/delete)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const business = await PartnerBusiness.create({ owner: owner._id, ...minimalBusiness() });

    const { req: listReq, res: listRes } = mockReqRes({ user: stranger });
    await pb.listBusinesses(listReq, listRes);
    expect(listRes.body.businesses).toHaveLength(0);

    const { req: updReq, res: updRes } = mockReqRes({
      user: stranger, params: { id: business._id.toString() }, body: { companyName: "Volé" },
    });
    await pb.updateBusiness(updReq, updRes);
    expect(updRes.status).toHaveBeenCalledWith(404);

    const { req: delReq, res: delRes } = mockReqRes({ user: stranger, params: { id: business._id.toString() } });
    await pb.deleteBusiness(delReq, delRes);
    expect(delRes.status).toHaveBeenCalledWith(404);
  });

  it("détache les véhicules (business=null) au lieu de bloquer la suppression", async () => {
    const owner = await createUser({ role: "partenaire" });
    const business = await PartnerBusiness.create({ owner: owner._id, ...minimalBusiness() });
    const vehicle = await Vehicle.create({
      title: "Toyota Corolla 2020", type: "vente", owner: owner._id, business: business._id,
    });

    const { req, res } = mockReqRes({ user: owner, params: { id: business._id.toString() } });
    await pb.deleteBusiness(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(404);
    const refreshed = await Vehicle.findById(vehicle._id);
    expect(refreshed.business).toBeNull();
  });

  it("promeut une autre entreprise par défaut après suppression de celle par défaut", async () => {
    const owner = await createUser({ role: "partenaire" });
    const first = await PartnerBusiness.create({ owner: owner._id, ...minimalBusiness(), isDefault: true });
    const second = await PartnerBusiness.create({
      owner: owner._id, ...minimalBusiness({ companyName: "Alpha Motors" }), isDefault: false,
    });

    const { req, res } = mockReqRes({ user: owner, params: { id: first._id.toString() } });
    await pb.deleteBusiness(req, res);

    const refreshedSecond = await PartnerBusiness.findById(second._id);
    expect(refreshedSecond.isDefault).toBe(true);
    expect(res.body.message).toBeTruthy();
  });
});
