import { describe, it, expect } from "vitest";
import { processAiJob } from "../queue/workers/ai.worker.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" };

// Restructuration réservation (2026-09) : un essai (le client conduit seul le
// véhicule d'un tiers avant tout engagement) doit toujours être revu par un
// vrai admin avant transmission au partenaire — jamais par le score de fraude
// automatique qui gère déjà les autres types (voir ai.worker.js
// fraud_detection et queue/index.js bookingCreated).
describe("ai.worker fraud_detection — gate admin manuel obligatoire pour un essai", () => {
  it("laisse un essai en attente d'un vrai admin même à risque faible/moyen (jamais auto-approuvé)", async () => {
    const owner   = await createUser({ role: "partenaire" });
    const client  = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ owner: owner._id, type: "vente" });
    const booking = await Booking.create({
      type: "essai", vehicle: vehicle._id, client: client._id, clientInfo,
      status: "pending", adminValidation: { status: "pending" },
      essai: { preferredDate: new Date(Date.now() + 7 * 86400000) },
      montantTotal: 0,
    });

    await processAiJob({ data: { type: "fraud_detection", data: {
      bookingId: booking._id.toString(), userId: client._id.toString(), amount: 0, bookingType: "essai",
    } } });

    const updated = await Booking.findById(booking._id);
    expect(updated.adminValidation.status).toBe("pending");
    expect(updated.status).toBe("pending");
    // fraudCheck reste tout de même écrit, pour information admin.
    expect(updated.fraudCheck?.riskLevel).toBeTruthy();
  });

  it("auto-approuve toujours une location à risque faible/moyen (comportement inchangé)", async () => {
    const owner   = await createUser({ role: "partenaire" });
    const client  = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await Booking.create({
      type: "location", vehicle: vehicle._id, client: client._id, clientInfo,
      status: "pending", adminValidation: { status: "pending" },
      location: { startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 3 * 86400000), days: 2 },
      montantTotal: 200,
    });

    await processAiJob({ data: { type: "fraud_detection", data: {
      bookingId: booking._id.toString(), userId: client._id.toString(), amount: 200, bookingType: "location",
    } } });

    const updated = await Booking.findById(booking._id);
    expect(updated.adminValidation.status).toBe("approved");
  });
});
