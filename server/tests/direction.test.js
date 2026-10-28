import { describe, it, expect } from "vitest";
import { evaluerActivations, activationDe } from "../services/activationPartenaire.js";
import { calculerDirection, monActivation, listeActivation } from "../controllers/directionController.js";
import Booking from "../models/Booking.js";
import CommissionLedger from "../models/CommissionLedger.js";
import User from "../models/User.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// Activation des partenaires (§6) et tableau de bord de direction (§13)
// ═══════════════════════════════════════════════════════════════════════════

const partenaireComplet = (extra = {}) => createUser({
  role: "partenaire", firstName: "Karim", lastName: "Alaoui", country: "MA", phone: "+212611111111",
  emailVerified: true, validationPartenaire: { statut: "valide" }, ...extra,
});
const clientInfo = (u) => ({ firstName: u.firstName, lastName: u.lastName, email: u.email, passportNumber: "P1234567" });

describe("Activation des partenaires", () => {
  it("un compte créé n'est pas activé : inscrit → vérifié → activé", async () => {
    const nu = await createUser({ role: "partenaire" });
    const verifieSansOffre = await partenaireComplet();
    const actif = await partenaireComplet();
    await createVehicleDoc({ owner: actif._id });

    const r = await evaluerActivations(await User.find({ _id: { $in: [nu._id, verifieSansOffre._id, actif._id] } }).lean());
    expect(r.get(String(nu._id)).statut).toBe("inscrit");
    expect(r.get(String(verifieSansOffre._id)).statut).toBe("verifie");
    expect(r.get(String(verifieSansOffre._id)).manquants.map((m) => m.code)).toEqual(["offresExploitables"]);
    expect(r.get(String(actif._id))).toMatchObject({ statut: "active", manquants: [], offres: { vehicules: 1, total: 1 } });
  });

  it("une offre non approuvée, en pause ou sans prix n'est pas exploitable", async () => {
    const p = await partenaireComplet();
    await createVehicleDoc({ owner: p._id, status: "pending" });
    await createVehicleDoc({ owner: p._id, manuallyPaused: true });
    await createVehicleDoc({ owner: p._id, pricePerDay: 0 });
    expect((await activationDe(p._id)).statut).toBe("verifie");
  });

  it("un partenaire suspendu n'est jamais activé, et un partenaire injoignable non plus", async () => {
    const suspendu = await partenaireComplet({ validationPartenaire: { statut: "suspendu" } });
    await createVehicleDoc({ owner: suspendu._id });
    expect((await activationDe(suspendu._id)).statut).toBe("suspendu");
    const injoignable = await partenaireComplet({ emailVerified: false, phoneVerified: false });
    await createVehicleDoc({ owner: injoignable._id });
    expect((await activationDe(injoignable._id)).manquants.map((m) => m.code)).toEqual(["joignable"]);
  });

  it("suit les premières demandes et le délai de réponse réel", async () => {
    const p = await partenaireComplet();
    const v = await createVehicleDoc({ owner: p._id });
    const c = await createUser({ role: "client" });
    const notif = new Date(Date.now() - 60 * 60000);
    await Booking.create({ type: "location", client: c._id, vehicle: v._id, clientInfo: clientInfo(c), partnerNotifiedAt: notif,
      auditTrail: [{ action: "confirm", actorType: "PARTNER", actorId: p._id, timestamp: new Date(notif.getTime() + 20 * 60000) }] });
    await Booking.create({ type: "location", client: c._id, vehicle: v._id, clientInfo: clientInfo(c) });
    const a = await activationDe(p._id);
    expect(a.premieresDemandes).toMatchObject({ recues: 2, repondues: 1, delaiMoyenReponseMin: 20 });
  });

  it("le partenaire voit ce qui lui manque ; un client n'y a pas accès", async () => {
    const p = await createUser({ role: "partenaire", firstName: "Sara", lastName: "B" });
    const m = mockReqRes({ user: p });
    await monActivation(m.req, m.res);
    expect(m.res.body.activation.statut).toBe("inscrit");
    expect(m.res.body.activation.manquants.map((x) => x.code)).toEqual(["profilComplet", "verifie", "offresExploitables", "joignable"]);
    const c = mockReqRes({ user: await createUser({ role: "client" }) });
    await monActivation(c.req, c.res);
    expect(c.res.statusCode).toBe(403);
  });
});

