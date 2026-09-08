import { describe, it, expect } from "vitest";
import { proposeBookingAlternative } from "../controllers/bookingController.js";
import { proposeAlternative, respondToAlternative } from "../services/bookingActionService.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Failles CRITIQUES (audit sécurité 2026-09) sur les actions de réservation.
//
// 1. AFFECTATION EN MASSE — bookingController.proposeBookingAlternative
//    construisait son appel ainsi :
//        proposeAlternative({ bookingId: id, actorId: req.user._id, ...req.body })
//    Le spread venant APRÈS, le CLIENT pouvait réécrire `actorId` et
//    `bookingId`. En envoyant `actorId: null`, il désactivait le contrôle de
//    propriété ; en envoyant `bookingId`, il visait la réservation d'autrui.
//
// 2. GARDES OUVERTES PAR DÉFAUT — `if (actorId && ownerId && actorId !== ownerId)`
//    autorise dès que l'un des deux est absent. Et `resolveOwnerId` ne lisait
//    que `booking.vehicle` : les réservations CHAUFFEUR et ACTIVITÉ n'ont pas
//    de véhicule, leur propriétaire était donc toujours `null` — n'importe quel
//    compte authentifié pouvait agir dessus.
//
// Effet combiné : un client quelconque proposait une « alternative » à 1 € sur
// la réservation d'un autre, avec son propre véhicule, notification à l'appui.

describe("Actions de réservation — contrôle de propriété", () => {
  it("le corps de requête ne peut pas réécrire l'identité de l'acteur ni la réservation visée", async () => {
    const attaquant = await createUser({ role: "client", emailVerified: true });
    const victimeClient = await createUser({ role: "client" });
    const partenaire = await createUser({ role: "partenaire" });
    const vehiculeVictime = await createVehicleDoc({ owner: partenaire._id });
    const vehiculeAttaquant = await createVehicleDoc({ owner: attaquant._id });

    const maReservation = await Booking.create({
      type: "location", client: attaquant._id, vehicle: vehiculeAttaquant._id,
      clientInfo: { firstName: "A", lastName: "T", email: "a@t.test" }, status: "pending",
    });
    const reservationVictime = await Booking.create({
      type: "location", client: victimeClient._id, vehicle: vehiculeVictime._id,
      clientInfo: { firstName: "V", lastName: "C", email: "v@c.test" },
      status: "pending", montantBase: 90000, montantTotal: 90000,
    });

    const { req, res } = mockReqRes({
      user: attaquant,
      params: { id: maReservation._id.toString() },
      body: {
        actorId: null,                                   // neutralise la garde
        bookingId: reservationVictime._id.toString(),    // redirige la cible
        proposedPrice: 1,
        proposedVehicleId: vehiculeAttaquant._id.toString(),
      },
    });
    await proposeBookingAlternative(req, res);

    const fraiche = await Booking.findById(reservationVictime._id);
    expect(fraiche.alternative?.proposedAt, "la réservation de la victime ne doit pas être touchée").toBeFalsy();
    expect(fraiche.montantBase).toBe(90000);
  });

  it("refuse un acteur qui n'est pas le propriétaire, même sur une réservation CHAUFFEUR (sans véhicule)", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const intrus = await createUser({ role: "client" });
    const client = await createUser({ role: "client" });
    const chauffeur = await Driver.create({
      firstName: "Chauffeur", lastName: "Pro", title: "Chauffeur", tarifHeure: 3000,
      disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans",
      profilePhoto: "https://cdn.example.test/p.jpg", cv: "https://cdn.example.test/cv.pdf",
      status: "approved", owner: partenaire._id,
    });
    const booking = await Booking.create({
      type: "chauffeur", client: client._id, driver: chauffeur._id,
      clientInfo: { firstName: "V", lastName: "C", email: "v@c.test" }, status: "pending",
    });

    const r = await proposeAlternative({
      bookingId: booking._id.toString(), actorId: intrus._id, proposedPrice: 1,
    });
    expect(r.statusCode, "une réservation sans véhicule ne doit pas échapper au contrôle").toBe(403);

    const fraiche = await Booking.findById(booking._id);
    expect(fraiche.alternative?.proposedAt).toBeFalsy();
  });

  it("refuse un acteur non identifié (actorId absent)", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partenaire._id });
    const booking = await Booking.create({
      type: "location", vehicle: vehicle._id,
      clientInfo: { firstName: "V", lastName: "C", email: "v@c.test" }, status: "pending",
    });

    const r = await proposeAlternative({ bookingId: booking._id.toString(), actorId: null, proposedPrice: 1 });
    expect(r.statusCode).toBe(403);
  });

  it("refuse à un tiers de répondre à l'alternative d'une réservation invité", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const intrus = await createUser({ role: "client" });
    const vehicle = await createVehicleDoc({ owner: partenaire._id });
    const booking = await Booking.create({
      type: "location", client: null, vehicle: vehicle._id, // réservation invité
      clientInfo: { firstName: "V", lastName: "C", email: "v@c.test" }, status: "pending",
      alternative: { proposedAt: new Date(), clientResponse: "pending", proposedPrice: 1000 },
    });

    const r = await respondToAlternative({ bookingId: booking._id.toString(), clientId: intrus._id, accept: false });
    expect(r.statusCode, "sans compte client rattaché, la garde s'ouvrait à tout le monde").toBe(403);

    const fraiche = await Booking.findById(booking._id);
    expect(fraiche.status).not.toBe("cancelled");
  });

  it("laisse le VRAI propriétaire agir normalement (pas de régression)", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const client = await createUser({ role: "client" });
    const vehicle = await createVehicleDoc({ owner: partenaire._id });
    const booking = await Booking.create({
      type: "location", client: client._id, vehicle: vehicle._id,
      clientInfo: { firstName: "V", lastName: "C", email: "v@c.test" }, status: "pending",
    });

    const r = await proposeAlternative({
      bookingId: booking._id.toString(), actorId: partenaire._id, proposedPrice: 45000,
    });
    expect(r.statusCode).toBe(200);
    const fraiche = await Booking.findById(booking._id);
    expect(fraiche.alternative?.proposedAt).toBeTruthy();
  });
});
