import { describe, it, expect } from "vitest";
import {
  generatePartnerInvoice, generateAllMonthlyInvoices, getMyInvoices, getAllInvoices,
} from "../controllers/invoiceController.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function createInvoiceableBooking(vehicle, { year = 2026, month = 6, ...overrides } = {}) {
  return Booking.create({
    type: "location",
    clientInfo: { firstName: "Client", lastName: "Test", email: "client@example.test", passportNumber: "P1234567" },
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

// Un partenaire opérant plusieurs entités (PartnerBusiness) doit recevoir une
// facture PAR ENTITÉ et par mois, pas une seule facture mélangeant tout —
// voir Invoice.businessId et invoiceController.
describe("Segmentation multi-entité (PartnerBusiness) — facturation", () => {
  it("generatePartnerInvoice ne facture que les véhicules de l'entité demandée", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    const vehicleA = await createVehicleDoc({ owner: partner._id, business: businessA._id });
    const vehicleB = await createVehicleDoc({ owner: partner._id, business: businessB._id });
    await createInvoiceableBooking(vehicleA, { commissionAmount: 15000 });
    await createInvoiceableBooking(vehicleB, { commissionAmount: 99999 });

    const { req, res } = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026, businessId: businessA._id.toString() } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.invoice.totalCommission).toBe(15000);
    expect(res.body.invoice.businessId.toString()).toBe(businessA._id.toString());
  });

  it("refuse un businessId n'appartenant pas à ce partenaire (IDOR)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const other = await createUser({ role: "partenaire" });
    const otherBusiness = await makeTestPartnerBusiness(other._id);

    const { req, res } = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026, businessId: otherBusiness._id.toString() } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("permet une facture distincte par entité pour le même partenaire/mois (l'ancien index unique bloquait ça)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    const vehicleA = await createVehicleDoc({ owner: partner._id, business: businessA._id });
    const vehicleB = await createVehicleDoc({ owner: partner._id, business: businessB._id });
    await createInvoiceableBooking(vehicleA);
    await createInvoiceableBooking(vehicleB);

    const first = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026, businessId: businessA._id.toString() } });
    await generatePartnerInvoice(first.req, first.res);
    expect(first.res.statusCode).toBe(201);

    const second = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026, businessId: businessB._id.toString() } });
    await generatePartnerInvoice(second.req, second.res);
    expect(second.res.statusCode).toBe(201);
  });

  it("sans businessId, ne facture que les véhicules sans entité assignée (pas ceux d'une entité)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const vehicleNoEntity = await createVehicleDoc({ owner: partner._id });
    const vehicleEntity   = await createVehicleDoc({ owner: partner._id, business: business._id });
    await createInvoiceableBooking(vehicleNoEntity, { commissionAmount: 15000 });
    await createInvoiceableBooking(vehicleEntity, { commissionAmount: 99999 });

    const { req, res } = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await generatePartnerInvoice(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.invoice.totalCommission).toBe(15000);
    expect(res.body.invoice.businessId).toBeNull();
  });

  it("generateAllMonthlyInvoices génère une facture PAR ENTITÉ pour un partenaire multi-entités", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    const vehicleA = await createVehicleDoc({ owner: partner._id, business: businessA._id });
    const vehicleB = await createVehicleDoc({ owner: partner._id, business: businessB._id });
    await createInvoiceableBooking(vehicleA, { commissionAmount: 15000 });
    await createInvoiceableBooking(vehicleB, { commissionAmount: 25000 });

    const { req, res } = mockReqRes({ body: { month: 6, year: 2026 } });
    await generateAllMonthlyInvoices(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.generated).toBe(2);
    const businessIds = res.body.results.filter((r) => r.status === "created").map((r) => r.businessId);
    expect(businessIds.sort()).toEqual([businessA._id.toString(), businessB._id.toString()].sort());
  });

  it("getMyInvoices filtre par businessId", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const vehicleA = await createVehicleDoc({ owner: partner._id, business: businessA._id });
    const vehicleNoEntity = await createVehicleDoc({ owner: partner._id });
    await createInvoiceableBooking(vehicleA);
    await createInvoiceableBooking(vehicleNoEntity);

    const gen = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026, businessId: businessA._id.toString() } });
    await generatePartnerInvoice(gen.req, gen.res);
    expect(gen.res.statusCode).toBe(201);

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessA._id.toString() } });
    await getMyInvoices(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0].businessId._id.toString()).toBe(businessA._id.toString());
  });

  it("getAllInvoices (admin) filtre par businessId", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    const { default: Invoice } = await import("../models/Invoice.js");
    await Invoice.create({ reference: "FACT-2026-100001", partner: partner._id, businessId: businessA._id, month: 6, year: 2026, lines: [], totalCommission: 1000, dueDate: new Date() });
    await Invoice.create({ reference: "FACT-2026-100002", partner: partner._id, businessId: businessB._id, month: 6, year: 2026, lines: [], totalCommission: 2000, dueDate: new Date() });

    const { req, res } = mockReqRes({ query: { businessId: businessB._id.toString() } });
    await getAllInvoices(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.invoices[0].reference).toBe("FACT-2026-100002");
  });

  // Bug réel corrigé (audit) : deux requêtes concurrentes (double clic admin)
  // pouvaient toutes deux passer le pré-check applicatif ("existing = await
  // Invoice.findOne(...)") avant qu'aucune n'ait fini d'écrire, créant deux
  // factures pour le même partenaire/entité/mois. L'index unique
  // {partner, businessId, year, month} est le VRAI filet de sécurité — le
  // controller doit intercepter le E11000 qui en résulte et répondre 409 au
  // lieu de laisser planter en 500.
  it("une seule facture survit à deux générations concurrentes pour le même partenaire/entité/mois", async () => {
    // L'index unique n'est réellement actif qu'une fois sa construction
    // terminée (autoIndex est asynchrone, non bloquant pour les écritures —
    // voir server.js démarrage) : sans ce .init(), les deux écritures
    // concurrentes ci-dessous peuvent toutes deux réussir dans un
    // environnement de test tout frais où l'index n'a pas encore fini de se
    // construire, ce qui ne teste alors plus la garantie réelle de
    // production (où l'index existe déjà en régime établi).
    const { default: Invoice } = await import("../models/Invoice.js");
    await Invoice.init();

    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    // Deux réservations distinctes — chaque coureur doit trouver au moins une
    // transaction facturable, peu importe l'ordre d'exécution, pour que le
    // test exerce vraiment la collision sur Invoice.create (pas seulement le
    // 404 "rien à facturer" si l'autre a déjà tout pris).
    await createInvoiceableBooking(vehicle);
    await createInvoiceableBooking(vehicle);

    const first  = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    const second = mockReqRes({ body: { partnerId: partner._id.toString(), month: 6, year: 2026 } });
    await Promise.all([
      generatePartnerInvoice(first.req, first.res),
      generatePartnerInvoice(second.req, second.res),
    ]);

    const codes = [first.res.statusCode, second.res.statusCode].sort();
    // L'un des deux réussit (201), l'autre est rejeté proprement — soit par le
    // pré-check applicatif (409, aucune transaction disponible car déjà prise
    // par le gagnant → 404 est aussi un résultat valide de la course), soit
    // par l'index unique (409). Ce qui ne doit JAMAIS arriver : un 500, ou
    // deux 201.
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.every((c) => [201, 404, 409].includes(c))).toBe(true);

    const count = await Invoice.countDocuments({ partner: partner._id, month: 6, year: 2026 });
    expect(count).toBe(1);
  });
});
