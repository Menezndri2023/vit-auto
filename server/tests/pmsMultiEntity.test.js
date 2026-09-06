import { describe, it, expect } from "vitest";
import {
  getLeads, createLead, updateLead,
  getQuotes, createQuote,
  getPMSOverview,
} from "../controllers/pmsController.js";
import {
  getPartnerBookings as getPartnerBookingsCtrl,
  getPartnerStats,
} from "../controllers/bookingController.js";
import Lead from "../models/Lead.js";
import Quote from "../models/Quote.js";
import { createUser, createVehicleDoc, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Un partenaire opérant plusieurs entités (PartnerBusiness) doit pouvoir
// cloisonner ses leads/devis/commandes par entité — voir PartnerBusiness.js
// et pmsController/bookingController (paramètre businessId).
describe("Segmentation multi-entité (PartnerBusiness) — leads", () => {
  it("createLead rattache le businessId choisi s'il appartient bien au partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const { req, res } = mockReqRes({
      user: partner,
      body: { buyer: { name: "Client" }, businessId: business._id.toString() },
    });
    await createLead(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.businessId.toString()).toBe(business._id.toString());
  });

  it("createLead refuse un businessId appartenant à un autre partenaire (IDOR)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const other = await createUser({ role: "partenaire" });
    const otherBusiness = await makeTestPartnerBusiness(other._id);
    const { req, res } = mockReqRes({
      user: partner,
      body: { buyer: { name: "Client" }, businessId: otherBusiness._id.toString() },
    });
    await createLead(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("createLead hérite du businessId du véhicule ciblé si aucune entité n'est explicitement choisie", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const vehicle = await createVehicleDoc({ owner: partner._id, business: business._id });
    const { req, res } = mockReqRes({
      user: partner,
      body: { buyer: { name: "Client" }, vehicle: { listingId: vehicle._id.toString() } },
    });
    await createLead(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.businessId.toString()).toBe(business._id.toString());
  });

  it("updateLead peut désenregistrer le businessId (valeur vide envoyée par le sélecteur d'entité)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const lead = await Lead.create({ partnerId: partner._id, buyer: { name: "Client" }, businessId: business._id });

    const { req, res } = mockReqRes({ user: partner, params: { id: lead._id.toString() }, body: { businessId: "" } });
    await updateLead(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.businessId).toBeNull();
  });

  it("getLeads filtre par businessId et ignore les leads des autres entités", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    await Lead.create({ partnerId: partner._id, buyer: { name: "A1" }, businessId: businessA._id });
    await Lead.create({ partnerId: partner._id, buyer: { name: "A2" }, businessId: businessA._id });
    await Lead.create({ partnerId: partner._id, buyer: { name: "B1" }, businessId: businessB._id });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessA._id.toString() } });
    await getLeads(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.leads.every((l) => l.businessId.toString() === businessA._id.toString())).toBe(true);
  });

  it("getLeads ignore silencieusement un businessId appartenant à un autre partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const other = await createUser({ role: "partenaire" });
    const otherBusiness = await makeTestPartnerBusiness(other._id);
    await Lead.create({ partnerId: partner._id, buyer: { name: "Mine" } });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: otherBusiness._id.toString() } });
    await getLeads(req, res);
    expect(res.statusCode).toBe(200);
    // Filtre ignoré (hors périmètre) → tous les leads du partenaire renvoyés, pas 0.
    expect(res.body.total).toBe(1);
  });
});

