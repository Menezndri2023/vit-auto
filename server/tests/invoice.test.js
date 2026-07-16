import { describe, it, expect } from "vitest";
import {
  generatePartnerInvoice, getMyInvoices, getAllInvoices,
  markInvoicePaid, getAdminCommissions,
} from "../controllers/invoiceController.js";
import Booking from "../models/Booking.js";
import Invoice from "../models/Invoice.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Booking pour un mois donné, marquée completed+payée, pas encore facturée —
// le cas nominal que generatePartnerInvoice doit retrouver.
async function createInvoiceableBooking(vehicle, { year = 2026, month = 6, ...overrides } = {}) {
  return Booking.create({
    type: "location",
    clientInfo: { firstName: "Client", lastName: "Test", email: "client@example.test" },
    vehicle: vehicle._id,
    status: "completed",
    invoiced: false,
    paidAt: new Date(year, month - 1, 15),
    montantTotal: 100000,
    commissionRate: 0.15,
    commissionAmount: 15000,
    devise: "XOF",
    ...overrides,
  });
}

describe("generatePartnerInvoice", () => {
  it("404 si le partenaire est introuvable ou n'a pas le bon rôle", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ body: { partnerId: client._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("403 si le compte partenaire est désactivé", async () => {
    const partner = await createUser({ role: "partenaire", isActive: false });
    const { req, res } = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("404 si aucune transaction facturable sur la période", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("génère la facture, calcule la commission totale et marque les commandes facturées", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    const b1 = await createInvoiceableBooking(vehicle, { commissionAmount: 15000 });
    const b2 = await createInvoiceableBooking(vehicle, { commissionAmount: 25000 });
    // Hors période (mois différent) — ne doit pas être inclus.
    await createInvoiceableBooking(vehicle, { month: 5, commissionAmount: 99999 });
    // Déjà facturée — ne doit pas être incluse non plus.
    await createInvoiceableBooking(vehicle, { invoiced: true, commissionAmount: 88888 });

    const { req, res } = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.invoice.totalCommission).toBe(40000);
    expect(res.body.invoice.lines).toHaveLength(2);
    expect(res.body.invoice.reference).toMatch(/^FACT-2026-\d{6}$/);

    const reloaded1 = await Booking.findById(b1._id);
    const reloaded2 = await Booking.findById(b2._id);
    expect(reloaded1.invoiced).toBe(true);
    expect(reloaded1.invoice.toString()).toBe(res.body.invoice._id.toString());
    expect(reloaded2.invoiced).toBe(true);
  });

  it("409 si une facture existe déjà pour ce partenaire et cette période", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    await createInvoiceableBooking(vehicle);

    const first = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(first.req, first.res);
    expect(first.res.statusCode).toBe(201);

    await createInvoiceableBooking(vehicle);
    const second = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(second.req, second.res);
    expect(second.res.statusCode).toBe(409);
  });

  it("les références de facture sont uniques et incrémentales pour une même année", async () => {
    const partner1 = await createUser({ role: "partenaire" });
    const vehicle1 = await createVehicleDoc({ owner: partner1._id });
    await createInvoiceableBooking(vehicle1);
    const r1 = mockReqRes({ body: { partnerId: partner1._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(r1.req, r1.res);

    const partner2 = await createUser({ role: "partenaire" });
    const vehicle2 = await createVehicleDoc({ owner: partner2._id });
    await createInvoiceableBooking(vehicle2);
    const r2 = mockReqRes({ body: { partnerId: partner2._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(r2.req, r2.res);

    expect(r1.res.body.invoice.reference).not.toBe(r2.res.body.invoice.reference);
  });
});

describe("getMyInvoices / getAllInvoices", () => {
  it("un partenaire ne voit que ses propres factures", async () => {
    const partner1 = await createUser({ role: "partenaire" });
    const partner2 = await createUser({ role: "partenaire" });
    await Invoice.create({ reference: "FACT-2026-000001", partner: partner1._id, month: 6, year: 2026, lines: [], totalCommission: 1000, dueDate: new Date() });
    await Invoice.create({ reference: "FACT-2026-000002", partner: partner2._id, month: 6, year: 2026, lines: [], totalCommission: 2000, dueDate: new Date() });

    const { req, res } = mockReqRes({ user: partner1 });
    await getMyInvoices(req, res);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0].reference).toBe("FACT-2026-000001");
  });

  it("getAllInvoices calcule totalPaid/totalPending sur l'ensemble", async () => {
    const partner = await createUser({ role: "partenaire" });
    await Invoice.create({ reference: "FACT-2026-000010", partner: partner._id, month: 6, year: 2026, lines: [], totalCommission: 1000, status: "paid", dueDate: new Date() });
    await Invoice.create({ reference: "FACT-2026-000011", partner: partner._id, month: 6, year: 2026, lines: [], totalCommission: 2000, status: "pending", dueDate: new Date() });

    const { req, res } = mockReqRes({ query: {} });
    await getAllInvoices(req, res);
    expect(res.body.totalPaid).toBe(1000);
    expect(res.body.totalPending).toBe(2000);
  });
});

describe("markInvoicePaid", () => {
  it("marque une facture payée et rejette un second appel (déjà payée)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const invoice = await Invoice.create({
      reference: "FACT-2026-000020", partner: partner._id, month: 6, year: 2026,
      lines: [], totalCommission: 5000, dueDate: new Date(), status: "pending",
    });

    const { req, res } = mockReqRes({ params: { id: invoice._id.toString() }, body: { paymentMethod: "virement" } });
    await markInvoicePaid(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.invoice.status).toBe("paid");
    expect(res.body.invoice.paidAt).toBeTruthy();

    const { req: req2, res: res2 } = mockReqRes({ params: { id: invoice._id.toString() }, body: {} });
    await markInvoicePaid(req2, res2);
    expect(res2.statusCode).toBe(409);
  });

  it("404 pour un id invalide ou inexistant", async () => {
    const { req, res } = mockReqRes({ params: { id: "not-an-object-id" }, body: {} });
    await markInvoicePaid(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("getAdminCommissions", () => {
  it("agrège commissions et transactions, filtrées par mois/année", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    await createInvoiceableBooking(vehicle, { commissionAmount: 15000, montantTotal: 100000 });
    await createInvoiceableBooking(vehicle, { month: 5, commissionAmount: 99999 }); // hors filtre

    const { req, res } = mockReqRes({ query: { year: "2026", month: "6" } });
    await getAdminCommissions(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.totalCommissions).toBe(15000);
    expect(res.body.totalTransactions).toBe(100000);
  });
});
