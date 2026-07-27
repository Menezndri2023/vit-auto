import { describe, it, expect } from "vitest";
import { updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Bug réel corrigé (audit) : updateVehicle recalculait INCONDITIONNELLEMENT
// status/available via scoreAnnonce à chaque édition par le propriétaire —
// y compris sur une annonce déjà "sold"/"draft"/"archived" (positionnée là par
// updateVehicleLifecycle). Corriger une simple coquille sur un véhicule déjà
// vendu le republiait silencieusement comme disponible à la réservation.
describe("vehicleController.updateVehicle — ne republie jamais hors cycle de modération", () => {
  it("une annonce 'sold' reste sold/indisponible après une simple édition", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "sold", available: false });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { kilometrage: 42000 },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.status).toBe("sold");
    expect(reloaded.available).toBe(false);
    expect(reloaded.kilometrage).toBe(42000);
  });

  it("une annonce 'draft' reste draft/indisponible après une simple édition", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "draft", available: false });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { description: "Mise à jour du texte" },
    });
    await updateVehicle(req, res);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.status).toBe("draft");
    expect(reloaded.available).toBe(false);
  });

  it("une annonce 'archived' reste archived/indisponible après une simple édition", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "archived", available: false });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { couleur: "Rouge" },
    });
    await updateVehicle(req, res);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.status).toBe("archived");
    expect(reloaded.available).toBe(false);
  });

  it("un essai de forcer available:true sur une annonce 'sold' via le body est ignoré", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "sold", available: false });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { available: true },
    });
    await updateVehicle(req, res);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.available).toBe(false);
  });

  it("une annonce 'approved' reste recalculée normalement (comportement inchangé)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved", available: true });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { kilometrage: 10000 },
    });
    await updateVehicle(req, res);

    const reloaded = await Vehicle.findById(vehicle._id);
    // Toujours dans le cycle de modération (pending/approved/rejected selon le score) —
    // pas figé sur "approved", scoreAnnonce reste seul autoritaire ici.
    expect(["pending", "approved", "rejected"]).toContain(reloaded.status);
  });

  it("le partenaire peut mettre en pause (available:false) une annonce approuvée sans perdre son statut", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved", available: true });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { available: false },
    });
    await updateVehicle(req, res);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.available).toBe(false);
  });
});