describe("Segmentation multi-entité (PartnerBusiness) — devis", () => {
  it("createQuote hérite du businessId du lead d'origine si aucune entité n'est explicitement choisie", async () => {
    const partner = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(partner._id);
    const lead = await Lead.create({ partnerId: partner._id, buyer: { name: "Client" }, businessId: business._id });

    const { req, res } = mockReqRes({
      user: partner,
      body: { leadId: lead._id.toString(), buyer: { name: "Client" }, lines: [{ description: "Véhicule", qty: 1, unitPrice: 1000 }] },
    });
    await createQuote(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.businessId.toString()).toBe(business._id.toString());
  });

  it("createQuote refuse un businessId appartenant à un autre partenaire (IDOR)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const other = await createUser({ role: "partenaire" });
    const otherBusiness = await makeTestPartnerBusiness(other._id);
    const { req, res } = mockReqRes({
      user: partner,
      body: { buyer: { name: "Client" }, lines: [{ description: "Véhicule", qty: 1, unitPrice: 1000 }], businessId: otherBusiness._id.toString() },
    });
    await createQuote(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("getQuotes filtre par businessId", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    await Quote.create({ partnerId: partner._id, buyer: { name: "A" }, businessId: businessA._id, lines: [{ description: "x", qty: 1, unitPrice: 100 }] });
    await Quote.create({ partnerId: partner._id, buyer: { name: "B" }, businessId: businessB._id, lines: [{ description: "x", qty: 1, unitPrice: 100 }] });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessB._id.toString() } });
    await getQuotes(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.quotes[0].businessId.toString()).toBe(businessB._id.toString());
  });
});

describe("Segmentation multi-entité (PartnerBusiness) — overview & commandes", () => {
  it("getPMSOverview ne compte que les leads/devis/véhicules de l'entité choisie", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    await Lead.create({ partnerId: partner._id, buyer: { name: "A" }, businessId: businessA._id });
    await Lead.create({ partnerId: partner._id, buyer: { name: "B" }, businessId: businessB._id });
    await createVehicleDoc({ owner: partner._id, business: businessA._id });
    await createVehicleDoc({ owner: partner._id, business: businessB._id });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessA._id.toString() } });
    await getPMSOverview(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.leadsStats.total).toBe(1);
    expect(res.body.vehicles.total).toBe(1);
  });

  it("getPartnerStats (bookingController) segmente le chiffre d'affaires par entité via le véhicule", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    const vehicleA = await createVehicleDoc({ owner: partner._id, business: businessA._id });
    const vehicleB = await createVehicleDoc({ owner: partner._id, business: businessB._id });
    const { Booking } = await import("../models/Booking.js").then((m) => ({ Booking: m.default }));
    await Booking.create({ type: "location", vehicle: vehicleA._id, status: "completed", adminValidation: { status: "approved" }, montantTotal: 1000, clientInfo: { firstName: "A", lastName: "B", email: "a@b.test", passportNumber: "P1234567" } });
    await Booking.create({ type: "location", vehicle: vehicleB._id, status: "completed", adminValidation: { status: "approved" }, montantTotal: 5000, clientInfo: { firstName: "A", lastName: "B", email: "a@b.test", passportNumber: "P1234567" } });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessA._id.toString() } });
    await getPartnerStats(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.totalRevenue).toBe(1000);
  });

  it("getPartnerBookings (bookingController) filtre par entité via le chauffeur aussi", async () => {
    const partner = await createUser({ role: "partenaire" });
    const businessA = await makeTestPartnerBusiness(partner._id);
    const businessB = await makeTestPartnerBusiness(partner._id, { isDefault: false });
    const vehicleA = await createVehicleDoc({ owner: partner._id, business: businessA._id });
    const vehicleB = await createVehicleDoc({ owner: partner._id, business: businessB._id });
    const { Booking } = await import("../models/Booking.js").then((m) => ({ Booking: m.default }));
    await Booking.create({ type: "location", vehicle: vehicleA._id, status: "pending", adminValidation: { status: "approved" }, clientInfo: { firstName: "A", lastName: "B", email: "a@b.test", passportNumber: "P1234567" } });
    await Booking.create({ type: "location", vehicle: vehicleB._id, status: "pending", adminValidation: { status: "approved" }, clientInfo: { firstName: "A", lastName: "B", email: "a@b.test", passportNumber: "P1234567" } });

    const { req, res } = mockReqRes({ user: partner, query: { businessId: businessB._id.toString() } });
    await getPartnerBookingsCtrl(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.bookings[0].vehicle._id.toString()).toBe(vehicleB._id.toString());
  });
});
