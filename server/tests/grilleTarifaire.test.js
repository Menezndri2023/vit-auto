import { describe, it, expect, beforeEach } from "vitest";
import { programmerModification, appliquerModificationsEchues, annulerModification, _reinitialiserVerification, PREAVIS_JOURS } from "../services/grilleTarifaire.js";
import { resolveCommissionRate } from "../services/pricingEngine.js";
import { createBooking, adminForceComplete } from "../controllers/bookingController.js";
import { updatePricingSection } from "../controllers/businessConfigController.js";
import { conserverTauxReservationsOuvertes } from "../scripts/preavisGrille.mjs";
import GrilleTarifaire from "../models/GrilleTarifaire.js";
import PricingConfig from "../models/PricingConfig.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import SystemMigration from "../models/SystemMigration.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// GRILLE VERSIONNÉE, PRÉAVIS, TAUX CONSERVÉ (décision de l'exploitant, 2026-10-30)
// ═══════════════════════════════════════════════════════════════════════════

const JOUR = 86400000;
const FAKE_DOC_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };
const documents = { identity: { type: "cni", frontImage: FAKE_DOC_IMAGE }, license: { frontImage: FAKE_DOC_IMAGE } };
const standard = (modif) => ({ ...JSON.parse(JSON.stringify(DEFAULT_PRICING_CONFIG.commissions)), standard: { ...DEFAULT_PRICING_CONFIG.commissions.standard, ...modif } });
const echoir = async (v) => { await GrilleTarifaire.updateOne({ _id: v._id }, { dateEffet: new Date(Date.now() - 1000) }); _reinitialiserVerification(); };

beforeEach(async () => {
  _reinitialiserVerification();
  await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global" });
});

describe("Grille versionnée et préavis", () => {
  it("une hausse est refusée à moins de 30 jours ; programmée, elle ne change rien avant sa date", async () => {
    await expect(programmerModification({ section: "commissions", valeur: standard({ location: 0.12 }), dateEffet: new Date(Date.now() + 5 * JOUR) }))
      .rejects.toThrow(/préavis de 30 jours/);
    await expect(programmerModification({ section: "commissions", valeur: standard({ location: 0.12 }), immediat: true }))
      .rejects.toThrow(/ne peut pas être immédiate/);

    const v = await programmerModification({ section: "commissions", valeur: standard({ location: 0.12 }) });
    expect(v).toMatchObject({ statut: "programmee", hausse: true, changements: [{ chemin: "commissions.standard.location", avant: 0.1, apres: 0.12 }] });
    expect(new Date(v.dateEffet).getTime()).toBeGreaterThanOrEqual(Date.now() + (PREAVIS_JOURS * JOUR) - 60000);
    const p = await createUser({ role: "partenaire" });
    expect(await resolveCommissionRate("location", p._id)).toBe(0.10);

    await echoir(v);
    expect(await resolveCommissionRate("location", p._id)).toBe(0.12);
    const cfg = await PricingConfig.findOne({ key: "global" }).lean();
    expect(cfg.versionGrille).toBe(v.version);
    expect((await GrilleTarifaire.findById(v._id).lean()).statut).toBe("appliquee");
  });

  it("notifie les partenaires réels (version, date d'effet, lignes), pas les comptes de test ni les clients", async () => {
    const p = await createUser({ role: "partenaire" });
    const fondateur = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({ userId: fondateur._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { lockedAt: new Date() } });
    const testeur = await createUser({ role: "partenaire", isTestAccount: true });
    const client = await createUser({ role: "client" });
    const v = await programmerModification({ section: "commissions", valeur: standard({ vente: 0.03 }), motif: "Révision annuelle" });
    const notifs = await Notification.find({ type: "conditions_tarifaires" }).lean();
    expect(notifs.map((n) => String(n.user)).sort()).toEqual([String(p._id), String(fondateur._id)].sort());
    expect(notifs[0].message).toMatch(new RegExp(`en vigueur le ${new Date(v.dateEffet).toLocaleDateString("fr-FR")}`));
    expect(notifs[0].message).toMatch(/standard\.vente : 2 % → 3 %/);
    const trace = (await GrilleTarifaire.findById(v._id).lean()).notification;
    expect(trace).toMatchObject({ destinataires: 2, fondateurs: 1 });
    expect(trace.envoyeeLe).toBeTruthy();
    expect([String(testeur._id), String(client._id)]).not.toContain(String(notifs[0].user));
  });

  it("une baisse peut être immédiate ; une version programmée peut être annulée", async () => {
    const v = await programmerModification({ section: "commissions", valeur: standard({ location: 0.08 }), immediat: true, notifier: false });
    expect(v.statut).toBe("appliquee");
    expect(await resolveCommissionRate("location", (await createUser({ role: "partenaire" }))._id)).toBe(0.08);

    const h = await programmerModification({ section: "commissions", valeur: standard({ location: 0.09 }), notifier: false });
    await expect(programmerModification({ section: "commissions", valeur: standard({ location: 0.11 }), notifier: false })).rejects.toThrow(/déjà programmée/);
    await annulerModification(h._id, { motif: "erreur" });
    await echoir(h);
    expect(await appliquerModificationsEchues({ force: true })).toBe(0);
    expect(await resolveCommissionRate("location", (await createUser({ role: "partenaire" }))._id)).toBe(0.08);
  });

  it("l'écran admin ne peut plus appliquer une hausse à chaud : 202 + version programmée", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { section: "commissions" }, body: standard({ location: 0.12 }) });
    await updatePricingSection(req, res);
    expect(res.statusCode).toBe(202);
    expect(res.body.message).toMatch(/programmée pour le/);
    expect((await PricingConfig.findOne({ key: "global" }).lean()).commissions.standard.location).toBe(0.10);
  });
});

