import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import {
  acceptBooking, markVehicleOnTheWay, markVehicleDelivered,
} from "../services/bookingActionService.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

async function makeDeliveryBooking(overrides = {}) {
  const owner = await createUser({ role: "partenaire" });
  const client = await createUser({ role: "client", emailVerified: true });
  const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 1000 });
  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "location", clientInfo, vehicleId: vehicle._id.toString(),
      location: {
        days: 2, startDate: "2027-07-10", endDate: "2027-07-12",
        pickupMethod: "livraison",
        pickupPosition: { lat: 33.5, lng: -7.6, address: "12 Rue Test", city: "Casablanca", postalCode: "20000", instructions: "Portail bleu" },
      },
      ...overrides.body,
    },
  });
  await createBooking(req, res);
  // L'auto-approbation par score de fraude (Booking Engine) est asynchrone
  // (queue/dispatch, non attendue par createBooking) — on simule ici son
  // résultat pour tester acceptBooking/markVehicle* indépendamment, même
  // pattern que les fixtures Phase 1 (adminValidation.status:"approved").
  await Booking.findByIdAndUpdate(res.body.booking._id, { $set: { "adminValidation.status": "approved" } });
  const booking = await Booking.findById(res.body.booking._id);
  return { owner, client, vehicle, booking };
}

describe("Booking Engine — livraison (suivi)", () => {
  it("fixe delivery.status à 'requested' à la création en mode livraison, avec les champs structurés", async () => {
    const { booking } = await makeDeliveryBooking();
    expect(booking.delivery.status).toBe("requested");
    expect(booking.delivery.requestedDateTime).toBeTruthy();
    expect(booking.location.pickupPosition.city).toBe("Casablanca");
    expect(booking.location.pickupPosition.postalCode).toBe("20000");
    expect(booking.location.pickupPosition.instructions).toBe("Portail bleu");
  });

  it("laisse delivery.status à 'none' pour un retrait en agence", async () => {
    const owner = await createUser({ role: "partenaire" });
    const client = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 1000 });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-07-15", endDate: "2027-07-17", pickupMethod: "retrait" },
      },
    });
    await createBooking(req, res);
    expect(res.body.booking.delivery.status).toBe("none");
  });

  it("confirme automatiquement la livraison quand le partenaire accepte la réservation", async () => {
    const { owner, booking } = await makeDeliveryBooking();
    const result = await acceptBooking({ bookingId: booking._id, actorId: owner._id, source: "DASHBOARD" });
    expect(result.statusCode).toBe(200);

    const updated = await Booking.findById(booking._id);
    expect(updated.status).toBe("confirmed");
    expect(updated.delivery.status).toBe("confirmed");
    expect(updated.delivery.confirmedAt).toBeTruthy();
  });

  it("refuse de marquer 'en route' si la livraison n'est pas encore confirmée", async () => {
    const { owner, booking } = await makeDeliveryBooking(); // jamais accepté → delivery.status reste "requested"
    const result = await markVehicleOnTheWay({ bookingId: booking._id, actorId: owner._id });
    expect(result.statusCode).toBe(409);
  });

  it("refuse l'action d'un tiers non propriétaire du véhicule", async () => {
    const { booking } = await makeDeliveryBooking();
    const stranger = await createUser({ role: "partenaire" });
    const result = await markVehicleOnTheWay({ bookingId: booking._id, actorId: stranger._id });
    expect(result.statusCode).toBe(403);
  });

  it("suit le parcours complet confirmé → en route → livré, avec transition status → client_arrived", async () => {
    const { owner, booking } = await makeDeliveryBooking();
    await acceptBooking({ bookingId: booking._id, actorId: owner._id });

    const onTheWay = await markVehicleOnTheWay({ bookingId: booking._id, actorId: owner._id });
    expect(onTheWay.statusCode).toBe(200);
    let updated = await Booking.findById(booking._id);
    expect(updated.delivery.status).toBe("on_the_way");
    expect(updated.status).toBe("in_progress");

    const delivered = await markVehicleDelivered({ bookingId: booking._id, actorId: owner._id });
    expect(delivered.statusCode).toBe(200);
    updated = await Booking.findById(booking._id);
    expect(updated.delivery.status).toBe("delivered");
    expect(updated.delivery.deliveredAt).toBeTruthy();
    expect(updated.status).toBe("client_arrived");
  });

  it("refuse de marquer 'livré' sans être passé par 'en route' (idempotence de l'ordre des étapes)", async () => {
    const { owner, booking } = await makeDeliveryBooking();
    await acceptBooking({ bookingId: booking._id, actorId: owner._id }); // delivery.status = "confirmed"
    const result = await markVehicleDelivered({ bookingId: booking._id, actorId: owner._id });
    expect(result.statusCode).toBe(409);
  });

  it("un double appel à markVehicleOnTheWay ne repasse pas deux fois le statut (idempotence)", async () => {
    const { owner, booking } = await makeDeliveryBooking();
    await acceptBooking({ bookingId: booking._id, actorId: owner._id });

    const first = await markVehicleOnTheWay({ bookingId: booking._id, actorId: owner._id });
    expect(first.statusCode).toBe(200);
    const second = await markVehicleOnTheWay({ bookingId: booking._id, actorId: owner._id });
    // Le 2e appel trouve delivery.status déjà "on_the_way" (plus "confirmed") → refusé proprement.
    expect(second.statusCode).toBe(409);
  });
});
