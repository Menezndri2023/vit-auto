import { describe, it, expect } from "vitest";
import { modifyBookingDates } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Jusqu'ici un client ne pouvait qu'annuler puis recommencer une nouvelle
// réservation — aucun moyen de simplement changer les dates. Manque réel
// trouvé en audit.
const makeLocationBooking = async (overrides = {}) => {
  const client = await createUser();
  const vehicle = await createVehicleDoc({ pricePerDay: 10000 });
  const booking = await Booking.create({
    type: "location", status: "pending", client: client._id,
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
    vehicle: vehicle._id,
    location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    montantBase: 20000, montantTotal: 20000, commissionRate: 0.15, commissionAmount: 3000, partnerPayout: 17000,
    ...overrides,
  });
  return { client, vehicle, booking };
};

describe("bookingController.modifyBookingDates", () => {
  it("refuse un tiers non propriétaire", async () => {
    const { booking } = await makeLocationBooking();
    const stranger = await createUser();
    const { req, res } = mockReqRes({ user: stranger, params: { id: booking._id.toString() }, body: { startDate: "2027-03-05", endDate: "2027-03-07" } });
    await modifyBookingDates(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("refuse si le statut n'est plus modifiable", async () => {
    const { client, booking } = await makeLocationBooking({ status: "in_progress" });
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { startDate: "2027-03-05", endDate: "2027-03-07" } });
    await modifyBookingDates(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("refuse des dates invalides (fin avant début)", async () => {
    const { client, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({ user: client, params: { id: booking._id.toString() }, body: { startDate: "2027-03-10", endDate: "2027-03-05" } });
    await modifyBookingDates(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("modifie les dates et recalcule le prix", async () => {
    const { client, booking } = await makeLocationBooking();
    const { req, res } = mockReqRes({
      user: client, params: { id: booking._id.toString() },
      body: { startDate: "2027-04-01", endDate: "2027-04-05" },
    });
    await modifyBookingDates(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await Booking.findById(booking._id);
    expect(saved.location.days).toBe(4);
    expect(saved.montantBase).toBe(40000);
    expect(saved.montantTotal).toBe(40000);
  });

  it("refuse si le véhicule est déjà réservé sur les nouvelles dates", async () => {
    const { client, vehicle, booking } = await makeLocationBooking();
    await Booking.create({
      type: "location", status: "confirmed",
      clientInfo: { firstName: "Autre", lastName: "Client", email: "autre@example.test" },
      vehicle: vehicle._id,
      location: { startDate: new Date("2027-05-10"), endDate: new Date("2027-05-15"), days: 5 },
    });

    const { req, res } = mockReqRes({
      user: client, params: { id: booking._id.toString() },
      body: { startDate: "2027-05-12", endDate: "2027-05-14" },
    });
    await modifyBookingDates(req, res);
    expect(res.statusCode).toBe(409);
  });
});
