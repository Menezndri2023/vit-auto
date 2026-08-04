import { describe, it, expect } from "vitest";
import { updateBookingStatus } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

const makeBooking = async (overrides = {}) => {
  const client  = await createUser({ role: "client", loyaltyPoints: 0 });
  const partner = await createUser({ role: "partenaire" });
  const vehicle = await createVehicleDoc({ owner: partner._id });
  const booking = await Booking.create({
    type: "location", status: "waiting_client_validation", client: client._id, clientInfo,
    vehicle: vehicle._id,
    location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    montantBase: 2000, montantTotal: 2000.75, commissionRate: 0.15, commissionAmount: 300, partnerPayout: 1700,
    ...overrides,
  });
  return { client, partner, vehicle, booking };
};

describe("bookingController — attribution de points de fidélité à la complétion", () => {
  it("crédite Math.floor(montantTotal) points au client quand la commande passe à 'completed'", async () => {
    const { client, booking } = await makeBooking();
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: booking._id.toString() }, body: { status: "completed" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
    const updatedClient = await User.findById(client._id);
    expect(updatedClient.loyaltyPoints).toBe(2000); // Math.floor(2000.75)
  });

  it("ne crédite rien pour une réservation invitée sans compte client", async () => {
    const { booking } = await makeBooking({ client: null });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: booking._id.toString() }, body: { status: "completed" },
    });
    // Ne doit jamais planter faute de client, juste ne rien créditer.
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
  });
});
