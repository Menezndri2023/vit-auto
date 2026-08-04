import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import User from "../models/User.js";

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

  it("refuse une location sous la durée minimale fixée par le partenaire (dureeMinLocation)", async () => {
    const vehicle = await createVehicleDoc({ dureeMinLocation: 3 });
    const { req, res } = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-03-10", endDate: "2027-03-12" },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepte une location qui atteint exactement la durée minimale", async () => {
    const vehicle = await createVehicleDoc({ dureeMinLocation: 3, pricePerDay: 1000 });
    const { req, res } = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 3, startDate: "2027-03-15", endDate: "2027-03-18" },
      },
    });
    await createBooking(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it("confirme automatiquement une réservation instantanée pour un partenaire certifié", async () => {
    const certifiedOwner = await createUser({ role: "partenaire", certificationBadge: "verifie" });
    const vehicle = await createVehicleDoc({ owner: certifiedOwner._id, instantBook: true, pricePerDay: 1000 });
    const { req, res } = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-04-10", endDate: "2027-04-12" },
      },
    });
    await createBooking(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.booking.status).toBe("confirmed");
  });

  it("ignore instantBook si le propriétaire n'est plus certifié (jamais confiance dans le seul booléen)", async () => {
    const uncertifiedOwner = await createUser({ role: "partenaire", certificationBadge: "none" });
    const vehicle = await createVehicleDoc({ owner: uncertifiedOwner._id, instantBook: true, pricePerDay: 1000 });
    const { req, res } = mockReqRes({
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-04-15", endDate: "2027-04-17" },
      },
    });
    await createBooking(req, res);
    expect(res.body.booking.status).toBe("pending");
  });

  it("applique une remise fidélité et débite les points du client (100 points = 1 USD)", async () => {
    const client = await createUser({ loyaltyPoints: 500 });
    const vehicle = await createVehicleDoc({ pricePerDay: 1000 }); // base = 2000 sur 2 jours, plafond 20% = 400 USD = 40000 pts
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-05-01", endDate: "2027-05-03" },
        pointsToRedeem: 300,
      },
    });
    await createBooking(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.booking.loyaltyPointsRedeemed).toBe(300);
    expect(res.body.booking.loyaltyDiscount).toBe(3);
    expect(res.body.booking.montantTotal).toBe(2000 - 3);
    const updated = await User.findById(client._id);
    expect(updated.loyaltyPoints).toBe(200);
  });

  it("plafonne la remise fidélité à 20% du montant de base même si le client a plus de points", async () => {
    const client = await createUser({ loyaltyPoints: 100000 });
    const vehicle = await createVehicleDoc({ pricePerDay: 1000 }); // base = 1000 sur 1 jour, plafond 20% = 200 USD = 20000 pts
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 1, startDate: "2027-05-05", endDate: "2027-05-06" },
        pointsToRedeem: 100000,
      },
    });
    await createBooking(req, res);
    expect(res.body.booking.loyaltyPointsRedeemed).toBe(20000);
    expect(res.body.booking.loyaltyDiscount).toBe(200);
    const updated = await User.findById(client._id);
    expect(updated.loyaltyPoints).toBe(80000);
  });

  it("ignore une demande de remise fidélité si le client n'a pas assez de points (pas de blocage de la réservation)", async () => {
    const client = await createUser({ loyaltyPoints: 10 });
    const vehicle = await createVehicleDoc({ pricePerDay: 1000 });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 1, startDate: "2027-05-08", endDate: "2027-05-09" },
        pointsToRedeem: 5000,
      },
    });
    await createBooking(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.booking.loyaltyPointsRedeemed).toBe(0);
    expect(res.body.booking.montantTotal).toBe(1000);
    const updated = await User.findById(client._id);
    expect(updated.loyaltyPoints).toBe(10);
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

  // Alimente l'animation de félicitations "1ère réservation" côté front
  // (voir BookingSuccess.jsx) — signalé directement dans la réponse plutôt
  // que par notification, l'utilisateur étant déjà sur l'écran concerné.
  describe("isFirstBooking", () => {
    it("vrai pour la toute première réservation d'un client connecté", async () => {
      const client = await createUser({ role: "client" });
      const vehicle = await createVehicleDoc();
      const { req, res } = mockReqRes({
        user: client,
        body: { type: "location", clientInfo, vehicleId: vehicle._id.toString(), location: { days: 2, startDate: "2027-04-01", endDate: "2027-04-03" } },
      });
      await createBooking(req, res);
      expect(res.body.isFirstBooking).toBe(true);
    });

    it("faux à partir de la 2e réservation du même client", async () => {
      const client = await createUser({ role: "client" });
      const vehicle = await createVehicleDoc();

      const first = mockReqRes({
        user: client,
        body: { type: "location", clientInfo, vehicleId: vehicle._id.toString(), location: { days: 2, startDate: "2027-05-01", endDate: "2027-05-03" } },
      });
      await createBooking(first.req, first.res);
      expect(first.res.body.isFirstBooking).toBe(true);

      const second = mockReqRes({
        user: client,
        body: { type: "location", clientInfo, vehicleId: vehicle._id.toString(), location: { days: 2, startDate: "2027-05-10", endDate: "2027-05-12" } },
      });
      await createBooking(second.req, second.res);
      expect(second.res.body.isFirstBooking).toBe(false);
    });

    it("faux pour une réservation non connectée (pas de req.user)", async () => {
      const vehicle = await createVehicleDoc();
      const { req, res } = mockReqRes({
        body: { type: "location", clientInfo, vehicleId: vehicle._id.toString(), location: { days: 2, startDate: "2027-06-01", endDate: "2027-06-03" } },
      });
      await createBooking(req, res);
      expect(res.body.isFirstBooking).toBe(false);
    });
  });
});
