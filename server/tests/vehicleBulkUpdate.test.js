import { describe, it, expect } from "vitest";
import { bulkUpdateVehicles } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// La sélection multiple ne permettait jusqu'ici QUE la suppression
// (bulkDeleteVehicles) — aucun ajustement de prix ni pause de disponibilité
// en masse. Manque réel trouvé en audit.
describe("vehicleController.bulkUpdateVehicles", () => {
  it("refuse sans identifiants", async () => {
    const owner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: owner, body: { priceAdjustPercent: 10 } });
    await bulkUpdateVehicles(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse sans action fournie", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const { req, res } = mockReqRes({ user: owner, body: { ids: [vehicle._id.toString()] } });
    await bulkUpdateVehicles(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("ajuste le prix de plusieurs véhicules (+10%)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const v1 = await createVehicleDoc({ owner: owner._id, pricePerDay: 10000 });
    const v2 = await createVehicleDoc({ owner: owner._id, pricePerDay: 20000 });

    const { req, res } = mockReqRes({
      user: owner, body: { ids: [v1._id.toString(), v2._id.toString()], priceAdjustPercent: 10 },
    });
    await bulkUpdateVehicles(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.updatedCount).toBe(2);

    expect((await Vehicle.findById(v1._id)).pricePerDay).toBe(11000);
    expect((await Vehicle.findById(v2._id)).pricePerDay).toBe(22000);
  });

  it("ne modifie que les véhicules du partenaire connecté, même si d'autres IDs sont fournis", async () => {
    const owner   = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const mine    = await createVehicleDoc({ owner: owner._id, pricePerDay: 10000 });
    const notMine = await createVehicleDoc({ owner: stranger._id, pricePerDay: 10000 });

    const { req, res } = mockReqRes({
      user: owner, body: { ids: [mine._id.toString(), notMine._id.toString()], priceAdjustPercent: 20 },
    });
    await bulkUpdateVehicles(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.updatedCount).toBe(1);
    expect((await Vehicle.findById(notMine._id)).pricePerDay).toBe(10000);
  });

  it("met en pause manuelle plusieurs véhicules (available forcé à false)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const v1 = await createVehicleDoc({ owner: owner._id });
    const v2 = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({
      user: owner, body: { ids: [v1._id.toString(), v2._id.toString()], manuallyPaused: true },
    });
    await bulkUpdateVehicles(req, res);
    expect(res.statusCode).toBe(200);

    const saved1 = await Vehicle.findById(v1._id);
    expect(saved1.manuallyPaused).toBe(true);
    expect(saved1.available).toBe(false);
  });

  it("reprend la disponibilité après une pause manuelle", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    vehicle.manuallyPaused = true;
    vehicle.available = false;
    await vehicle.save();

    const { req, res } = mockReqRes({ user: owner, body: { ids: [vehicle._id.toString()], manuallyPaused: false } });
    await bulkUpdateVehicles(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Vehicle.findById(vehicle._id);
    expect(saved.manuallyPaused).toBe(false);
    expect(saved.available).toBe(true);
  });
});
