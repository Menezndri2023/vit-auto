import { describe, it, expect, beforeEach } from "vitest";
import SalesLead from "../models/SalesLead.js";
import CommissionLedger from "../models/CommissionLedger.js";
import Notification from "../models/Notification.js";
import Vehicle from "../models/Vehicle.js";
import ExchangeRate from "../models/ExchangeRate.js";
import * as c from "../controllers/salesLeadController.js";
import * as svc from "../services/salesLeadService.js";
import { runSalesLeadScheduler } from "../utils/salesLeadScheduler.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";

// Vente par demande d'essai — docs/vente-demande-essai.md.
// Contrôleurs appelés directement sur la base en mémoire (voir mockReqRes).

const tomorrow = () => { const d = new Date(Date.now() + 2 * 86400000); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10); };

let phoneSeq = 0;
async function setup({ price = 8000, country = "CI" } = {}) {
  const partner = await createUser({ role: "partenaire", phone: `+22507000${String(++phoneSeq).padStart(5, "0")}`, country });
  const admin   = await createUser({ role: "admin", adminScopes: ["super_admin"] });
  const vehicle = await createVehicleDoc({ owner: partner._id, type: "vente", priceForSale: price, pricePerDay: undefined, country, ville: "Abidjan" });
  return { partner, admin, vehicle };
}

const form = (vehicleId, extra = {}) => ({
  vehicleId: vehicleId.toString(), firstName: "Awa", lastName: "Koné", phone: "+225 07 00 00 00 99",
  city: "Abidjan", date: tomorrow(), slot: "morning", message: "Dispo le matin", consent: true, ...extra,
});

async function createViaController(vehicle, body = {}, user = null) {
  const { req, res } = mockReqRes({ body: form(vehicle._id, body), user });
  await c.createLead(req, res);
  return res;
}

