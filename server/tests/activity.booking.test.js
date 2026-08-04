import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createActivityDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

describe("bookingController.createBooking — type 'activite' (section OTHERS)", () => {
  it("refuse sans activityId", async () => {
    const { req, res } = mockReqRes({ body: { type: "activite", clientInfo } });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse une activité introuvable", async () => {
    const { req, res } = mockReqRes({
      body: { type: "activite", clientInfo, activityId: "64b000000000000000000000", activite: { date: "2027-06-01T10:00:00.000Z" } },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("refuse une activité non approuvée (pending)", async () => {
    const activity = await createActivityDoc({ status: "pending" });
    const { req, res } = mockReqRes({
      body: { type: "activite", clientInfo, activityId: activity._id.toString(), activite: { date: "2027-06-01T10:00:00.000Z" } },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("calcule le prix 'per_person' × nombre de participants", async () => {
    const activity = await createActivityDoc({ price: 50, priceUnit: "per_person", capacity: 6 });
    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-01T10:00:00.000Z", participants: 3 },
      },
    });
    await createBooking(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.booking.montantBase).toBe(150);
    expect(res.body.booking.montantTotal).toBe(150);
    expect(res.body.booking.activite.participants).toBe(3);
    expect(res.body.booking.reference).toMatch(/^VIT-ACT-/);
  });

  it("garde un prix forfaitaire 'per_session' quel que soit le nombre de participants", async () => {
    const activity = await createActivityDoc({ price: 400, priceUnit: "per_session", capacity: 8 });
    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-02T10:00:00.000Z", participants: 5 },
      },
    });
    await createBooking(req, res);
    expect(res.body.booking.montantBase).toBe(400);
  });

  it("refuse un essai si l'activité ne le propose pas", async () => {
    const activity = await createActivityDoc({ essaiDisponible: false });
    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-03T10:00:00.000Z", essai: true },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("applique le tarif et la durée d'essai quand activé et demandé", async () => {
    const activity = await createActivityDoc({
      essaiDisponible: true, essaiPrice: 20, essaiDurationMinutes: 30,
      price: 50, durationMinutes: 120,
    });
    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-04T10:00:00.000Z", essai: true },
      },
    });
    await createBooking(req, res);
    expect(res.body.booking.montantBase).toBe(20);
    expect(res.body.booking.activite.essai).toBe(true);
    const start = new Date(res.body.booking.activite.date);
    const end   = new Date(res.body.booking.activite.dateFin);
    expect((end - start) / 60000).toBe(30);
  });

  it("refuse de dépasser la capacité de l'activité sur un même créneau", async () => {
    const activity = await createActivityDoc({ capacity: 4, durationMinutes: 60 });
    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-05T10:00:00.000Z", participants: 5 },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("additionne les participants déjà réservés sur le même créneau avant d'accepter", async () => {
    const activity = await createActivityDoc({ capacity: 4, durationMinutes: 60 });
    const first = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-06T10:00:00.000Z", participants: 3 },
      },
    });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);

    // Même créneau, 2 participants de plus → 3+2=5 > capacité 4
    const second = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-06T10:15:00.000Z", participants: 2 },
      },
    });
    await createBooking(second.req, second.res);
    expect(second.res.status).toHaveBeenCalledWith(409);
  });

  it("accepte deux réservations concurrentes sur le même créneau tant que la capacité suffit", async () => {
    const activity = await createActivityDoc({ capacity: 6, durationMinutes: 60 });
    const first = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-07T10:00:00.000Z", participants: 3 },
      },
    });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);

    const second = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-07T10:15:00.000Z", participants: 3 },
      },
    });
    await createBooking(second.req, second.res);
    expect(second.res.status).not.toHaveBeenCalledWith(409);

    const count = await Booking.countDocuments({ activity: activity._id });
    expect(count).toBe(2);
  });

  it("refuse une date d'activité dans le passé", async () => {
    const activity = await createActivityDoc();
    const { req, res } = mockReqRes({
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2020-01-01T10:00:00.000Z" },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
