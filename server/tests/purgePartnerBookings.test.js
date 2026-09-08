import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { purgePartnerBookings } from "../scripts/purgePartnerBookings.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import Contract from "../models/Contract.js";
import Review from "../models/Review.js";
import CommissionLedger from "../models/CommissionLedger.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

// Script de purge de l'historique de réservations d'un partenaire (réservations
// de TEST créées avant de lui remettre ses identifiants).
//
// Il supprime des données de PRODUCTION de façon irréversible : il est donc
// testé comme du code applicatif, et pas seulement relu. Ce qui compte le plus
// ici n'est pas qu'il supprime, mais qu'il ne supprime QUE ce qu'il doit —
// le compte, les annonces et les réservations des AUTRES partenaires doivent
// rester intacts.

const silencieux = () => {};

async function seedPartnerAvecHistorique(email) {
  const partner = await createUser({ role: "partenaire", email });
  const client  = await createUser({ role: "client" });
  const vehicle = await createVehicleDoc({ owner: partner._id });

  const booking = await Booking.create({
    type: "location", client: client._id, vehicle: vehicle._id,
    clientInfo: { firstName: "Test", lastName: "Client", email: "test@example.test" },
    adminValidation: { status: "approved" }, status: "completed",
    montantTotal: 50000, partnerPayout: 42000,
  });
  const payment = await Payment.create({
    booking: booking._id, amount: 50000, devise: "USD", method: "card", status: "completed",
  });
  const contract = await Contract.create({ booking: booking._id, type: "location", status: "sent" });
  const review = await Review.create({
    booking: booking._id, reviewer: client._id, targetType: "vehicle", targetId: vehicle._id, note: 5,
  });
  const ledger = await CommissionLedger.create({
    transactionId: booking._id.toString(), transactionType: "booking", partnerId: partner._id,
    grossAmount: 50000, commissionRate: 15, commissionAmount: 7500, type: "partner_direct",
  });
  return { partner, client, vehicle, booking, payment, contract, review, ledger };
}

describe("Purge de l'historique de réservations d'un partenaire", () => {
  it("en SIMULATION, ne supprime rien du tout", async () => {
    const { partner, booking } = await seedPartnerAvecHistorique("simulation@example.test");

    const rapport = await purgePartnerBookings({ target: partner.email, confirm: false, log: silencieux });

    expect(rapport.bookings.length).toBe(1);
    expect(rapport.deleted).toBe(0);
    expect(await Booking.findById(booking._id)).toBeTruthy();
    expect(await Payment.countDocuments({ booking: booking._id })).toBe(1);
  });

  it("avec confirmation, supprime la réservation ET tout ce qui y est rattaché", async () => {
    const { partner, booking, payment, contract, review, ledger } =
      await seedPartnerAvecHistorique("purge@example.test");

    const rapport = await purgePartnerBookings({ target: partner.email, confirm: true, log: silencieux });

    expect(rapport.deleted).toBe(1);
    expect(await Booking.findById(booking._id)).toBeNull();
    // Sans ce nettoyage, le partenaire retrouverait des factures et des
    // reversements orphelins dans son espace.
    expect(await Payment.findById(payment._id)).toBeNull();
    expect(await Contract.findById(contract._id)).toBeNull();
    expect(await Review.findById(review._id)).toBeNull();
    expect(await CommissionLedger.findById(ledger._id)).toBeNull();
  });

  it("ne touche NI au compte du partenaire NI à ses annonces", async () => {
    const { partner, vehicle } = await seedPartnerAvecHistorique("intact@example.test");

    await purgePartnerBookings({ target: partner.email, confirm: true, log: silencieux });

    const { default: User } = await import("../models/User.js");
    expect(await User.findById(partner._id)).toBeTruthy();
    const veh = await Vehicle.findById(vehicle._id);
    expect(veh).toBeTruthy();
    expect(veh.available).toBe(true); // disponibilité réinitialisée
  });

  it("ne touche JAMAIS aux réservations d'un AUTRE partenaire", async () => {
    const cible = await seedPartnerAvecHistorique("cible@example.test");
    const voisin = await seedPartnerAvecHistorique("voisin@example.test");

    await purgePartnerBookings({ target: cible.partner.email, confirm: true, log: silencieux });

    expect(await Booking.findById(cible.booking._id)).toBeNull();
    expect(await Booking.findById(voisin.booking._id), "la réservation du voisin doit survivre").toBeTruthy();
    expect(await Payment.findById(voisin.payment._id)).toBeTruthy();
    expect(await CommissionLedger.findById(voisin.ledger._id)).toBeTruthy();
  });

  it("retrouve aussi le partenaire par son NOM D'ENTREPRISE", async () => {
    const { partner, booking } = await seedPartnerAvecHistorique("entreprise@example.test");
    await mongoose.connection.db.collection("partnerbusinesses").insertOne({
      companyName: "BENTCHICHCAR", owner: partner._id, country: "MA",
    });

    const rapport = await purgePartnerBookings({ target: "bentchichcar", confirm: true, log: silencieux });

    expect(rapport.partner?._id?.toString()).toBe(partner._id.toString());
    expect(await Booking.findById(booking._id)).toBeNull();
  });

  it("signale proprement un partenaire inexistant, sans rien supprimer", async () => {
    const { booking } = await seedPartnerAvecHistorique("existe@example.test");

    const rapport = await purgePartnerBookings({ target: "inconnu@nulle-part.test", confirm: true, log: silencieux });

    expect(rapport.partner).toBeNull();
    expect(rapport.deleted).toBe(0);
    expect(await Booking.findById(booking._id)).toBeTruthy();
  });
});
