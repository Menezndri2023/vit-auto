import { describe, it, expect } from "vitest";
import { addMaintenanceLog, getMaintenanceLogs, deleteMaintenanceLog } from "../controllers/vehicleController.js";
import VehicleMaintenanceLog from "../models/VehicleMaintenanceLog.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Aucune trace n'existait jusqu'ici de l'entretien/des dommages d'un véhicule
// (Vehicle n'a qu'un simple kilometrage) — manque réel trouvé en audit.
describe("vehicleController — journal d'entretien/incident/dommage", () => {
  it("refuse l'ajout par un tiers non propriétaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ user: stranger, params: { id: vehicle._id.toString() }, body: { type: "entretien", description: "Vidange" } });
    await addMaintenanceLog(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse un type invalide", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ user: owner, params: { id: vehicle._id.toString() }, body: { type: "autre", description: "x" } });
    await addMaintenanceLog(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse une entrée sans description", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ user: owner, params: { id: vehicle._id.toString() }, body: { type: "incident" } });
    await addMaintenanceLog(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("ajoute une entrée puis la liste au propriétaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const add = mockReqRes({
      user: owner, params: { id: vehicle._id.toString() },
      body: { type: "dommage", description: "Pare-choc rayé", cost: 15000, kilometrage: 42000 },
    });
    await addMaintenanceLog(add.req, add.res);
    expect(add.res.statusCode).toBe(201);
    expect(add.res.body.log.type).toBe("dommage");

    const list = mockReqRes({ user: owner, params: { id: vehicle._id.toString() } });
    await getMaintenanceLogs(list.req, list.res);
    expect(list.res.body.logs).toHaveLength(1);
  });

  it("refuse la consultation par un tiers", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ user: stranger, params: { id: vehicle._id.toString() } });
    await getMaintenanceLogs(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("permet au propriétaire de supprimer une entrée", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const log = await VehicleMaintenanceLog.create({
      vehicle: vehicle._id, owner: owner._id, type: "entretien", description: "Vidange", createdBy: owner._id,
    });

    const { req, res } = mockReqRes({ user: owner, params: { logId: log._id.toString() } });
    await deleteMaintenanceLog(req, res);
    expect(res.statusCode).toBe(200);
    expect(await VehicleMaintenanceLog.findById(log._id)).toBeNull();
  });
});
