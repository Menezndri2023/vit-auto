import { describe, it, expect } from "vitest";
import { getPartnerAnalytics } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Manque réel trouvé en audit : getPartnerStats ne renvoyait que des totaux,
// aucune tendance dans le temps, aucun classement véhicule, aucune vue clientèle.
describe("bookingController.getPartnerAnalytics", () => {
  it("renvoie une structure vide et sûre sans aucune commande", async () => {
    const owner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: owner });
    await getPartnerAnalytics(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.monthlyRevenue).toEqual([]);
    expect(res.body.topVehicles).toEqual([]);
    expect(res.body.topClients).toEqual([]);
    expect(res.body.occupancyRate).toBe(0);
    expect(res.body.avgResponseTimeMinutes).toBeNull();
  });

  it("agrège revenu mensuel, top véhicule et clientèle sur des commandes terminées", async () => {
    const owner = await createUser({ role: "partenaire" });
    const client = await createUser({ firstName: "Awa", lastName: "Koné" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    for (let i = 0; i < 3; i++) {
      await Booking.create({
        type: "location", status: "completed",
        // Gate admin obligatoire (audit 2026-08) : getPartnerAnalytics filtre
        // désormais sur adminValidation.status:"approved".
        adminValidation: { status: "approved" },
        client: client._id,
        clientInfo: { firstName: "Awa", lastName: "Koné", email: "awa@example.test" , passportNumber: "P1234567"},
        vehicle: vehicle._id,
        partnerPayout: 10000,
        location: { days: 2, startDate: new Date(), endDate: new Date() },
      });
    }

    const { req, res } = mockReqRes({ user: owner });
    await getPartnerAnalytics(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.monthlyRevenue.length).toBe(1);
    expect(res.body.monthlyRevenue[0].revenue).toBe(30000);
    expect(res.body.topVehicles[0].revenue).toBe(30000);
    expect(res.body.topVehicles[0].count).toBe(3);
    expect(res.body.topClients[0].totalBookings).toBe(3);
    expect(res.body.topClients[0].totalSpent).toBe(30000);
  });

  it("regroupe un client invité (sans compte) par email", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    await Booking.create({
      type: "location", status: "pending",
      adminValidation: { status: "approved" },
      clientInfo: { firstName: "Invité", lastName: "Sans compte", email: "guest@example.test" , passportNumber: "P1234567"},
      vehicle: vehicle._id,
      location: { days: 1 },
    });

    const { req, res } = mockReqRes({ user: owner });
    await getPartnerAnalytics(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.topClients[0].email).toBe("guest@example.test");
    expect(res.body.topClients[0].totalBookings).toBe(1);
  });

  it("calcule le temps de réponse moyen à partir de partnerNotifiedAt et de l'auditTrail", async () => {
    const owner = await createUser({ role: "partenaire" });
    const client = await createUser({ role: "client" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const notifiedAt = new Date(Date.now() - 20 * 60 * 1000); // il y a 20 min

    await Booking.create({
      type: "location", status: "confirmed",
      adminValidation: { status: "approved" },
      client: client._id,
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" },
      vehicle: vehicle._id,
      partnerNotifiedAt: notifiedAt,
      auditTrail: [{ action: "status_confirmed", actorType: "PARTNER", actorId: owner._id, timestamp: new Date() }],
      location: { days: 1, startDate: new Date(), endDate: new Date() },
    });

    const { req, res } = mockReqRes({ user: owner });
    await getPartnerAnalytics(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.avgResponseTimeMinutes).toBeGreaterThanOrEqual(19);
    expect(res.body.avgResponseTimeMinutes).toBeLessThanOrEqual(21);
  });

  it("ignore les réservations sans décision dans l'auditTrail (encore en attente)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    await Booking.create({
      type: "location", status: "pending",
      adminValidation: { status: "approved" },
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean2@example.test", passportNumber: "P1234567" },
      vehicle: vehicle._id,
      partnerNotifiedAt: new Date(),
      location: { days: 1 },
    });

    const { req, res } = mockReqRes({ user: owner });
    await getPartnerAnalytics(req, res);

    expect(res.body.avgResponseTimeMinutes).toBeNull();
  });
});
