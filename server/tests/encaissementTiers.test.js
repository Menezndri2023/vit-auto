import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initiatePayment } from "../controllers/paymentController.js";
import { getPublicConfig } from "../controllers/pricingController.js";
import { refundPayment } from "../services/payment/refundService.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";
import ServiceRequest from "../models/ServiceRequest.js";
import InsuranceRequest from "../models/InsuranceRequest.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// ENCAISSEMENT POUR COMPTE DE TIERS FERMÉ (décision de l'exploitant, 2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Les prestataires branchés créditent le compte de VIT AUTO : tant qu'aucun
// prestataire habilité n'est validé, aucune réservation, aucun devis de service
// et aucune prime d'assurance ne s'encaisse en ligne — même paiements ouverts.

describe("Encaissement pour compte de tiers fermé", () => {
  const initial = { tiers: process.env.ENCAISSEMENT_TIERS_AUTORISE, paiements: process.env.PAYMENTS_ENABLED };
  beforeEach(() => { process.env.ENCAISSEMENT_TIERS_AUTORISE = "false"; process.env.PAYMENTS_ENABLED = "true"; });
  afterEach(() => { process.env.ENCAISSEMENT_TIERS_AUTORISE = initial.tiers; process.env.PAYMENTS_ENABLED = initial.paiements; });

  it("refuse le paiement en ligne de chaque cible, sans créer de paiement ni toucher la cible", async () => {
    const client = await createUser({ role: "client" });
    const vente = await Booking.create({ type: "essai", client: client._id, montantTotal: 18000, devise: "USD",
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" } });
    const service = await ServiceRequest.create({ client: client._id, category: "inspection", status: "approved", quotedAmountUSD: 150 });
    const assurance = await InsuranceRequest.create({ client: client._id, type: "auto", status: "approved", premium: 500 });

    for (const [cible, method] of [[{ bookingId: vente._id }, "card"], [{ serviceRequestId: service._id }, "wave"], [{ insuranceRequestId: assurance._id }, "orange_money"]]) {
      const { req, res } = mockReqRes({ user: client, body: { ...Object.fromEntries(Object.entries(cible).map(([k, v]) => [k, String(v)])), method } });
      await initiatePayment(req, res);
      expect(res.statusCode).toBe(503);
      expect(res.body.code).toBe("ENCAISSEMENT_TIERS_SUSPENDU");
      expect(res.body.message).toMatch(/pas encore disponible/);
    }
    expect(await Payment.countDocuments()).toBe(0);
    expect((await Booking.findById(vente._id).lean()).payment ?? null).toBeNull();
  });

  it("les paiements fermés gardent leur propre refus (vérifié en premier)", async () => {
    process.env.PAYMENTS_ENABLED = "false";
    const { req, res } = mockReqRes({ body: { bookingId: "0".repeat(24), method: "card" } });
    await initiatePayment(req, res);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
  });

  it("une annulation ne rembourse plus d'elle-même : décision de l'équipe, paiement intact", async () => {
    const vente = await Booking.create({ type: "essai", montantTotal: 1000, devise: "USD",
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" } });
    const paiement = await Payment.create({ booking: vente._id, amount: 1000, devise: "USD", method: "card", status: "completed" });

    for (const actorType of ["SYSTEM", "CLIENT", "PARTNER"]) {
      const r = await refundPayment({ paymentId: paiement._id, reason: "annulation", actorType });
      expect(r).toMatchObject({ ok: false, decisionRequise: true });
    }
    const apres = await Payment.findById(paiement._id).lean();
    expect(apres.status).toBe("completed");
    expect(apres.refundedAmount ?? 0).toBe(0);

    // La décision d'un admin reste possible (remboursement tracé).
    const admin = await createUser({ role: "admin" });
    const r = await refundPayment({ paymentId: paiement._id, reason: "décision équipe", actorId: admin._id, actorType: "ADMIN" });
    expect(r.ok).toBe(true);
  });

  it("la configuration publique l'annonce à l'interface", async () => {
    const { req, res } = mockReqRes({});
    await getPublicConfig(req, res);
    expect(res.body.encaissementTiers).toBe(false);
  });
});