describe("Demande d'essai — création, qualification, transmission", () => {
  it("crée un lead VA-LEAD-AAAA-NNNNNN lié client/véhicule/partenaire et le transmet (niveau 1)", async () => {
    const { partner, vehicle } = await setup();
    const res = await createViaController(vehicle);
    expect(res.statusCode).toBe(201);
    const lead = await SalesLead.findOne({ reference: res.body.lead.reference });
    expect(lead.reference).toMatch(/^VA-LEAD-\d{4}-\d{6}$/);
    expect(lead.partner.toString()).toBe(partner._id.toString());
    expect(lead.vehicle.toString()).toBe(vehicle._id.toString());
    expect(lead.source).toBe("vit_auto");
    expect(lead.qualification.level).toBe(1);
    expect(lead.status).toBe("SENT_TO_PARTNER");
    expect(lead.milestones.sentToPartnerAt).toBeTruthy();
    expect(lead.attribution.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86400000);
    expect(lead.history.map((h) => h.action)).toEqual(expect.arrayContaining(["lead_created", "lead_qualified", "lead_sent_to_partner"]));
    // Le partenaire est notifié (in-app), avec le bon type de notification.
    const notif = await Notification.findOne({ user: partner._id, type: "sales_lead" });
    expect(notif?.titre).toContain("Nouvelle demande d'essai");
    // Invité : lien d'accès signé renvoyé.
    expect(res.body.accessPath).toContain(`?t=${lead.clientAccessToken}`);
    // Coordonnées jamais renvoyées dans la vue client (jeton), ni exposées avant divulgation côté partenaire.
    expect(res.body.lead.clientAccessToken).toBeUndefined();
  });

  it("refuse sans consentement, sans téléphone, hors véhicule vente, et sur un véhicule à l'étranger", async () => {
    const { vehicle } = await setup();
    let r = await createViaController(vehicle, { consent: false });
    expect(r.statusCode).toBe(400); expect(r.body.code).toBe("CONSENT_REQUIRED");
    r = await createViaController(vehicle, { phone: "" });
    expect(r.statusCode).toBe(400);

    const loc = await createVehicleDoc({ type: "location" });
    r = await createViaController(loc);
    expect(r.statusCode).toBe(400); expect(r.body.code).toBe("NOT_FOR_SALE");

    // Véhicule situé dans un pays d'origine d'import, client ailleurs.
    const { vehicle: abroad } = await setup({ country: "AE" });
    r = await createViaController(abroad, { country: "CI" });
    expect(r.statusCode).toBe(400); expect(r.body.code).toBe("IMPORT_VEHICLE_NO_TEST_DRIVE");
  });

  it("qualifie en niveau 2 (prix moyen) sans transmettre, puis l'admin transmet ; niveau 3 pour forte valeur", async () => {
    const { partner, vehicle, admin } = await setup({ price: 20000 });
    const r = await createViaController(vehicle);
    let lead = await SalesLead.findOne({ reference: r.body.lead.reference });
    expect(lead.qualification.level).toBe(2);
    expect(lead.status).toBe("QUALIFYING");
    expect(lead.qualification.autoSendAt).toBeTruthy();
    // Le partenaire ne la voit pas encore.
    const { req: pr, res: pres } = mockReqRes({ user: partner });
    await c.getPartnerLeads(pr, pres);
    expect(pres.body.leads).toHaveLength(0);
    // Admin notifié.
    expect(await Notification.findOne({ user: admin._id, type: "sales_lead" })).toBeTruthy();

    const { req, res } = mockReqRes({ params: { id: lead._id.toString() }, user: admin, body: { transmit: true } });
    await c.adminQualify(req, res);
    expect(res.statusCode).toBe(200);
    lead = await SalesLead.findById(lead._id);
    expect(lead.status).toBe("SENT_TO_PARTNER");
    expect(lead.qualification.qualifiedBy.toString()).toBe(admin._id.toString());

    const { vehicle: luxe } = await setup({ price: 60000 });
    const r3 = await createViaController(luxe, { phone: "+2250700000077" });
    const lead3 = await SalesLead.findOne({ reference: r3.body.lead.reference });
    expect(lead3.qualification.level).toBe(3);
    expect(lead3.qualification.reasons).toContain("high_value");
    expect(lead3.qualification.autoSendAt).toBeNull();
  });

  it("le planificateur transmet un niveau 2 oublié par l'admin après le délai", async () => {
    const { vehicle } = await setup({ price: 20000 });
    const r = await createViaController(vehicle);
    await SalesLead.updateOne({ reference: r.body.lead.reference }, { $set: { "qualification.autoSendAt": new Date(Date.now() - 1000) } });
    const stats = await runSalesLeadScheduler();
    expect(stats.autoSent).toBe(1);
    const lead = await SalesLead.findOne({ reference: r.body.lead.reference });
    expect(lead.status).toBe("SENT_TO_PARTNER");
  });

  it("ne crée pas de doublon pour le même téléphone sur le même véhicule tant que le dossier est ouvert", async () => {
    const { vehicle } = await setup();
    const a = await createViaController(vehicle);
    const b = await createViaController(vehicle);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(200);
    expect(b.body.duplicate).toBe(true);
    expect(b.body.lead.reference).toBe(a.body.lead.reference);
    expect(await SalesLead.countDocuments()).toBe(1);
  });
});

