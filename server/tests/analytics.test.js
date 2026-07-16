import { describe, it, expect } from "vitest";
import { getAnalytics } from "../controllers/analyticsController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("getAnalytics", () => {
  it("répond sans erreur quand aucune donnée n'existe (état vide)", async () => {
    const { req, res } = mockReqRes({});
    await getAnalytics(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.byCurrency).toEqual([]);
    expect(res.body.monthlyBookings).toEqual([]);
  });

  it("agrège correctement par devise/type/pays sur des commandes terminées", async () => {
    const client = await createUser({ country: "CI" });
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });

    await Booking.create({
      type: "location", client: client._id, vehicle: vehicle._id, status: "completed",
      clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email },
      montantTotal: 100000, commissionAmount: 15000, devise: "XOF",
    });
    // Une commande non terminée ne doit pas compter dans byCurrency/byType/byCountry.
    await Booking.create({
      type: "location", client: client._id, vehicle: vehicle._id, status: "pending",
      clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email },
      montantTotal: 999999, devise: "XOF",
    });

    const { req, res } = mockReqRes({});
    await getAnalytics(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.byCurrency).toEqual([{ currency: "XOF", total: 100000, count: 1 }]);
    expect(res.body.byType).toEqual([{ type: "location", total: 100000, commission: 15000, count: 1 }]);
    expect(res.body.byCountry).toEqual([{ country: "CI", total: 100000, count: 1 }]);
  });

  it("agrège les transactions Import/Export par statut", async () => {
    await createIETransaction({ status: "in_escrow", finalOffer: { totalAmount: 5000000 } });

    const { req, res } = mockReqRes({});
    await getAnalytics(req, res);
    expect(res.body.ieByStatus).toEqual([{ status: "in_escrow", count: 1, total: 5000000 }]);
  });
});
