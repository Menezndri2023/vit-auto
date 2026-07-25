import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

describe("bookingController.createBooking", () => {
  it("refuse une réservation sans informations client", async () => {
    const { req, res } = mockReqRes({ body: { type: "location" } });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse un nombre de jours de location invalide (<=0)", async () => {
    const vehicle = await createVehicleDoc();
    const { req, res } = mockReqRes({
      body: { type: "location", clientInfo, vehicleId: vehicle._id.toString(), location: { days: 0 } },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("crée une réservation location et calcule prix/caution côté serveur (jamais depuis le client)", async () => {
    const vehicle = await createVehicleDoc({ pricePerDay: 15000, caution: 50000 });
    const { req, res } = mockReqRes({
      body: {
        type: "location",
        clientInfo,
        vehicleId: vehicle._id.toString(),
        // Le client tente d'envoyer un prix et une caution truqués — doivent être ignorés.
        location: { days: 3, startDate: "2027-01-10", endDate: "2027-01-13", pricePerDay: 1, options: {} },
      },
    });
    await createBooking(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.body.booking.montantBase).toBe(15000 * 3);
    expect(res.body.booking.cautionAmount).toBe(50000);
  });

  it("refuse une réservation sur un véhicule déjà réservé sur les mêmes dates (transaction anti-double-booking)", async () => {
    const vehicle = await createVehicleDoc();
    const first = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-02-01", endDate: "2027-02-03" },
      },
    });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);

    // Chevauchement partiel avec la réservation existante (01-03 fev)
    const second = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-02-02", endDate: "2027-02-04" },
      },
    });
    await createBooking(second.req, second.res);
    expect(second.res.status).toHaveBeenCalledWith(409);

    const count = await Booking.countDocuments({ vehicle: vehicle._id });
    expect(count).toBe(1);
  });

  it("autorise deux réservations sur le même véhicule si les dates ne se chevauchent pas", async () => {
    const vehicle = await createVehicleDoc();
    const first = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-03-01", endDate: "2027-03-03" },
      },
    });
    await createBooking(first.req, first.res);

    const second = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-03-03", endDate: "2027-03-05" },
      },
    });
    await createBooking(second.req, second.res);
    expect(second.res.status).not.toHaveBeenCalledWith(409);

    const count = await Booking.countDocuments({ vehicle: vehicle._id });
    expect(count).toBe(2);
  });

  it("refuse un essai déjà prévu sur le même véhicule au même créneau", async () => {
    const vehicle = await createVehicleDoc({ type: "vente" });
    const preferredDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const first = mockReqRes({ body: { type: "essai", clientInfo, vehicleId: vehicle._id.toString(), essai: { preferredDate } } });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);

    const second = mockReqRes({ body: { type: "essai", clientInfo, vehicleId: vehicle._id.toString(), essai: { preferredDate } } });
    await createBooking(second.req, second.res);
    expect(second.res.status).toHaveBeenCalledWith(409);
  });

  it("refuse un chauffeur déjà réservé sur le même créneau et facture au tarif horaire (pas journée)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const driver = await Driver.create({
      owner: owner._id,
      firstName: "Chauffeur", lastName: "Test", title: "Chauffeur pro Abidjan",
      tarif: 30000, tarifHeure: 5000,
      disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans",
    });
    const date = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const first = mockReqRes({ body: { type: "chauffeur", clientInfo, driverId: driver._id.toString(), chauffeur: { date, heures: 4 } } });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);
    expect(first.res.body.booking.montantBase).toBe(5000 * 4);

    const second = mockReqRes({ body: { type: "chauffeur", clientInfo, driverId: driver._id.toString(), chauffeur: { date, heures: 2 } } });
    await createBooking(second.req, second.res);
    expect(second.res.status).toHaveBeenCalledWith(409);
  });
});