describe("Taux conservé pour chaque transaction", () => {
  it("une réservation créée avant une hausse garde son taux au règlement", async () => {
    const client = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ pricePerDay: 100 });
    const m = mockReqRes({ user: client, body: { type: "location", clientInfo, documents, vehicleId: vehicle._id.toString(),
      location: { days: 1, startDate: "2027-05-01", endDate: "2027-05-02" } } });
    await createBooking(m.req, m.res);
    const b = m.res.body.booking;
    expect(b).toMatchObject({ commissionRate: 0.10, commissionFigee: true, grilleVersion: 1 });

    const v = await programmerModification({ section: "commissions", valeur: standard({ location: 0.15 }), notifier: false });
    await echoir(v);
    const admin = await createUser({ role: "admin" });
    const f = mockReqRes({ user: admin, params: { id: String(b._id) }, body: { finalAmount: 100, note: "test" } });
    await adminForceComplete(f.req, f.res);
    const apres = await Booking.findById(b._id).lean();
    expect(apres.commissionRate).toBe(0.10);
    expect(apres.commissionAmount).toBe(10);
  });
});

describe("Migrations du 2026-10-30", () => {
  it("conserve le taux des réservations ouvertes créées depuis la grille du 27/10, pas des autres", async () => {
    await SystemMigration.create({ name: "grille-commissions-unique-2026-10-27", ranAt: new Date("2026-10-28T10:00:00Z") });
    const client = await createUser({ role: "client" });
    const v = await createVehicleDoc();
    const base = { type: "location", client: client._id, vehicle: v._id, clientInfo };
    const ouverte = await Booking.create({ ...base, createdAt: new Date("2026-10-29T00:00:00Z") });
    const ancienne = await Booking.create({ ...base, createdAt: new Date("2026-10-01T00:00:00Z") });
    const terminee = await Booking.create({ ...base, status: "completed", createdAt: new Date("2026-10-29T00:00:00Z") });
    const r = await conserverTauxReservationsOuvertes();
    expect(r.conservees).toBe(1);
    expect((await Booking.findById(ouverte._id).lean()).commissionFigee).toBe(true);
    expect((await Booking.findById(ancienne._id).lean()).commissionFigee).toBe(false);
    expect((await Booking.findById(terminee._id).lean()).commissionFigee).toBe(false);
  });
});
