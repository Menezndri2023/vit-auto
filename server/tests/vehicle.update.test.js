import { describe, it, expect } from "vitest";
import { updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import ExchangeRate from "../models/ExchangeRate.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Bug réel corrigé (audit) : une édition ADMIN ne recalculait JAMAIS
// validationScore/Errors/Warnings (seul le partenaire déclenchait ce
// recalcul, et seulement dans le cycle de modération) — un admin corrigeant
// le téléphone/prix/ville signalés manquants par la Prévisualisation voyait
// ces mêmes erreurs rester affichées indéfiniment, comme si sa modification
// n'avait pas été prise en compte, alors que les champs étaient bien
// enregistrés en base.
describe("vehicleController.updateVehicle — recalcule toujours les indicateurs de validation", () => {
  it("une édition ADMIN corrigeant téléphone/ville/prix fait disparaître les erreurs correspondantes", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const vehicle = await createVehicleDoc({
      owner: partner._id, status: "pending",
      contactTel: "", ville: "", pricePerDay: 0,
      validationErrors: [
        "Numéro de téléphone manquant ou invalide",
        "Ville de publication manquante",
        "Prix manquant ou invalide (minimum 1 USD)",
      ],
    });

    const { req, res } = mockReqRes({
      user: admin, params: { id: vehicle._id.toString() },
      body: { contactTel: "+225 07 00 00 00 01", ville: "Casablanca", pricePerDay: 35.29 },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.contactTel).toBe("+225 07 00 00 00 01");
    expect(reloaded.ville).toBe("Casablanca");
    expect(reloaded.pricePerDay).toBe(35.29);
    expect(reloaded.validationErrors).not.toContain("Numéro de téléphone manquant ou invalide");
    expect(reloaded.validationErrors).not.toContain("Ville de publication manquante");
    expect(reloaded.validationErrors).not.toContain("Prix manquant ou invalide (minimum 1 USD)");
  });

  it("une édition ADMIN ne change jamais le statut/la disponibilité implicitement", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "rejected", available: false });

    const { req, res } = mockReqRes({
      user: admin, params: { id: vehicle._id.toString() },
      body: { contactTel: "+225 07 00 00 00 01", ville: "Abidjan" },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.status).toBe("rejected"); // inchangé — seul un bouton dédié approuve/rejette
  });

  it("l'admin garde la main sur available (pause/réactivation manuelle)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved", available: true });

    const { req, res } = mockReqRes({
      user: admin, params: { id: vehicle._id.toString() },
      body: { available: false },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.available).toBe(false);
  });
});

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

// Le partenaire/admin peut choisir de FIGER l'affichage de son annonce dans
// une devise précise pour tous les visiteurs — voir même feature côté
// createVehicle (tests/vehicle.create.test.js).
describe("vehicleController.updateVehicle — devise d'affichage (Vehicle.currency)", () => {
  it("le partenaire peut fixer une devise d'affichage", async () => {
    await ExchangeRate.create({ code: "EUR", name: "Euro", symbol: "€", rateFromUSD: 0.91, active: true });
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, currency: null });

    const { req, res } = mockReqRes({ user: partner, params: { id: vehicle._id.toString() }, body: { currency: "EUR" } });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.currency).toBe("EUR");
  });

  it("l'admin peut revenir à l'automatique (currency: null)", async () => {
    await ExchangeRate.create({ code: "EUR", name: "Euro", symbol: "€", rateFromUSD: 0.91, active: true });
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const vehicle = await createVehicleDoc({ owner: partner._id, currency: "EUR" });

    const { req, res } = mockReqRes({ user: admin, params: { id: vehicle._id.toString() }, body: { currency: null } });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.currency).toBeNull();
  });

  it("refuse une devise inconnue/inactive (400)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });

    const { req, res } = mockReqRes({ user: partner, params: { id: vehicle._id.toString() }, body: { currency: "ZZZ" } });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(400);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.currency).toBeNull(); // inchangé
  });
});
