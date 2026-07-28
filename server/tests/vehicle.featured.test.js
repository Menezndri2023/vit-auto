import { describe, it, expect } from "vitest";
import { getVehicles, updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Bug réel corrigé (audit) : featured/boostLevel/sponsoredUntil étaient déjà
// référencés partout (toggleFeatured admin, ADMIN_ONLY whitelist,
// HeroSection.jsx) mais jamais déclarés sur le schéma Vehicle — en mode
// strict (défaut Mongoose), toute écriture sur un chemin non déclaré est
// silencieusement ignorée. Le bouton "Mettre en vedette" de l'admin ne
// faisait donc RIEN, malgré une réponse 200 trompeuse. Le carousel/"Véhicules
// en vedette" doivent passer OBLIGATOIREMENT par une validation admin
// explicite (featured:true) — jamais par available/récence seuls.
describe("Vehicle.featured — mise en avant obligatoirement admin", () => {
  it("l'admin peut réellement marquer une annonce comme mise en avant (persistance réelle)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved" });

    const { req, res } = mockReqRes({
      user: admin, params: { id: vehicle._id.toString() },
      body: { featured: true },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.featured).toBe(true); // bug réel : restait `undefined` avant la correction du schéma
  });

  it("un partenaire ne peut PAS se marquer lui-même en vedette (champ réservé admin)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved" });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { featured: true },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.featured).toBe(false); // ignoré — pas dans EDITABLE, seulement ADMIN_ONLY
  });

  it("GET /api/vehicles?featured=true ne renvoie QUE les annonces explicitement marquées par un admin", async () => {
    const partner = await createUser({ role: "partenaire" });
    const featuredOne = await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: true });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: false });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true }); // featured jamais touché (default false)

    const { req, res } = mockReqRes({ query: { featured: "true" } });
    await getVehicles(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.vehicles).toHaveLength(1);
    expect(res.body.vehicles[0]._id.toString()).toBe(featuredOne._id.toString());
  });

  it("sans le paramètre featured, le catalogue normal reste inchangé (toutes les annonces approuvées)", async () => {
    const partner = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: true });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: false });

    const { req, res } = mockReqRes({ query: {} });
    await getVehicles(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.vehicles).toHaveLength(2); // les annonces approuvées restent naturellement dans le catalogue
  });
});
