import { describe, it, expect, vi } from "vitest";

// Même pattern que payment.webhook.test.js — mocker les fournisseurs pour ne
// jamais appeler un vrai réseau/API de paiement en test.
vi.mock("../services/payment/providers/stripeProvider.js", () => ({
  isConfigured: vi.fn(() => true),
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  refund: vi.fn(async () => ({ providerRefundId: "re_test_123" })),
}));
vi.mock("../services/payment/providers/waveProvider.js", () => ({
  isConfigured: vi.fn(() => true),
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  refund: vi.fn(async () => ({ providerRefundId: "cs_wave_test" })),
}));

const { refundPayment } = await import("../services/payment/refundService.js");
const stripeProvider = await import("../services/payment/providers/stripeProvider.js");
const waveProvider = await import("../services/payment/providers/waveProvider.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Booking } = await import("../models/Booking.js");
const { createUser } = await import("./helpers/fixtures.js");

async function makePaidBooking(overrides = {}) {
  const client = await createUser({ role: "client" });
  const booking = await Booking.create({
    type: "location", client: client._id,
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" },
    montantTotal: 200, isPaid: true, paidAt: new Date(),
  });
  const payment = await Payment.create({
    booking: booking._id, amount: 200, method: "card", status: "completed", transactionId: "cs_test_abc",
    ...overrides,
  });
  booking.payment = payment._id;
  await booking.save();
  return { client, booking, payment };
}

describe("refundService.refundPayment", () => {
  it("rembourse intégralement un paiement carte via Stripe (automatique)", async () => {
    const { payment } = await makePaidBooking();
    const result = await refundPayment({ paymentId: payment._id, reason: "Test" });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(true);
    expect(stripeProvider.refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 200 }));

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("refunded");
    expect(updated.refundedAmount).toBe(200);
    expect(updated.refundedAt).toBeTruthy();
  });

  it("rembourse partiellement (status passe à partially_refunded)", async () => {
    const { payment } = await makePaidBooking();
    const result = await refundPayment({ paymentId: payment._id, amount: 50 });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(true);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("partially_refunded");
    expect(updated.refundedAmount).toBe(50);
  });

  it("cumule deux remboursements partiels jusqu'au montant total", async () => {
    const { payment } = await makePaidBooking();
    await refundPayment({ paymentId: payment._id, amount: 50 });
    const second = await refundPayment({ paymentId: payment._id, amount: 150 });
    expect(second.ok).toBe(true);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("refunded");
    expect(updated.refundedAmount).toBe(200);
  });

  it("refuse un remboursement au-delà du montant déjà réglé (paiement non complété)", async () => {
    const { payment } = await makePaidBooking({ status: "pending", transactionId: null });
    const result = await refundPayment({ paymentId: payment._id });
    expect(result.ok).toBe(false);
  });

  it("refuse un second remboursement une fois déjà intégralement remboursé (idempotence)", async () => {
    const { payment } = await makePaidBooking();
    await refundPayment({ paymentId: payment._id });
    const second = await refundPayment({ paymentId: payment._id });
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/remboursement impossible/);
  });

  // Depuis le 2026-11-01, un remboursement manuel n'est enregistré qu'avec la
  // référence de l'opération réellement effectuée : jamais « remboursé » sur la
  // seule foi d'un clic.
  it("Wave : un remboursement partiel retombe en mode manuel (API Wave ne rembourse que l'intégralité), avec preuve", async () => {
    const { payment } = await makePaidBooking({ method: "wave" });
    const sansPreuve = await refundPayment({ paymentId: payment._id, amount: 50 });
    expect(sansPreuve).toMatchObject({ ok: false, preuveRequise: true });
    expect((await Payment.findById(payment._id)).status).toBe("completed");

    const result = await refundPayment({ paymentId: payment._id, amount: 50, preuve: { reference: "WAVE-REMB-77", effectueLe: "2026-10-30" } });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(false);
    expect(waveProvider.refund).not.toHaveBeenCalled();

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("partially_refunded");
    expect(updated.remboursements[0]).toMatchObject({ montant: 50, mode: "manuel", reference: "WAVE-REMB-77" });
    expect(updated.remboursements[0].effectueLe.toISOString().slice(0, 10)).toBe("2026-10-30");
  });

  it("Wave : un remboursement intégral appelle bien le fournisseur", async () => {
    const { payment } = await makePaidBooking({ method: "wave" });
    const result = await refundPayment({ paymentId: payment._id });
    expect(result.automatic).toBe(true);
    expect(waveProvider.refund).toHaveBeenCalled();
  });

  it("Orange Money / espèces restent manuels : enregistrés seulement avec la référence de l'opération", async () => {
    const { payment } = await makePaidBooking({ method: "orange_money" });
    expect(await refundPayment({ paymentId: payment._id, preuve: { reference: "   " } })).toMatchObject({ ok: false, preuveRequise: true });
    expect(await refundPayment({ paymentId: payment._id, preuve: { reference: "OM-1", effectueLe: "2999-01-01" } })).toMatchObject({ ok: false });
    expect((await Payment.findById(payment._id)).refundedAmount).toBe(0);

    const result = await refundPayment({ paymentId: payment._id, preuve: { reference: "OM-REMB-2026-001" } });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(false);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("refunded");
    expect(updated.refundedAmount).toBe(200);
    expect(updated.remboursements).toHaveLength(1);
    expect(updated.remboursements[0]).toMatchObject({ mode: "manuel", reference: "OM-REMB-2026-001" });
  });

  it("un échec de l'appel fournisseur n'enregistre RIEN ; l'admin enregistre ensuite son remboursement avec preuve", async () => {
    stripeProvider.refund.mockImplementationOnce(async () => { throw new Error("Réseau indisponible"); });
    const { payment } = await makePaidBooking();
    const result = await refundPayment({ paymentId: payment._id });
    expect(result).toMatchObject({ ok: false, preuveRequise: true });
    expect((await Payment.findById(payment._id)).status).toBe("completed");

    stripeProvider.refund.mockImplementationOnce(async () => { throw new Error("Réseau indisponible"); });
    const manuel = await refundPayment({ paymentId: payment._id, preuve: { reference: "VIR-SEPA-42" } });
    expect(manuel).toMatchObject({ ok: true, automatic: false });
    expect((await Payment.findById(payment._id)).remboursements[0]).toMatchObject({ mode: "manuel", reference: "VIR-SEPA-42" });
  });

  it("un remboursement automatique garde l'identifiant rendu par le prestataire", async () => {
    const { payment } = await makePaidBooking();
    const result = await refundPayment({ paymentId: payment._id });
    expect(result).toMatchObject({ ok: true, automatic: true });
    expect((await Payment.findById(payment._id)).remboursements[0]).toMatchObject({ mode: "automatique", reference: "re_test_123", montant: 200 });
  });
});