describe("Demande d'essai — réponse partenaire, rendez-vous, confidentialité", () => {
  let ctx, lead;
  beforeEach(async () => {
    ctx = await setup();
    const r = await createViaController(ctx.vehicle);
    lead = await SalesLead.findOne({ reference: r.body.lead.reference });
  });

  it("masque le téléphone du client au partenaire avant acceptation, le révèle après", async () => {
    const { req, res } = mockReqRes({ user: ctx.partner });
    await c.getPartnerLeads(req, res);
    expect(res.body.leads[0].client.phone).toMatch(/•/);
    expect(res.body.leads[0].client.whatsapp).toBeNull();
    expect(res.body.leads[0].contactDisclosed).toBe(false);

    const { req: ar, res: ares } = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { time: "10:30", address: "Zone 4, Abidjan", instructions: "Apporter votre permis" } });
    await c.partnerAccept(ar, ares);
    expect(ares.statusCode).toBe(200);
    expect(ares.body.lead.status).toBe("TEST_DRIVE_SCHEDULED");
    expect(ares.body.lead.client.phone).toBe("+2250700000099");
    expect(ares.body.lead.contactDisclosed).toBe(true);
    expect(ares.body.lead.appointment.time).toBe("10:30");
    expect(new Date(ares.body.lead.appointment.endAt).getTime() - new Date(ares.body.lead.appointment.date).getTime()).toBe(3600000);

    const updated = await SalesLead.findById(lead._id);
    expect(updated.milestones.scheduledAt).toBeTruthy();
    expect(updated.sla.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(updated.history.map((h) => h.action)).toEqual(expect.arrayContaining(["partner_accepted", "contact_disclosed", "appointment_confirmed"]));
  });

  it("un autre partenaire ne peut pas agir sur le lead", async () => {
    const other = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ params: { id: lead._id.toString() }, user: other, body: { time: "10:00" } });
    await c.partnerAccept(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("autre créneau : le client l'accepte par jeton → essai confirmé ; ou en choisit un autre → retour au partenaire", async () => {
    const altDate = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const { req, res } = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { date: altDate, time: "15:00", note: "Plutôt l'après-midi" } });
    await c.partnerProposeAlternative(req, res);
    expect(res.body.lead.status).toBe("ALTERNATIVE_PROPOSED");

    // Sans jeton : introuvable (aucune fuite d'existence).
    let m = mockReqRes({ params: { reference: lead.reference }, body: { accept: true } });
    await c.clientRespondAlternative(m.req, m.res);
    expect(m.res.statusCode).toBe(404);

    m = mockReqRes({ params: { reference: lead.reference }, query: { t: lead.clientAccessToken }, body: { accept: true } });
    await c.clientRespondAlternative(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    expect(m.res.body.lead.status).toBe("TEST_DRIVE_SCHEDULED");
    expect(m.res.body.lead.appointment.time).toBe("15:00");

    // Second lead : le client refuse et choisit un autre créneau.
    const { vehicle: v2 } = await setup();
    const r2 = await createViaController(v2, { phone: "+2250700000055" });
    const lead2 = await SalesLead.findOne({ reference: r2.body.lead.reference });
    const p2 = mockReqRes({ params: { id: lead2._id.toString() }, user: await createUser({ role: "admin", adminScopes: ["super_admin"] }), body: { date: altDate, time: "09:00" } });
    await c.partnerProposeAlternative(p2.req, p2.res);
    const c2 = mockReqRes({ params: { reference: lead2.reference }, query: { t: lead2.clientAccessToken }, body: { accept: false, newDate: altDate, newSlot: "evening" } });
    await c.clientRespondAlternative(c2.req, c2.res);
    expect(c2.res.statusCode).toBe(200);
    expect(c2.res.body.lead.status).toBe("SENT_TO_PARTNER");
    expect(c2.res.body.lead.requested.slot).toBe("evening");
    const l2 = await SalesLead.findById(lead2._id);
    expect(l2.sla.reminder1SentAt).toBeNull();
  });

  it("refus partenaire → LOST avec motif, client notifié", async () => {
    const { req, res } = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { reason: "vehicle_unavailable" } });
    await c.partnerRefuse(req, res);
    expect(res.body.lead.status).toBe("LOST");
    expect(res.body.lead.lostReason).toBe("Véhicule indisponible");
  });

  it("SLA : rappel, rappel renforcé puis intervention VIT AUTO, une étape par cycle", async () => {
    const past = (h) => new Date(Date.now() - h * 3600000);
    await SalesLead.updateOne({ _id: lead._id }, { $set: { "milestones.sentToPartnerAt": past(30) } });
    let s = await runSalesLeadScheduler();
    expect(s.reminded1).toBe(1);
    s = await runSalesLeadScheduler();
    expect(s.reminded2).toBe(1);
    s = await runSalesLeadScheduler();
    expect(s.escalated).toBe(1);
    s = await runSalesLeadScheduler();
    expect(s.reminded1 + s.reminded2 + s.escalated).toBe(0);
    const l = await SalesLead.findById(lead._id);
    expect(l.sla.escalatedAt).toBeTruthy();
    expect(await Notification.countDocuments({ user: ctx.admin._id, type: "sales_lead" })).toBeGreaterThanOrEqual(1);
  });
});

