import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initiatePayment } from "../controllers/paymentController.js";
import {
  etatSequestre, payEscrow, payInstallmentBalance, confirmEscrowPayment, releaseFunds, resolveDispute,
  completeIEEscrowPayment, declarerReglementDirect, markShipped, confirmDelivery,
} from "../controllers/ieTransactionController.js";
import IETransaction from "../models/IETransaction.js";
import CommissionLedger from "../models/CommissionLedger.js";
import { createUser, createListing, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// SÉQUESTRE IMPORT/EXPORT SUSPENDU (décision de l'exploitant, 2026-10-30)
// ═══════════════════════════════════════════════════════════════════════════
// Aucun encaissement, blocage, vérification de fonds ou déblocage ne peut être
// déclenché ; l'acheteur règle l'exportateur directement et la plateforme
// n'enregistre que des déclarations. Les données existantes ne bougent pas.

const appel = async (fn, opts) => { const m = mockReqRes(opts); await fn(m.req, m.res); return m.res; };

describe("Séquestre Import/Export suspendu", () => {
  let client, partner, admin, tx;
  beforeEach(async () => {
    etatSequestre.actif = false;
    client = await createUser({ role: "client" });
    partner = await createUser({ role: "partenaire", isFounder: true });
    admin = await createUser({ role: "admin" });
    const listing = await createListing({ partner: partner._id });
    tx = await createIETransaction({ listing: listing._id, client: client._id, partner: partner._id,
      status: "payment_pending", finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 } });
  });
  afterEach(() => { etatSequestre.actif = true; });

  it("toute action de fonds répond 503 SEQUESTRE_SUSPENDU, sans rien écrire", async () => {
    const id = String(tx._id);
    const actions = [
      [payEscrow, client, { method: "virement", transactionRef: "VIR-1" }],
      [payEscrow, client, { method: "carte" }],
      [payInstallmentBalance, client, {}],
      [confirmEscrowPayment, admin, {}],
      [releaseFunds, admin, {}],
    ];
    for (const [fn, user, body] of actions) {
      const r = await appel(fn, { user, params: { id }, body });
      expect(r.statusCode, fn.name).toBe(503);
      expect(r.body.code).toBe("SEQUESTRE_SUSPENDU");
    }
    const apres = await IETransaction.findById(tx._id).lean();
    expect(apres.status).toBe("payment_pending");
    expect(apres.payment.paidAt).toBeNull();
    expect(apres.payment.releasedAt ?? null).toBeNull();
    expect(await CommissionLedger.countDocuments({ transactionId: id })).toBe(0);
  });

  it("un litige peut être tranché, mais jamais par une libération de fonds", async () => {
    await IETransaction.updateOne({ _id: tx._id }, { status: "disputed" });
    const r = await appel(resolveDispute, { user: admin, params: { id: String(tx._id) }, body: { resolution: "x", releaseToPartner: true } });
    expect(r.statusCode).toBe(503);
    expect((await IETransaction.findById(tx._id).lean()).status).toBe("disputed");
  });

  it("un paiement Stripe arrivé pendant la suspension n'est pas transformé en « fonds sécurisés »", async () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    await completeIEEscrowPayment(tx, "cs_test_123");
    espion.mockRestore();
    const apres = await IETransaction.findById(tx._id).lean();
    expect(apres.status).toBe("payment_pending");
    expect(apres.payment.paidAt).toBeNull();
    expect(apres.statusHistory.at(-1).note).toMatch(/séquestre est suspendu.*régulariser/);
  });

  it("règlement direct : l'acheteur déclare, l'exportateur confirme, puis expédition et clôture sans aucun fonds", async () => {
    const id = String(tx._id);
    const d = await appel(declarerReglementDirect, { user: client, params: { id }, body: { reference: "SWIFT-42" } });
    expect(d.statusCode).toBe(200);
    expect(d.body.message).toMatch(/exportateur doit confirmer/);
    expect((await IETransaction.findById(tx._id).lean()).status).toBe("payment_pending");

    const etranger = await createUser({ role: "client" });
    expect((await appel(declarerReglementDirect, { user: etranger, params: { id } })).statusCode).toBe(403);

    const c = await appel(declarerReglementDirect, { user: partner, params: { id }, body: { note: "reçu" } });
    expect(c.statusCode).toBe(200);
    let t = await IETransaction.findById(tx._id).lean();
    expect(t.status).toBe("preparing");
    expect(t.reglementDirect).toMatchObject({ referenceAcheteur: "SWIFT-42", noteExportateur: "reçu" });
    expect(t.statusHistory.at(-1).note).toMatch(/aucun fonds détenu ni vérifié par VIT AUTO/);
    expect(t.payment.paidAt).toBeNull();

    await IETransaction.updateOne({ _id: tx._id }, { "documents.inspectionDocs.status": "fourni" });   // règle existante avant expédition
    expect((await appel(markShipped, { user: partner, params: { id }, body: { trackingNumber: "BL-1", carrier: "CMA" } })).statusCode).toBe(200);
    const fin = await appel(confirmDelivery, { user: client, params: { id }, body: {} });
    expect(fin.statusCode).toBe(200);
    t = await IETransaction.findById(tx._id).lean();
    expect(t.status).toBe("completed");
    expect(t.payment.releasedAt ?? null).toBeNull();
    // La commission de VENTE du véhicule (2 %, jamais 2 % + 3 %) reste DUE : enregistrée
    // une fois, à facturer — jamais prélevée sur des fonds.
    const lignes = await CommissionLedger.find({ transactionId: id }).lean();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ type: "platform_fee", status: "pending", commissionRate: 2, commissionAmount: 500, grossAmount: 25000, currency: "EUR" });
  });

  it("un achat direct non validé par l'équipe ne peut pas être déclaré réglé", async () => {
    await IETransaction.updateOne({ _id: tx._id }, { directPurchase: true, "adminValidation.status": "pending" });
    expect((await appel(declarerReglementDirect, { user: partner, params: { id: String(tx._id) } })).statusCode).toBe(409);
  });
});

describe("Paiement en ligne des réservations : interrupteur unique", () => {
  const initial = process.env.PAYMENTS_ENABLED;
  afterEach(() => { process.env.PAYMENTS_ENABLED = initial; });

  it("PAYMENTS_ENABLED fermé : initiatePayment refuse, même si un compte marchand existait", async () => {
    process.env.PAYMENTS_ENABLED = "false";
    const r = await appel(initiatePayment, { user: await createUser({ role: "client" }), body: { method: "card", bookingId: "507f1f77bcf86cd799439011" } });
    expect(r.statusCode).toBe(503);
    expect(r.body.code).toBe("PAYMENTS_DISABLED");
  });
});
