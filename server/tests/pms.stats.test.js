import { describe, it, expect } from "vitest";
import { getPerformanceScore, getAdminPMSStats, getAdminShowrooms, getPMSOverview } from "../controllers/pmsController.js";
import Lead from "../models/Lead.js";
import Quote from "../models/Quote.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import Booking from "../models/Booking.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function createLead(partnerId, overrides = {}) {
  return Lead.create({ partnerId, ...overrides });
}
async function createQuote(partnerId, overrides = {}) {
  return Quote.create({
    partnerId,
    lines: [{ description: "Ligne", qty: 1, unitPrice: 1000 }],
    ...overrides,
  });
}

describe("getPerformanceScore", () => {
  it("score 0 sans aucune activité", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner });
    await getPerformanceScore(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.totalOrders).toBe(0);
  });

  it("calcule les taux à partir des leads/devis/commandes réels du partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const otherPartner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });

    await createLead(partner._id, { status: "gagne" });
    await createLead(partner._id, { status: "perdu" });
    await createQuote(partner._id, { status: "accepte" });
    await createQuote(partner._id, { status: "envoye" });
    await Booking.create({ type: "location", vehicle: vehicle._id, status: "completed", adminValidation: { status: "approved" }, clientInfo: { firstName: "A", lastName: "B", email: "a@b.test" , passportNumber: "P1234567"} });
    await Booking.create({ type: "location", vehicle: vehicle._id, status: "cancelled", adminValidation: { status: "approved" }, clientInfo: { firstName: "A", lastName: "B", email: "a@b.test" , passportNumber: "P1234567"} });
    // Activité d'un autre partenaire — ne doit pas être comptée.
    await createLead(otherPartner._id, { status: "gagne" });

    const { req, res } = mockReqRes({ user: partner });
    await getPerformanceScore(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.totalOrders).toBe(2);
    expect(res.body.completed).toBe(1);
    expect(res.body.cancelled).toBe(1);
    expect(res.body.leadsTotal).toBe(2);
    expect(res.body.leadsWon).toBe(1);
    expect(res.body.conversionRate).toBe(50);
    expect(res.body.completionRate).toBe(50);
    expect(res.body.score).toBeGreaterThan(0);
  });

  it("répercute le score calculé sur le trustScore du showroom du partenaire", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    await Booking.create({ type: "location", vehicle: vehicle._id, status: "completed", clientInfo: { firstName: "A", lastName: "B", email: "a@b.test" , passportNumber: "P1234567"} });
    await PartnerShowroom.create({ partnerId: partner._id });

    const { req, res } = mockReqRes({ user: partner });
    await getPerformanceScore(req, res);
    // findOneAndUpdate(...).exec() n'est pas attendu par le controller (fire-and-forget) —
    // laisser le temps à la promesse de se résoudre avant de vérifier.
    await new Promise((r) => setTimeout(r, 50));
    const showroom = await PartnerShowroom.findOne({ partnerId: partner._id });
    expect(showroom.trustScore.overall).toBe(res.body.score);
  });
});

describe("getAdminPMSStats", () => {
  it("agrège les compteurs globaux tous partenaires confondus", async () => {
    const partner1 = await createUser({ role: "partenaire" });
    const partner2 = await createUser({ role: "partenaire" });
    await PartnerShowroom.create({ partnerId: partner1._id, isPublished: true });
    await PartnerShowroom.create({ partnerId: partner2._id, isPublished: false });
    await createLead(partner1._id, { status: "gagne" });
    await createLead(partner2._id, { status: "en_discussion" });
    await createQuote(partner1._id, { status: "accepte" });

    const { req, res } = mockReqRes({});
    await getAdminPMSStats(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.totalShowrooms).toBe(2);
    expect(res.body.publishedShowrooms).toBe(1);
    expect(res.body.totalLeads).toBe(2);
    expect(res.body.wonLeads).toBe(1);
    expect(res.body.totalQuotes).toBe(1);
    expect(res.body.acceptedQuotes).toBe(1);
  });
});

describe("getAdminShowrooms", () => {
  it("filtre par statut de publication et pagine", async () => {
    const partner1 = await createUser({ role: "partenaire" });
    const partner2 = await createUser({ role: "partenaire" });
    await PartnerShowroom.create({ partnerId: partner1._id, isPublished: true });
    await PartnerShowroom.create({ partnerId: partner2._id, isPublished: false });

    const { req, res } = mockReqRes({ query: { published: "true" } });
    await getAdminShowrooms(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.showrooms).toHaveLength(1);
    expect(res.body.showrooms[0].partnerId._id.toString()).toBe(partner1._id.toString());
  });
});

// Bug réel corrigé (audit) : quotesStats.envoye ne comptait que le statut
// "envoye" — dès qu'un acheteur ouvre le lien public d'un devis (respondPublicQuote),
// son statut passe à "vu" et il disparaissait du compteur "Devis envoyés",
// pourtant bien envoyé.
describe("getPMSOverview — quotesStats", () => {
  it("compte les devis 'vu' comme envoyés (pas seulement 'envoye')", async () => {
    const partner = await createUser({ role: "partenaire" });
    await createQuote(partner._id, { status: "envoye" });
    await createQuote(partner._id, { status: "vu" });
    await createQuote(partner._id, { status: "vu" });
    await createQuote(partner._id, { status: "brouillon" });

    const { req, res } = mockReqRes({ user: partner });
    await getPMSOverview(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.quotesStats.envoye).toBe(3);
    expect(res.body.quotesStats.brouillon).toBe(1);
    expect(res.body.quotesStats.total).toBe(4);
  });
});