describe("Demande d'essai — après l'essai, opportunité, vente et commission", () => {
  let ctx, lead;
  beforeEach(async () => {
    await ExchangeRate.create({ code: "USD", name: "Dollar US", symbol: "$", rateFromUSD: 1 });
    await ExchangeRate.create({ code: "XOF", name: "Franc CFA", symbol: "FCFA", rateFromUSD: 600 });
    ctx = await setup();
    const r = await createViaController(ctx.vehicle);
    lead = await SalesLead.findOne({ reference: r.body.lead.reference });
    const a = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { time: "10:00", address: "Agence" } });
    await c.partnerAccept(a.req, a.res);
    lead = await SalesLead.findById(lead._id);
  });

  it("le planificateur demande le résultat au partenaire puis envoie le suivi au client ; le client répond « intéressé »", async () => {
    await SalesLead.updateOne({ _id: lead._id }, { $set: { "appointment.endAt": new Date(Date.now() - 4 * 3600000) } });
    const s = await runSalesLeadScheduler();
    expect(s.outcomeAsked).toBe(1);
    expect(s.followUps).toBe(1);
    let l = await SalesLead.findById(lead._id);
    expect(l.outcome.requestedAt).toBeTruthy();
    expect(l.followUp.sentAt).toBeTruthy();

    const m = mockReqRes({ params: { reference: lead.reference }, query: { t: lead.clientAccessToken }, body: { response: "interested" } });
    await c.clientFollowUp(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    expect(m.res.body.lead.status).toBe("CUSTOMER_INTERESTED");
    l = await SalesLead.findById(lead._id);
    expect(l.milestones.completedAt).toBeTruthy();
    expect(l.milestones.interestedAt).toBeTruthy();
    const notif = await Notification.findOne({ user: ctx.partner._id, titre: /poursuivre son projet/ });
    expect(notif).toBeTruthy();
  });

  it("résultat partenaire : client absent, puis reporté (nouvelle date), puis réalisé + négociation", async () => {
    const id = lead._id.toString();
    let m = mockReqRes({ params: { id }, user: ctx.partner, body: { testDrive: "no_show" } });
    await c.partnerOutcome(m.req, m.res);
    expect(m.res.body.lead.status).toBe("CUSTOMER_NO_SHOW");

    const nd = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    m = mockReqRes({ params: { id }, user: ctx.partner, body: { testDrive: "postponed", newDate: nd, newTime: "11:00" } });
    await c.partnerOutcome(m.req, m.res);
    expect(m.res.body.lead.status).toBe("TEST_DRIVE_SCHEDULED");
    expect(m.res.body.lead.appointment.time).toBe("11:00");

    m = mockReqRes({ params: { id }, user: ctx.partner, body: { testDrive: "completed", commercial: "negotiation" } });
    await c.partnerOutcome(m.req, m.res);
    expect(m.res.body.lead.status).toBe("NEGOTIATION");

    // « Vente conclue » passe obligatoirement par la déclaration avec prix.
    m = mockReqRes({ params: { id }, user: ctx.partner, body: { commercial: "sold" } });
    await c.partnerOutcome(m.req, m.res);
    expect(m.res.statusCode).toBe(400);
    expect(m.res.body.code).toBe("USE_DECLARE_SALE");
  });

  it("vente déclarée en XOF → commission 5 % (partenaire standard) en USD, ledger pending ; admin confirme → SOLD, ledger confirmé, véhicule vendu", async () => {
    const id = lead._id.toString();
    let m = mockReqRes({ params: { id }, user: ctx.partner, body: { finalPrice: 6_000_000, currency: "XOF" } });
    await c.partnerDeclareSale(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    expect(m.res.body.lead.status).toBe("SALE_PENDING");
    expect(m.res.body.lead.sale.finalPriceUSD).toBe(10000);
    expect(m.res.body.lead.commission.rate).toBe(0.05);
    expect(m.res.body.lead.commission.amountUSD).toBe(500);
    expect(m.res.body.lead.commission.dueWithinAttribution).toBe(true);
    const ledger = await CommissionLedger.findOne({ transactionId: id, transactionType: "sale" });
    expect(ledger.status).toBe("pending");
    expect(ledger.commissionAmount).toBe(500);
    expect(ledger.commissionRate).toBe(5);

    // Rejouer la déclaration ne crée pas de seconde ligne.
    await SalesLead.updateOne({ _id: id }, { $set: { status: "NEGOTIATION" } });
    m = mockReqRes({ params: { id }, user: ctx.partner, body: { finalPrice: 6_100_000, currency: "XOF" } });
    await c.partnerDeclareSale(m.req, m.res);
    expect(await CommissionLedger.countDocuments({ transactionId: id })).toBe(1);

    m = mockReqRes({ params: { id }, user: ctx.admin });
    await c.adminConfirmSale(m.req, m.res);
    expect(m.res.body.lead.status).toBe("SOLD");
    expect((await CommissionLedger.findOne({ transactionId: id })).status).toBe("confirmed");
    const v = await Vehicle.findById(ctx.vehicle._id);
    expect(v.status).toBe("sold");
    expect(v.available).toBe(false);

    // Statistiques partenaire.
    m = mockReqRes({ user: ctx.partner });
    await c.getPartnerStats(m.req, m.res);
    expect(m.res.body.stats.sales).toBe(1);
    expect(m.res.body.stats.conversionRate).toBe(100);
    // La seconde déclaration (6 100 000 XOF ≈ 10 166,67 USD × 5 %) a remplacé la première.
    expect(m.res.body.stats.commissionUSD).toBeCloseTo(508.33, 1);
    expect(m.res.body.stats.revenueUSD).toBeCloseTo(10166.67, 1);
  });

  it("un Partenaire Fondateur actif est facturé 3 % (grille fondateur) au lieu de 5 %", async () => {
    await PartnerOnboarding.create({ userId: ctx.partner._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { lockedAt: new Date() } });
    const m = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { finalPrice: 10000, currency: "USD" } });
    await c.partnerDeclareSale(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    expect(m.res.body.lead.commission.rate).toBe(0.03);
    expect(m.res.body.lead.commission.amountUSD).toBe(300);
  });

  it("hors fenêtre d'attribution : déclaration acceptée mais commission nulle", async () => {
    await SalesLead.updateOne({ _id: lead._id }, { $set: { "attribution.expiresAt": new Date(Date.now() - 86400000) } });
    const m = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { finalPrice: 9000, currency: "USD" } });
    await c.partnerDeclareSale(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    expect(m.res.body.lead.commission.dueWithinAttribution).toBe(false);
    expect(m.res.body.lead.commission.amountUSD).toBe(0);
  });

  it("l'admin peut rejeter une déclaration (retour négociation, ledger annulé) et intervenir sur le statut", async () => {
    const id = lead._id.toString();
    let m = mockReqRes({ params: { id }, user: ctx.partner, body: { finalPrice: 9000, currency: "USD" } });
    await c.partnerDeclareSale(m.req, m.res);
    m = mockReqRes({ params: { id }, user: ctx.admin, body: { reason: "Prix non justifié" } });
    await c.adminRejectSale(m.req, m.res);
    expect(m.res.body.lead.status).toBe("NEGOTIATION");
    expect((await CommissionLedger.findOne({ transactionId: id })).status).toBe("cancelled");

    m = mockReqRes({ params: { id }, user: ctx.admin, body: { status: "LOST", reason: "Client injoignable" } });
    await c.adminSetStatus(m.req, m.res);
    expect(m.res.body.lead.status).toBe("LOST");
    expect(m.res.body.lead.history.at(-1).action).toBe("admin_status_override");

    // Le funnel admin reflète les jalons atteints.
    m = mockReqRes({ user: ctx.admin, query: {} });
    await c.adminFunnel(m.req, m.res);
    const f = Object.fromEntries(m.res.body.funnel.map((s) => [s.key, s.count]));
    expect(f.leads).toBe(1);
    expect(f.test_drives).toBe(1);
    expect(f.negotiations).toBe(1);
    expect(f.sales).toBe(0);
  });

  it("machine à états : une transition absente de la table est refusée (409)", async () => {
    const l = await SalesLead.findById(lead._id);
    expect(() => svc.transition(l, "SOLD", { actorType: "PARTNER" })).toThrow(/Transition impossible/);
    const m = mockReqRes({ params: { id: lead._id.toString() }, user: ctx.partner, body: { time: "10:00" } });
    await c.partnerAccept(m.req, m.res);
    expect(m.res.statusCode).toBe(409);
  });
});
