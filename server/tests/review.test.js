import { describe, it, expect } from "vitest";
import { createReview, getReviews, hideReview, unhideReview } from "../controllers/reviewController.js";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
// Booking.findById(...).populate("driver", ...) exige que le schéma Driver
// soit enregistré sur la connexion mongoose de CE fichier de test (chaque
// fichier a son propre registre de modules avec l'isolation par défaut de
// Vitest) — importé ici uniquement pour cet effet de bord.
import "../models/Driver.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function createCompletedBooking(client, vehicle, overrides = {}) {
  return Booking.create({
    type: "location",
    clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email },
    client: client._id,
    vehicle: vehicle._id,
    status: "completed",
    ...overrides,
  });
}

describe("reviewController.createReview", () => {
  it("refuse une note hors de la plage 1-5", async () => {
    const { req, res } = mockReqRes({ user: await createUser(), body: { bookingId: "x", note: 6 } });
    await createReview(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse un avis sur la commande d'un autre client", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const vehicle = await createVehicleDoc();
    const booking = await createCompletedBooking(owner, vehicle);

    const { req, res } = mockReqRes({ user: stranger, body: { bookingId: booking._id.toString(), note: 5 } });
    await createReview(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("refuse un avis tant que la commande n'est pas terminée", async () => {
    const client = await createUser();
    const vehicle = await createVehicleDoc();
    const booking = await createCompletedBooking(client, vehicle, { status: "confirmed" });

    const { req, res } = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), note: 5 } });
    await createReview(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("crée un avis et met à jour la note moyenne du véhicule, puis refuse un doublon", async () => {
    const client = await createUser();
    const vehicle = await createVehicleDoc();
    const booking = await createCompletedBooking(client, vehicle);

    const { req, res } = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), note: 4, commentaire: "Très bien" } });
    await createReview(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.review).toBeTruthy();

    const updatedVehicle = await Vehicle.findById(vehicle._id);
    expect(updatedVehicle.noteMoyenne).toBe(4);
    expect(updatedVehicle.nombreAvis).toBe(1);

    // Deuxième avis sur la même commande — doit être refusé (contrainte unique booking+reviewer)
    const dup = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), note: 2 } });
    await createReview(dup.req, dup.res);
    expect(dup.res.status).toHaveBeenCalledWith(409);
  });
});

describe("reviewController — modération admin", () => {
  it("un avis masqué n'apparaît plus dans getReviews et la note moyenne est recalculée", async () => {
    const client1 = await createUser();
    const client2 = await createUser();
    const vehicle = await createVehicleDoc();
    const booking1 = await createCompletedBooking(client1, vehicle);
    const booking2 = await createCompletedBooking(client2, vehicle);

    const r1 = mockReqRes({ user: client1, body: { bookingId: booking1._id.toString(), note: 5 } });
    await createReview(r1.req, r1.res);
    const r2 = mockReqRes({ user: client2, body: { bookingId: booking2._id.toString(), note: 1 } });
    await createReview(r2.req, r2.res);

    const before = mockReqRes({ query: { targetType: "vehicle", targetId: vehicle._id.toString() } });
    await getReviews(before.req, before.res);
    expect(before.res.body.total).toBe(2);
    expect(before.res.body.noteMoyenne).toBe(3); // (5+1)/2

    // Masquer l'avis à 1 étoile
    const reviewIdToHide = r2.res.body.review._id.toString();
    const hide = mockReqRes({ params: { id: reviewIdToHide } });
    await hideReview(hide.req, hide.res);

    const after = mockReqRes({ query: { targetType: "vehicle", targetId: vehicle._id.toString() } });
    await getReviews(after.req, after.res);
    expect(after.res.body.total).toBe(1);
    expect(after.res.body.noteMoyenne).toBe(5);

    const updatedVehicle = await Vehicle.findById(vehicle._id);
    expect(updatedVehicle.noteMoyenne).toBe(5);
    expect(updatedVehicle.nombreAvis).toBe(1);

    // Réafficher — doit revenir à l'état initial
    const unhide = mockReqRes({ params: { id: reviewIdToHide } });
    await unhideReview(unhide.req, unhide.res);
    const restored = mockReqRes({ query: { targetType: "vehicle", targetId: vehicle._id.toString() } });
    await getReviews(restored.req, restored.res);
    expect(restored.res.body.total).toBe(2);
  });
});
