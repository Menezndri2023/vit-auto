import { describe, it, expect } from "vitest";
import { updateBookingStatus } from "../controllers/bookingController.js";
import { getMyPayouts, adminListPayouts, adminMarkPaid } from "../controllers/commissionLedgerController.js";
import { recordPartnerPayout } from "../utils/commissionLedger.js";
import CommissionLedger from "../models/CommissionLedger.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

async function makeBooking(overrides = {}) {
  const client  = await createUser({ role: "client" });
  const partner = await createUser({ role: "partenaire" });
  const vehicle = await createVehicleDoc({ owner: partner._id });
  const booking = await Booking.create({
    type: "location", status: "confirmed", client: client._id, clientInfo,
    vehicle: vehicle._id,
    location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    montantBase: 20000, montantTotal: 20000, commissionRate: 0.15, commissionAmount: 3000, partnerPayout: 17000,
    ...overrides,
  });
  return { client, partner, vehicle, booking };
}

// Bug réel corrigé (audit) : CommissionLedger existait déjà en base (schéma
// complet pending/paid, paidAt, paidViaTxId) mais n'était jamais instancié
// nulle part — un partenaire n'avait aucune trace de ce qui lui était
// réellement dû vs déjà versé.
describe("recordPartnerPayout — création automatique à la complétion d'une commande", () => {
  it("crée une entrée de reversement quand une commande passe à 'completed'", async () => {
    const { booking, partner } = await makeBooking({ status: "waiting_client_validation" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: booking._id.toString() }, body: { status: "completed" } });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);

    const entry = await CommissionLedger.findOne({ transactionId: booking._id.toString() });
    expect(entry).toBeTruthy();
    expect(entry.partnerId.toString()).toBe(partner._id.toString());
    expect(entry.commissionAmount).toBe(17000);
    expect(entry.status).toBe("pending");
  });

  it("ne crée jamais deux entrées pour la même commande (idempotent, upsert)", async () => {
    const { booking, partner } = await makeBooking({ status: "completed" });
    const populated = await Booking.findById(booking._id).populate("vehicle", "owner");

    // Appelé deux fois (ex: complétion atteinte par deux chemins différents,
    // ou rejoué par erreur) — une seule entrée doit survivre.
    await recordPartnerPayout(populated);
    await recordPartnerPayout(populated);

    const entries = await CommissionLedger.find({ transactionId: booking._id.toString() });
    expect(entries).toHaveLength(1);
    expect(entries[0].partnerId.toString()).toBe(partner._id.toString());
  });

  it("ne crée rien si partnerPayout est nul ou absent", async () => {
    const { booking } = await makeBooking({ status: "waiting_client_validation", partnerPayout: 0 });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: booking._id.toString() }, body: { status: "completed" } });
    await updateBookingStatus(req, res);

    const entry = await CommissionLedger.findOne({ transactionId: booking._id.toString() });
    expect(entry).toBeNull();
  });
});

describe("getMyPayouts — le partenaire voit ce qui lui est dû vs déjà versé", () => {
  it("distingue les totaux 'pending' et 'paid'", async () => {
    const partner = await createUser({ role: "partenaire" });
    await CommissionLedger.create({
      transactionId: "tx1", transactionType: "booking", partnerId: partner._id,
      grossAmount: 20000, commissionRate: 15, commissionAmount: 17000, type: "partner_direct", status: "pending",
    });
    await CommissionLedger.create({
      transactionId: "tx2", transactionType: "booking", partnerId: partner._id,
      grossAmount: 10000, commissionRate: 15, commissionAmount: 8500, type: "partner_direct", status: "paid",
    });

    const { req, res } = mockReqRes({ user: partner, query: {} });
    await getMyPayouts(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.totals.pending).toBe(17000);
    expect(res.body.totals.paid).toBe(8500);
    expect(res.body.entries).toHaveLength(2);
  });

  it("ne montre jamais les entrées d'un autre partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const other = await createUser({ role: "partenaire" });
    await CommissionLedger.create({
      transactionId: "tx-other", transactionType: "booking", partnerId: other._id,
      grossAmount: 5000, commissionRate: 15, commissionAmount: 4000, type: "partner_direct",
    });

    const { req, res } = mockReqRes({ user: partner, query: {} });
    await getMyPayouts(req, res);
    expect(res.body.entries).toHaveLength(0);
    expect(res.body.totals.pending).toBe(0);
  });
});

describe("adminMarkPaid — trace un virement exécuté manuellement", () => {
  it("marque une entrée comme payée avec la référence de virement", async () => {
    const partner = await createUser({ role: "partenaire" });
    const entry = await CommissionLedger.create({
      transactionId: "tx1", transactionType: "booking", partnerId: partner._id,
      grossAmount: 20000, commissionRate: 15, commissionAmount: 17000, type: "partner_direct", status: "pending",
    });

    const { req, res } = mockReqRes({ params: { id: entry._id.toString() }, body: { paidViaTxId: "MOOV-XYZ123" } });
    await adminMarkPaid(req, res);

    expect(res.statusCode).toBe(200);
    const reloaded = await CommissionLedger.findById(entry._id);
    expect(reloaded.status).toBe("paid");
    expect(reloaded.paidViaTxId).toBe("MOOV-XYZ123");
    expect(reloaded.paidAt).toBeTruthy();
  });

  it("refuse de re-marquer une entrée déjà payée", async () => {
    const partner = await createUser({ role: "partenaire" });
    const entry = await CommissionLedger.create({
      transactionId: "tx1", transactionType: "booking", partnerId: partner._id,
      grossAmount: 20000, commissionRate: 15, commissionAmount: 17000, type: "partner_direct",
      status: "paid", paidAt: new Date(),
    });
    const { req, res } = mockReqRes({ params: { id: entry._id.toString() }, body: {} });
    await adminMarkPaid(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("404 pour une entrée inexistante", async () => {
    const { req, res } = mockReqRes({ params: { id: "000000000000000000000000" }, body: {} });
    await adminMarkPaid(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("adminListPayouts — filtre par partenaire et statut", () => {
  it("filtre par statut", async () => {
    const partner = await createUser({ role: "partenaire" });
    await CommissionLedger.create({
      transactionId: "tx1", transactionType: "booking", partnerId: partner._id,
      grossAmount: 20000, commissionRate: 15, commissionAmount: 17000, type: "partner_direct", status: "pending",
    });
    await CommissionLedger.create({
      transactionId: "tx2", transactionType: "booking", partnerId: partner._id,
      grossAmount: 10000, commissionRate: 15, commissionAmount: 8500, type: "partner_direct", status: "paid",
    });

    const { req, res } = mockReqRes({ query: { status: "paid" } });
    await adminListPayouts(req, res);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].status).toBe("paid");
  });

  // Bug réel corrigé (audit) : partnerId venait directement de req.query sans
  // validation — un id malformé déclenchait un CastError non intercepté (500
  // opaque) au lieu d'un 400 clair, seul paramètre id de ce controller à ne
  // pas être gardé alors que tous les autres (businessId ailleurs) le sont.
  it("400 sur un partnerId malformé au lieu d'un CastError non intercepté", async () => {
    const { req, res } = mockReqRes({ query: { partnerId: "not-an-object-id" } });
    await adminListPayouts(req, res);
    expect(res.statusCode).toBe(400);
  });
});
