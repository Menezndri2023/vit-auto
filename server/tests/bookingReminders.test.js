import { describe, it, expect } from "vitest";
import { checkAndSendPickupReminders } from "../utils/bookingReminders.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" };

const makeBooking = async (overrides = {}) => {
  const client = await createUser();
  const partner = await createUser({ role: "partenaire" });
  const vehicle = await createVehicleDoc({ owner: partner._id });
  const booking = await Booking.create({
    type: "location", status: "confirmed", client: client._id, clientInfo,
    vehicle: vehicle._id,
    location: { startDate: new Date(Date.now() + 10 * 60 * 60 * 1000), endDate: new Date(Date.now() + 34 * 60 * 60 * 1000), days: 1 },
    montantBase: 10000, montantTotal: 10000, commissionRate: 0.15, commissionAmount: 1500, partnerPayout: 8500,
    ...overrides,
  });
  return { client, booking };
};

describe("bookingReminders.checkAndSendPickupReminders", () => {
  it("envoie un rappel pour une réservation confirmée qui commence dans les 26h", async () => {
    const { client, booking } = await makeBooking();
    const sent = await checkAndSendPickupReminders();
    expect(sent).toBeGreaterThanOrEqual(1);
    const notif = await Notification.findOne({ user: client._id });
    expect(notif).not.toBeNull();
    const updated = await Booking.findById(booking._id);
    expect(updated.pickupReminderSentAt).not.toBeNull();
  });

  it("ne relance jamais deux fois la même réservation", async () => {
    await makeBooking();
    const firstRun = await checkAndSendPickupReminders();
    expect(firstRun).toBeGreaterThanOrEqual(1);
    const secondRun = await checkAndSendPickupReminders();
    expect(secondRun).toBe(0);
  });

  it("ignore une réservation dont la prise en charge est trop lointaine (hors fenêtre)", async () => {
    const { client } = await makeBooking({
      location: { startDate: new Date(Date.now() + 72 * 60 * 60 * 1000), endDate: new Date(Date.now() + 96 * 60 * 60 * 1000), days: 1 },
    });
    await checkAndSendPickupReminders();
    const notif = await Notification.findOne({ user: client._id });
    expect(notif).toBeNull();
  });

  it("ignore une réservation encore en attente (pas encore confirmée)", async () => {
    const { client } = await makeBooking({ status: "pending" });
    await checkAndSendPickupReminders();
    const notif = await Notification.findOne({ user: client._id });
    expect(notif).toBeNull();
  });
});
