import { describe, it, expect } from "vitest";
import { createBooking, updateBookingStatus, validateTransaction } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

// 4 bugs réels confirmés par audit du flux essai/achat/leasing :
// 1. véhicule vendu jamais retiré de la disponibilité
// 2. booking leasing/crédit accepté même si le partenaire ne l'a jamais activé
// 3. décision financement (admin) n'empêchait jamais la progression du booking
// 4. essai acceptable sur un véhicule qui n'est pas à vendre
describe("Corrections flux essai/achat (audit)", () => {
  it("refuse un essai sur un véhicule qui n'est pas à vendre (type location)", async () => {
    const vehicle = await createVehicleDoc({ type: "location" });
    const { req, res } = mockReqRes({
      body: { type: "essai", clientInfo, vehicleId: vehicle._id.toString(), essai: { preferredDate: new Date(Date.now() + 7 * 86400000).toISOString() } },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse une demande de leasing si le véhicule n'a pas activé le leasing", async () => {
    const vehicle = await createVehicleDoc({ type: "vente", leasing: { disponible: false } });
    const { req, res } = mockReqRes({
      body: { type: "leasing", clientInfo, vehicleId: vehicle._id.toString(), leasing: { financingType: "leasing", apportInitial: 5000 } },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse une demande de crédit si le véhicule n'a pas activé le crédit", async () => {
    const vehicle = await createVehicleDoc({ type: "vente", credit: { disponible: false } });
    const { req, res } = mockReqRes({
      body: { type: "leasing", clientInfo, vehicleId: vehicle._id.toString(), leasing: { financingType: "credit", apportInitial: 5000 } },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("accepte une demande de leasing quand le véhicule l'a activé", async () => {
    const vehicle = await createVehicleDoc({ type: "vente", leasing: { disponible: true, apportInitial: 3000, mensualite: 400, duree: 36, tauxInteret: 8 } });
    const { req, res } = mockReqRes({
      body: { type: "leasing", clientInfo, vehicleId: vehicle._id.toString(), leasing: { financingType: "leasing", apportInitial: 5000 } },
    });
    await createBooking(req, res);
    expect(res.statusCode).not.toBe(400);
  });

  it("bloque la progression d'un booking leasing tant que le financement n'est pas accepté", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id, type: "vente", leasing: { disponible: true } });
    const booking = await Booking.create({
      type: "leasing", status: "pending", vehicle: vehicle._id,
      clientInfo, leasing: { financingType: "leasing", decision: "en_etude" },
    });

    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { status: "confirmed" } });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("autorise la progression une fois le financement accepté", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id, type: "vente", leasing: { disponible: true } });
    const booking = await Booking.create({
      type: "leasing", status: "pending", vehicle: vehicle._id,
      clientInfo, leasing: { financingType: "leasing", decision: "accepte" },
    });

    const { req, res } = mockReqRes({ user: owner, params: { id: booking._id.toString() }, body: { status: "confirmed" } });
    await updateBookingStatus(req, res);
    expect(res.statusCode).not.toBe(409);
  });

  it("retire un véhicule vendu (type vente) de la disponibilité après validation", async () => {
    const client = await createUser();
    const vehicle = await createVehicleDoc({ type: "vente", available: true });
    const booking = await Booking.create({
      type: "essai", status: "waiting_client_validation", client: client._id,
      clientInfo, vehicle: vehicle._id,
    });

    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { action: "validate" } });
    await validateTransaction(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Vehicle.findById(vehicle._id);
    expect(saved.status).toBe("sold");
    expect(saved.available).toBe(false);
  });

  it("ne marque pas comme vendu un véhicule de type location (essai réservé au type vente)", async () => {
    // Ce cas ne peut normalement plus se produire (createBooking bloque
    // désormais l'essai sur un véhicule non "vente"), mais on vérifie que le
    // garde-fou de markVehicleSoldIfApplicable est bien redondant/sûr si un
    // booking existant (créé avant ce correctif) devait quand même être validé.
    const client = await createUser();
    const vehicle = await createVehicleDoc({ type: "location", available: true });
    const booking = await Booking.create({
      type: "essai", status: "waiting_client_validation", client: client._id,
      clientInfo, vehicle: vehicle._id,
    });

    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { action: "validate" } });
    await validateTransaction(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Vehicle.findById(vehicle._id);
    expect(saved.status).not.toBe("sold");
  });
});