describe("Tableau de bord de direction", () => {
  it("sans données : ratios et délais indisponibles (null), coûts et résultat non mesurés", async () => {
    const d = await calculerDirection();
    expect(d.conversions.reservationVersFinalisee).toBeNull();
    expect(d.delaisReponseMin.reservations).toBeNull();
    expect(d.coutsExploitation).toBeNull();
    expect(d.coutAcquisition).toBeNull();
    expect(d.resultatEstime).toBeNull();
    expect(d.nonMesure.length).toBeGreaterThan(0);
  });

  it("distingue volume d'affaires, commissions calculées et commissions encaissées ; exclut les comptes de test", async () => {
    const p = await partenaireComplet();
    const v = await createVehicleDoc({ owner: p._id });
    const c = await createUser({ role: "client" });
    const testeur = await createUser({ role: "client", isTestAccount: true });
    const pTest = await partenaireComplet({ isTestAccount: true });
    await createVehicleDoc({ owner: pTest._id });

    const b1 = await Booking.create({ type: "location", client: c._id, vehicle: v._id, clientInfo: clientInfo(c), status: "completed", montantTotal: 300, devise: "USD", commissionAmount: 30 });
    await Booking.create({ type: "location", client: c._id, vehicle: v._id, clientInfo: clientInfo(c), status: "cancelled", montantTotal: 100, devise: "USD" });
    await Booking.create({ type: "location", client: testeur._id, vehicle: v._id, clientInfo: clientInfo(testeur), status: "completed", montantTotal: 9999, devise: "USD" });
    await CommissionLedger.create({ transactionType: "booking", transactionId: String(b1._id), type: "platform_fee", partnerId: p._id, grossAmount: 300, commissionRate: 10, commissionAmount: 30, currency: "USD", status: "confirmed" });
    await CommissionLedger.create({ transactionType: "booking", transactionId: "autre", type: "platform_fee", partnerId: p._id, grossAmount: 200, commissionRate: 10, commissionAmount: 20, currency: "USD", status: "paid" });
    await CommissionLedger.create({ transactionType: "booking", transactionId: "annulee", type: "platform_fee", partnerId: p._id, grossAmount: 500, commissionRate: 10, commissionAmount: 50, currency: "USD", status: "cancelled" });

    const d = await calculerDirection();
    expect(d.partenaires).toMatchObject({ inscrits: 1, verifies: 1, actives: 1 });   // le compte de test n'est pas compté
    expect(d.offresDisponibles.location).toBe(1);
    expect(d.demandes.reservations).toBe(2);
    expect(d.volumeAffaires.reservations).toEqual({ USD: 300 });                      // ni l'annulée, ni le compte de test
    expect(d.commissionsCalculees).toEqual({ USD: 50 });                              // hors commission annulée
    expect(d.commissionsEncaissees).toEqual({ USD: 20 });                             // seulement « payée »
    expect(d.conversions.reservationVersFinalisee).toBe(50);
    expect(d.annulations.reservations).toBe(1);
    expect(d.revenuLogistique).toBe(0);
  });

  it("la liste d'activation filtre par statut", async () => {
    const actif = await partenaireComplet();
    await createVehicleDoc({ owner: actif._id });
    await createUser({ role: "partenaire" });
    const m = mockReqRes({ query: { statut: "active" } });
    await listeActivation(m.req, m.res);
    expect(m.res.body.partenaires.map((x) => String(x._id))).toEqual([String(actif._id)]);
  });
});
