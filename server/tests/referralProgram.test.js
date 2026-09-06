import { describe, it, expect } from "vitest";
import { register, getMe } from "../controllers/authController.js";
import { updateBookingStatus } from "../controllers/bookingController.js";
import User from "../models/User.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const validBody = (overrides = {}) => ({
  firstName: "Jean", lastName: "Testeur",
  email: `jean.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
  password: "password123", birthDate: "1990-01-01",
  ...overrides,
});

describe("Parrainage — inscription", () => {
  it("un compte reçoit toujours un referralCode généré automatiquement", async () => {
    const { req, res } = mockReqRes({ body: validBody() });
    await register(req, res);
    expect(res.body.user.referralCode).toBeTruthy();
    expect(res.body.user.referralCode.length).toBeGreaterThan(0);
  });

  it("un referralCode valide pose referredBy à l'inscription", async () => {
    const referrer = await createUser({ role: "client" });
    const body = validBody({ referralCode: referrer.referralCode });
    const { req, res } = mockReqRes({ body });
    await register(req, res);

    const newUser = await User.findOne({ email: body.email });
    expect(newUser.referredBy?.toString()).toBe(referrer._id.toString());
  });

  it("un referralCode inconnu est ignoré silencieusement (inscription réussit quand même)", async () => {
    const body = validBody({ referralCode: "BOGUS999" });
    const { req, res } = mockReqRes({ body });
    await register(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const newUser = await User.findOne({ email: body.email });
    expect(newUser.referredBy).toBeFalsy();
  });

  it("getMe (safeUser) renvoie bien partnerRating/clientReliability/autoAcceptTrustedClients/referralCode", async () => {
    const user = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user });
    await getMe(req, res);

    expect(res.body.user.referralCode).toBeTruthy();
    expect(res.body.user.partnerRating).toEqual({ noteMoyenne: 0, nombreAvis: 0 });
    expect(res.body.user.clientReliability).toEqual({ noteMoyenne: 0, nombreAvis: 0 });
    expect(res.body.user.autoAcceptTrustedClients).toEqual({ enabled: false, minRating: 4, minReviews: 2 });
  });
});

describe("Parrainage — bonus à la première réservation complétée du filleul", () => {
  async function makeWaitingValidationBooking(client) {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 100 });
    return Booking.create({
      type: "location", vehicle: vehicle._id, client: client._id,
      clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email, passportNumber: "P1234567" },
      status: "waiting_client_validation", montantTotal: 100,
      location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    });
  }

  async function completeBooking(booking) {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: booking._id.toString() }, body: { status: "completed" } });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
  }

  it("crédite le parrain quand le filleul termine sa première réservation", async () => {
    const referrer = await createUser({ role: "client" });
    const referee = await createUser({ role: "client", referredBy: referrer._id });
    const booking = await makeWaitingValidationBooking(referee);

    await completeBooking(booking);

    const updatedReferrer = await User.findById(referrer._id);
    expect(updatedReferrer.loyaltyPoints).toBe(500);

    const tx = await LoyaltyTransaction.findOne({ user: referrer._id, type: "referral" });
    expect(tx).toBeTruthy();
    expect(tx.points).toBe(500);
  });

  it("ne crédite pas deux fois si le filleul termine une deuxième réservation", async () => {
    const referrer = await createUser({ role: "client" });
    const referee = await createUser({ role: "client", referredBy: referrer._id });
    const booking1 = await makeWaitingValidationBooking(referee);
    await completeBooking(booking1);

    const booking2 = await makeWaitingValidationBooking(referee);
    await completeBooking(booking2);

    const updatedReferrer = await User.findById(referrer._id);
    expect(updatedReferrer.loyaltyPoints).toBe(500); // pas 1000

    const count = await LoyaltyTransaction.countDocuments({ user: referrer._id, type: "referral" });
    expect(count).toBe(1);
  });

  it("ne crédite personne si le client n'a pas de parrain", async () => {
    const client = await createUser({ role: "client" });
    const booking = await makeWaitingValidationBooking(client);
    await completeBooking(booking);

    const count = await LoyaltyTransaction.countDocuments({ type: "referral" });
    expect(count).toBe(0);
  });
});
