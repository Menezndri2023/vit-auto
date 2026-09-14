import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createActivityDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

// Booking Engine (2026-09) : createBooking exige désormais un client
// authentifié et vérifié (Niveau 1) — voir bookingController.createBooking.
const verifiedClient = () => createUser({ role: "client", emailVerified: true });

describe("bookingController.createBooking — type 'activite' (section OTHERS)", () => {
  it("refuse sans activityId", async () => {
    const client = await verifiedClient();
    const { req, res } = mockReqRes({ user: client, body: { type: "activite", clientInfo } });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse une activité introuvable", async () => {
    const client = await verifiedClient();
    const { req, res } = mockReqRes({
      user: client,
      body: { type: "activite", clientInfo, activityId: "64b000000000000000000000", activite: { date: "2027-06-01T10:00:00.000Z" } },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("refuse une activité non approuvée (pending)", async () => {
    const client = await verifiedClient();
    const activity = await createActivityDoc({ status: "pending" });
    const { req, res } = mockReqRes({
      user: client,
      body: { type: "activite", clientInfo, activityId: activity._id.toString(), activite: { date: "2027-06-01T10:00:00.000Z" } },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("calcule le prix 'per_person' × nombre de participants", async () => {
    const client = await verifiedClient();
    const activity = await createActivityDoc({ price: 50, priceUnit: "per_person", capacity: 6 });
    const { req, res } = mockReqRes({
      user: client,
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
    const client = await verifiedClient();
    const activity = await createActivityDoc({ price: 400, priceUnit: "per_session", capacity: 8 });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-02T10:00:00.000Z", participants: 5 },
      },
    });
    await createBooking(req, res);
    expect(res.body.booking.montantBase).toBe(400);
  });

  it("refuse un essai si l'activité ne le propose pas", async () => {
    const client = await verifiedClient();
    const activity = await createActivityDoc({ essaiDisponible: false });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-03T10:00:00.000Z", essai: true },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("applique le tarif et la durée d'essai quand activé et demandé", async () => {
    const client = await verifiedClient();
    const activity = await createActivityDoc({
      essaiDisponible: true, essaiPrice: 20, essaiDurationMinutes: 30,
      price: 50, durationMinutes: 120,
    });
    const { req, res } = mockReqRes({
      user: client,
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
    const client = await verifiedClient();
    const activity = await createActivityDoc({ capacity: 4, durationMinutes: 60 });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-05T10:00:00.000Z", participants: 5 },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("additionne les participants déjà réservés sur le même créneau avant d'accepter", async () => {
    const client = await verifiedClient();
    const activity = await createActivityDoc({ capacity: 4, durationMinutes: 60 });
    const first = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-06T10:00:00.000Z", participants: 3 },
      },
    });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);

    // Même créneau, 2 participants de plus → 3+2=5 > capacité 4
    const second = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-06T10:15:00.000Z", participants: 2 },
      },
    });
    await createBooking(second.req, second.res);
    expect(second.res.status).toHaveBeenCalledWith(409);
  });

  it("accepte deux réservations concurrentes sur le même créneau tant que la capacité suffit", async () => {
    const client = await verifiedClient();
    const activity = await createActivityDoc({ capacity: 6, durationMinutes: 60 });
    const first = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-06-07T10:00:00.000Z", participants: 3 },
      },
    });
    await createBooking(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(409);

    const second = mockReqRes({
      user: client,
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
    const client = await verifiedClient();
    const activity = await createActivityDoc();
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2020-01-01T10:00:00.000Z" },
      },
    });
    await createBooking(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// Condition météo (demande NEMO Diving, 2026-09-14) : une sortie soumise à la
// météo (plongée, mer, air — WEATHER_DEPENDENT_TYPES, ou Activity.weatherDependent)
// n'est réservable qu'après acceptation explicite de la condition.
describe("createBooking activité — condition météo", () => {
  it("refuse une plongée sans accusé météo, l'accepte avec, et ignore la condition pour un karting", async () => {
    const client = await createUser({ role: "client", emailVerified: true });
    const plongee = await createActivityDoc({ activityType: "PLONGEE", price: 60, priceUnit: "per_person", capacity: 6 });
    const base = { type: "activite", clientInfo, activityId: plongee._id.toString() };

    let m = mockReqRes({ user: client, body: { ...base, activite: { date: "2027-06-01T10:00:00.000Z", participants: 1 } } });
    await createBooking(m.req, m.res);
    expect(m.res.statusCode).toBe(400);
    expect(m.res.body.code).toBe("WEATHER_ACK_REQUIRED");

    m = mockReqRes({ user: client, body: { ...base, activite: { date: "2027-06-01T10:00:00.000Z", participants: 1, weatherAcknowledged: true } } });
    await createBooking(m.req, m.res);
    expect(m.res.statusCode).toBe(201);
    const b = await Booking.findOne({ activity: plongee._id });
    expect(b.activite.weatherAcknowledged).toBe(true);

    // Le partenaire peut désactiver la condition sur une annonce précise.
    const plongeeAbri = await createActivityDoc({ activityType: "PLONGEE", weatherDependent: false, price: 60, priceUnit: "per_person", capacity: 6 });
    m = mockReqRes({ user: client, body: { type: "activite", clientInfo, activityId: plongeeAbri._id.toString(), activite: { date: "2027-06-02T10:00:00.000Z", participants: 1 } } });
    await createBooking(m.req, m.res);
    expect(m.res.statusCode).toBe(201);

    const karting = await createActivityDoc({ activityType: "KARTING", price: 30, priceUnit: "per_person", capacity: 6 });
    m = mockReqRes({ user: client, body: { type: "activite", clientInfo, activityId: karting._id.toString(), activite: { date: "2027-06-03T10:00:00.000Z", participants: 1 } } });
    await createBooking(m.req, m.res);
    expect(m.res.statusCode).toBe(201);
  });
});
