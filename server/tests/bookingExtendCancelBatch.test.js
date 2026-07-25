import { describe, it, expect } from "vitest";
import { extendBooking, cancelBookingByClient, updateBookingStatus, createBookingsBatch } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const makeLocationBooking = async (overrides = {}) => {
  const client = await createUser();
  const partner = await createUser({ role: "partenaire" });
  const vehicle = await createVehicleDoc({ pricePerDay: 10000, owner: partner._id });
  const booking = await Booking.create({
    type: "location", status: "pending", client: client._id,
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" },
    vehicle: vehicle._id,
    location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    montantBase: 20000, montantTotal: 20000, commissionRate: 0.15, commissionAmount: 3000, partnerPayout: 17000,
    ...overrides,
  });
  return { client, partner, vehicle, booking };
};

describe("bookingController.extendBooking", () => {
  it("refuse un tiers non propriétaire", async () => {
    const { booking } = await makeLocationBooking();
    const stranger = await createUser();
    const { req, res } = mockReqRes({ user: stranger, params: { id: booking._id.toString() }, body: { newEndDate: "2027-03-10" } });
    await extendBooking(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse une nouvelle date de fin antérieure ou égale à l'actuelle", async () => {
    const { client, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { newEndDate: "2027-03-02" } });
    await extendBooking(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse si le statut n'est plus prolongeable (completed)", async () => {
    const { client, booking } = await makeLocationBooking({ status: "completed" });
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { newEndDate: "2027-03-10" } });
    await extendBooking(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("autorise la prolongation même en cours de location (in_progress)", async () => {
    const { client, booking } = await makeLocationBooking({ status: "in_progress" });
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { newEndDate: "2027-03-05" } });
    await extendBooking(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Booking.findById(booking._id);
    expect(saved.location.days).toBe(4); // 01→05 mars
    expect(saved.montantBase).toBe(40000);
    expect(res.body.addedDays).toBe(2);
  });

  it("refuse si le véhicule est déjà réservé juste après la fin actuelle", async () => {
    const { client, vehicle, booking } = await makeLocationBooking();
    await Booking.create({
      type: "location", status: "confirmed",
      clientInfo: { firstName: "Autre", lastName: "Client", email: "autre@example.test", passportNumber: "P7654321" },
      vehicle: vehicle._id,
      location: { startDate: new Date("2027-03-04"), endDate: new Date("2027-03-08"), days: 4 },
    });
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { newEndDate: "2027-03-06" } });
    await extendBooking(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("remet isPaid à false si un supplément est dû après un paiement déjà réglé", async () => {
    const { client, booking } = await makeLocationBooking({ isPaid: true, paidAt: new Date() });
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { newEndDate: "2027-03-06" } });
    await extendBooking(req, res);
    expect(res.statusCode).toBe(200);
    const saved = await Booking.findById(booking._id);
    expect(saved.isPaid).toBe(false);
  });
});

describe("bookingController.cancelBookingByClient — motif obligatoire", () => {
  it("refuse sans reasonCode valide", async () => {
    const { client, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { reason: "je ne veux plus" } });
    await cancelBookingByClient(req, res);
    expect(res.statusCode).toBe(400);
    const saved = await Booking.findById(booking._id);
    expect(saved.status).toBe("pending");
  });

  it("annule avec un reasonCode valide, texte libre facultatif", async () => {
    const { client, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({
      user: client, params: { id: booking._id.toString() },
      body: { reasonCode: "changement_de_plans" },
    });
    await cancelBookingByClient(req, res);
    expect(res.statusCode).toBe(200);
    const saved = await Booking.findById(booking._id);
    expect(saved.status).toBe("cancelled");
    expect(saved.cancelReasonCode).toBe("changement_de_plans");
    expect(saved.cancelledBy).toBe("client");
  });

  it("rejette un reasonCode inconnu", async () => {
    const { client, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { reasonCode: "code_invente" } });
    await cancelBookingByClient(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("bookingController.updateBookingStatus — annulation partenaire, motif obligatoire", () => {
  it("refuse une annulation partenaire sans reasonCode", async () => {
    const { partner, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({ user: partner, params: { id: booking._id.toString() }, body: { status: "cancelled" } });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("annule avec un reasonCode partenaire valide", async () => {
    const { partner, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({
      user: partner, params: { id: booking._id.toString() },
      body: { status: "cancelled", cancelReasonCode: "vehicule_indisponible" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
    const saved = await Booking.findById(booking._id);
    expect(saved.status).toBe("cancelled");
    expect(saved.cancelReasonCode).toBe("vehicule_indisponible");
    expect(saved.cancelledBy).toBe("partenaire");
  });

  it("les transitions non-annulation restent inchangées (pas de reasonCode requis)", async () => {
    const { partner, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({ user: partner, params: { id: booking._id.toString() }, body: { status: "confirmed" } });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("bookingController.createBookingsBatch", () => {
  it("refuse un panier vide", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({ user: client, body: { items: [] } });
    await createBookingsBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse plus de 8 véhicules", async () => {
    const client = await createUser();
    const items = Array.from({ length: 9 }, () => ({ vehicleId: client._id.toString(), startDate: "2027-06-01", endDate: "2027-06-03" }));
    const { req, res } = mockReqRes({ user: client, body: { items } });
    await createBookingsBatch(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("crée plusieurs réservations indépendantes, en tolérant un échec isolé", async () => {
    const client = await createUser();
    const partner = await createUser({ role: "partenaire" });
    const v1 = await createVehicleDoc({ pricePerDay: 10000, owner: partner._id });
    const v2 = await createVehicleDoc({ pricePerDay: 20000, owner: partner._id });

    const { req, res } = mockReqRes({
      user: client,
      body: {
        items: [
          { vehicleId: v1._id.toString(), startDate: "2027-06-01", endDate: "2027-06-03" }, // ok, 2 jours
          { vehicleId: v2._id.toString(), startDate: "2027-06-05", endDate: "2027-06-04" }, // dates invalides
        ],
        passportNumber: "P1234567",
      },
    });
    await createBookingsBatch(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.createdCount).toBe(1);
    expect(res.body.failedCount).toBe(1);

    const created = await Booking.findOne({ vehicle: v1._id, client: client._id });
    expect(created).toBeTruthy();
    expect(created.montantBase).toBe(20000);
  });

  it("refuse un véhicule non disponible à la location (type vente)", async () => {
    const client = await createUser();
    const partner = await createUser({ role: "partenaire" });
    const vSale = await createVehicleDoc({ type: "vente", pricePerDay: 0, priceForSale: 5000000, owner: partner._id });

    const { req, res } = mockReqRes({
      user: client,
      body: { items: [{ vehicleId: vSale._id.toString(), startDate: "2027-06-01", endDate: "2027-06-03" }], passportNumber: "P1234567" },
    });
    await createBookingsBatch(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.results[0].ok).toBe(false);
  });
});
