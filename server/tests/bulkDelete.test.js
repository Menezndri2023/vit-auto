import { describe, it, expect } from "vitest";
import { bulkDeleteVehicles } from "../controllers/vehicleController.js";
import { bulkDeleteDrivers } from "../controllers/driverController.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Suppression par sélection — un partenaire ne doit jamais pouvoir supprimer
// l'annonce d'un autre partenaire, même en fournissant son ID explicitement
// (l'endpoint filtre silencieusement plutôt que de renvoyer une erreur trompeuse,
// voir le commentaire dans vehicleController.bulkDeleteVehicles).
const minimalVehicle = (owner, overrides = {}) => ({
  title: "Toyota Corolla 2020", type: "vente", owner, ...overrides,
});
const minimalDriver = (owner, overrides = {}) => ({
  firstName: "Chauffeur", lastName: "Test", title: "Chauffeur pro Abidjan",
  disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans",
  profilePhoto: "https://cdn.example.test/driver-profile.jpg",
  cv: "https://cdn.example.test/driver-cv.pdf",
  owner, ...overrides,
});

describe("vehicleController.bulkDeleteVehicles", () => {
  it("refuse une liste d'identifiants vide", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { ids: [] } });
    await bulkDeleteVehicles(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("supprime plusieurs annonces appartenant au partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const v1 = await Vehicle.create(minimalVehicle(partner._id));
    const v2 = await Vehicle.create(minimalVehicle(partner._id));
    const { req, res } = mockReqRes({ user: partner, body: { ids: [v1._id.toString(), v2._id.toString()] } });

    await bulkDeleteVehicles(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.deletedCount).toBe(2);
    expect(await Vehicle.findById(v1._id)).toBeNull();
    expect(await Vehicle.findById(v2._id)).toBeNull();
  });

  it("ignore silencieusement les annonces d'un autre partenaire (pas d'erreur trompeuse)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const intruder = await createUser({ role: "partenaire" });
    const mine = await Vehicle.create(minimalVehicle(intruder._id));
    const notMine = await Vehicle.create(minimalVehicle(owner._id));
    const { req, res } = mockReqRes({ user: intruder, body: { ids: [mine._id.toString(), notMine._id.toString()] } });

    await bulkDeleteVehicles(req, res);

    expect(res.body.deletedCount).toBe(1);
    expect(res.body.deletedIds).toEqual([mine._id.toString()]);
    expect(await Vehicle.findById(mine._id)).toBeNull();
    expect(await Vehicle.findById(notMine._id)).not.toBeNull(); // jamais supprimée
  });

  it("un admin peut supprimer les annonces de n'importe quel partenaire", async () => {
    const admin = await createUser({ role: "admin" });
    const partner = await createUser({ role: "partenaire" });
    const v = await Vehicle.create(minimalVehicle(partner._id));
    const { req, res } = mockReqRes({ user: admin, body: { ids: [v._id.toString()] } });

    await bulkDeleteVehicles(req, res);

    expect(res.body.deletedCount).toBe(1);
    expect(await Vehicle.findById(v._id)).toBeNull();
  });
});

describe("driverController.bulkDeleteDrivers", () => {
  it("supprime plusieurs profils appartenant au partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const d1 = await Driver.create(minimalDriver(partner._id));
    const d2 = await Driver.create(minimalDriver(partner._id));
    const { req, res } = mockReqRes({ user: partner, body: { ids: [d1._id.toString(), d2._id.toString()] } });

    await bulkDeleteDrivers(req, res);

    expect(res.body.deletedCount).toBe(2);
    expect(await Driver.findById(d1._id)).toBeNull();
    expect(await Driver.findById(d2._id)).toBeNull();
  });

  it("ignore silencieusement les profils d'un autre partenaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const intruder = await createUser({ role: "partenaire" });
    const notMine = await Driver.create(minimalDriver(owner._id));
    const { req, res } = mockReqRes({ user: intruder, body: { ids: [notMine._id.toString()] } });

    await bulkDeleteDrivers(req, res);

    expect(res.status).toHaveBeenCalledWith(404); // aucun profil accessible trouvé
    expect(await Driver.findById(notMine._id)).not.toBeNull();
  });
});
