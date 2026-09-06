import { describe, it, expect } from "vitest";
import { createReview, getReviews, adminListReviews } from "../controllers/reviewController.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import "../models/Driver.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function makeCompletedBooking(overrides = {}) {
  const owner  = await createUser({ role: "partenaire" });
  const client = await createUser({ role: "client" });
  const vehicle = await createVehicleDoc({ owner: owner._id });
  const booking = await Booking.create({
    type: "location",
    clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email, passportNumber: "P1234567" },
    client: client._id,
    vehicle: vehicle._id,
    status: "completed",
    ...overrides,
  });
  return { owner, client, vehicle, booking };
}

describe("reviewController.createReview — cibles bidirectionnelles", () => {
  it("le client peut noter l'agence (targetType partner), distinct de l'avis véhicule", async () => {
    const { owner, client, booking } = await makeCompletedBooking();

    const { req, res } = mockReqRes({
      user: client,
      body: { bookingId: booking._id.toString(), targetType: "partner", note: 4, commentaire: "Bon accueil" },
    });
    await createReview(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.review.targetType).toBe("partner");
    expect(res.body.review.targetId.toString()).toBe(owner._id.toString());

    const updatedOwner = await User.findById(owner._id);
    expect(updatedOwner.partnerRating.noteMoyenne).toBe(4);
    expect(updatedOwner.partnerRating.nombreAvis).toBe(1);

    const updatedBooking = await Booking.findById(booking._id);
    expect(updatedBooking.partnerReviewByClient).toBeTruthy();
    expect(updatedBooking.review).toBeFalsy(); // l'avis véhicule reste distinct, non affecté

    // Un avis véhicule reste possible sur la même commande (cible différente)
    const { req: req2, res: res2 } = mockReqRes({
      user: client,
      body: { bookingId: booking._id.toString(), targetType: "vehicle", note: 5, commentaire: "Super voiture" },
    });
    await createReview(req2, res2);
    expect(res2.status).not.toHaveBeenCalledWith(409);
  });

  it("le client peut donner un avis VIT AUTO avec wentWell, ciblé sur la réservation elle-même", async () => {
    const { client, booking } = await makeCompletedBooking();

    const { req, res } = mockReqRes({
      user: client,
      body: { bookingId: booking._id.toString(), targetType: "platform", note: 5, commentaire: "Fluide", wentWell: true },
    });
    await createReview(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.review.targetType).toBe("platform");
    expect(res.body.review.targetId.toString()).toBe(booking._id.toString());
    expect(res.body.review.wentWell).toBe(true);

    const updatedBooking = await Booking.findById(booking._id);
    expect(updatedBooking.platformReviewByClient).toBeTruthy();
  });

  it("refuse un second avis plateforme sur la même commande (déjà soumis)", async () => {
    const { client, booking } = await makeCompletedBooking();
    const first = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), targetType: "platform", note: 3, wentWell: false } });
    await createReview(first.req, first.res);

    const second = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), targetType: "platform", note: 5, wentWell: true } });
    await createReview(second.req, second.res);
    expect(second.res.status).toHaveBeenCalledWith(409);
  });

  it("le partenaire peut noter le client (targetType client) mais pas le véhicule/l'agence/la plateforme", async () => {
    const { owner, client, booking } = await makeCompletedBooking();

    const good = mockReqRes({ user: owner, body: { bookingId: booking._id.toString(), targetType: "client", note: 2, commentaire: "En retard" } });
    await createReview(good.req, good.res);
    expect(good.res.status).not.toHaveBeenCalledWith(403);
    expect(good.res.body.review.targetType).toBe("client");
    expect(good.res.body.review.targetId.toString()).toBe(client._id.toString());

    const updatedClient = await User.findById(client._id);
    expect(updatedClient.clientReliability.noteMoyenne).toBe(2);
    expect(updatedClient.clientReliability.nombreAvis).toBe(1);

    for (const targetType of ["vehicle", "partner", "platform"]) {
      const bad = mockReqRes({ user: owner, body: { bookingId: booking._id.toString(), targetType, note: 5 } });
      await createReview(bad.req, bad.res);
      expect(bad.res.status).toHaveBeenCalledWith(403);
    }
  });

  it("le client ne peut pas soumettre targetType client", async () => {
    const { client, booking } = await makeCompletedBooking();
    const { req, res } = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), targetType: "client", note: 5 } });
    await createReview(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("targetType invalide est rejeté", async () => {
    const { client, booking } = await makeCompletedBooking();
    const { req, res } = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), targetType: "bogus", note: 5 } });
    await createReview(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("reviewController.getReviews — accès restreint aux avis internes", () => {
  it("targetType platform/client sont refusés en public (403)", async () => {
    const { booking } = await makeCompletedBooking();

    const pub1 = mockReqRes({ query: { targetType: "platform", targetId: booking._id.toString() } });
    await getReviews(pub1.req, pub1.res);
    expect(pub1.res.status).toHaveBeenCalledWith(403);

    const pub2 = mockReqRes({ query: { targetType: "client", targetId: booking._id.toString() } });
    await getReviews(pub2.req, pub2.res);
    expect(pub2.res.status).toHaveBeenCalledWith(403);
  });

  it("un admin peut consulter les avis platform/client", async () => {
    const admin = await createUser({ role: "admin" });
    const { booking } = await makeCompletedBooking();

    const asAdmin = mockReqRes({ user: admin, query: { targetType: "platform", targetId: booking._id.toString() } });
    await getReviews(asAdmin.req, asAdmin.res);
    expect(asAdmin.res.status).not.toHaveBeenCalledWith(403);
  });

  it("targetType partner reste public, comme vehicle/driver", async () => {
    const { owner, booking } = await makeCompletedBooking();
    const pub = mockReqRes({ query: { targetType: "partner", targetId: owner._id.toString() } });
    await getReviews(pub.req, pub.res);
    expect(pub.res.status).not.toHaveBeenCalledWith(403);
    void booking;
  });
});

describe("reviewController.adminListReviews — stats plateforme", () => {
  it("renvoie platformStats (moyenne + taux de transactions bien déroulées) pour targetType=platform", async () => {
    const admin = await createUser({ role: "admin" });
    const b1 = await makeCompletedBooking();
    const b2 = await makeCompletedBooking();

    const r1 = mockReqRes({ user: b1.client, body: { bookingId: b1.booking._id.toString(), targetType: "platform", note: 5, wentWell: true } });
    await createReview(r1.req, r1.res);
    const r2 = mockReqRes({ user: b2.client, body: { bookingId: b2.booking._id.toString(), targetType: "platform", note: 3, wentWell: false } });
    await createReview(r2.req, r2.res);

    const { req, res } = mockReqRes({ user: admin, query: { targetType: "platform" } });
    await adminListReviews(req, res);
    expect(res.body.platformStats).toBeTruthy();
    expect(res.body.platformStats.total).toBe(2);
    expect(res.body.platformStats.noteMoyenne).toBe(4);
    expect(res.body.platformStats.wentWellRate).toBe(50);
  });
});
