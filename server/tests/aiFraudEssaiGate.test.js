import { describe, it, expect } from "vitest";
import { processAiJob } from "../queue/workers/ai.worker.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" };

// Transmission directe au partenaire (2026-09-14) : le score de fraude ne
// décide plus d'aucune approbation — il documente la réservation
// (fraudCheck) et alerte les admins en risque élevé, sans toucher
// adminValidation ni status.
describe("ai.worker fraud_detection — purement informatif", () => {
  it("renseigne fraudCheck sans jamais modifier adminValidation ni le statut", async () => {
    const owner   = await createUser({ role: "partenaire" });
    const client  = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await Booking.create({
      type: "location", vehicle: vehicle._id, client: client._id, clientInfo,
      status: "pending", adminValidation: { status: "approved", validatedByType: "SYSTEM" },
      location: { startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 3 * 86400000), days: 2 },
      montantTotal: 200,
    });

    const out = await processAiJob({ data: { type: "fraud_detection", data: {
      bookingId: booking._id.toString(), userId: client._id.toString(), amount: 200, bookingType: "location",
    } } });

    const updated = await Booking.findById(booking._id);
    expect(updated.adminValidation.status).toBe("approved");
    expect(updated.status).toBe("pending");
    expect(updated.fraudCheck?.riskLevel).toBe(out.riskLevel);
    expect(updated.fraudCheck?.checkedAt).toBeTruthy();
  });

  it("alerte les admins en risque élevé (compte récent, e-mail non vérifié, montant élevé) sans retenir la demande", async () => {
    const owner   = await createUser({ role: "partenaire" });
    const admin   = await createUser({ role: "admin" });
    const client  = await createUser({ role: "client", emailVerified: false, kycStatus: "EN_ATTENTE" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const booking = await Booking.create({
      type: "location", vehicle: vehicle._id, client: client._id, clientInfo,
      status: "pending", adminValidation: { status: "approved", validatedByType: "SYSTEM" },
      location: { startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 3 * 86400000), days: 2 },
      montantTotal: 600000,
    });

    const out = await processAiJob({ data: { type: "fraud_detection", data: {
      bookingId: booking._id.toString(), userId: client._id.toString(), amount: 600000, bookingType: "location",
    } } });
    expect(out.riskLevel).toBe("high");

    const updated = await Booking.findById(booking._id);
    expect(updated.adminValidation.status).toBe("approved");
    expect(updated.fraudCheck?.riskLevel).toBe("high");
    const alertes = await Notification.find({ user: admin._id }).lean();
    expect(alertes.some((n) => /fraude/i.test(n.titre))).toBe(true);
  });
});
