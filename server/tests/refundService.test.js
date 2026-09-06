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

  it("Wave : un remboursement partiel retombe en mode manuel (API Wave ne rembourse que l'intégralité)", async () => {
    const { payment } = await makePaidBooking({ method: "wave" });
    const result = await refundPayment({ paymentId: payment._id, amount: 50 });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(false);
    expect(waveProvider.refund).not.toHaveBeenCalled();

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("partially_refunded");
  });

  it("Wave : un remboursement intégral appelle bien le fournisseur", async () => {
    const { payment } = await makePaidBooking({ method: "wave" });
    const result = await refundPayment({ paymentId: payment._id });
    expect(result.automatic).toBe(true);
    expect(waveProvider.refund).toHaveBeenCalled();
  });

  it("Orange Money / espèces restent toujours manuels mais le remboursement est bien enregistré", async () => {
    const { payment } = await makePaidBooking({ method: "orange_money" });
    const result = await refundPayment({ paymentId: payment._id });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(false);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("refunded");
    expect(updated.refundedAmount).toBe(200);
  });

  it("un échec de l'appel fournisseur retombe proprement en mode manuel (jamais de remboursement perdu)", async () => {
    stripeProvider.refund.mockImplementationOnce(async () => { throw new Error("Réseau indisponible"); });
    const { payment } = await makePaidBooking();
    const result = await refundPayment({ paymentId: payment._id });
    expect(result.ok).toBe(true);
    expect(result.automatic).toBe(false);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("refunded");
  });
});
