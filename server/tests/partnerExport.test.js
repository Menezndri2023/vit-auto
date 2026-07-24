import { describe, it, expect } from "vitest";
import { exportPartnerBookings } from "../controllers/bookingController.js";
import { exportPartnerIETransactions } from "../controllers/ieTransactionController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Aucun export comptable n'existait côté partenaire (CSV réservé à l'admin,
// exportBookings sur /admin/export) — manque réel trouvé en audit.
describe("exportPartnerBookings", () => {
  it("renvoie un CSV avec en-tête et une ligne par commande du partenaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: owner._id });
    await Booking.create({
      type: "location", status: "completed",
      clientInfo: { firstName: "Awa", lastName: "Koné", email: "awa@example.test" },
      vehicle: vehicle._id, montantTotal: 30000, partnerPayout: 27000,
      reference: "VIT-LOC-CSV-001",
    });

    const { req, res } = mockReqRes({ user: owner, query: {} });
    await exportPartnerBookings(req, res);

    expect(res.send).toHaveBeenCalled();
    const csv = res.send.mock.calls[0][0];
    expect(csv).toContain("Reference,Type,Statut");
    expect(csv).toContain("VIT-LOC-CSV-001");
    expect(csv).toContain("Awa");
  });

  it("n'inclut pas les commandes d'un autre partenaire", async () => {
    const owner = await createUser({ role: "partenaire" });
    const stranger = await createUser({ role: "partenaire" });
    const strangerVehicle = await createVehicleDoc({ owner: stranger._id });
    await Booking.create({
      type: "location", status: "completed",
      clientInfo: { firstName: "X", lastName: "Y", email: "x@example.test" },
      vehicle: strangerVehicle._id, reference: "VIT-LOC-STRANGER",
    });

    const { req, res } = mockReqRes({ user: owner, query: {} });
    await exportPartnerBookings(req, res);
    const csv = res.send.mock.calls[0][0];
    expect(csv).not.toContain("VIT-LOC-STRANGER");
  });
});

describe("exportPartnerIETransactions", () => {
  it("renvoie un CSV avec les transactions du partenaire", async () => {
    const partner = await createUser({ isFounder: true });
    await createIETransaction({ partner: partner._id, payment: { amount: 12000, currency: "EUR", method: "virement" } });

    const { req, res } = mockReqRes({ user: partner });
    await exportPartnerIETransactions(req, res);

    expect(res.send).toHaveBeenCalled();
    const csv = res.send.mock.calls[0][0];
    expect(csv).toContain("Reference,Annonce,Statut");
    expect(csv).toContain("12000");
    expect(csv).toContain("EUR");
  });
});
