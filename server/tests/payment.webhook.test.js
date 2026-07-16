import { describe, it, expect, vi } from "vitest";

// Le webhook Stripe vérifie une signature cryptographique réelle
// (stripe.webhooks.constructEvent) — impossible à produire en test sans clé
// secrète Stripe. On mocke le provider en amont (paymentController importe
// `stripeProvider` depuis gateway.js, qui ré-exporte le namespace de ce
// fichier — le mock se propage à travers la ré-exportation).
vi.mock("../services/payment/providers/stripeProvider.js", () => ({
  isConfigured: vi.fn(() => true),
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));

const { stripeWebhook } = await import("../controllers/paymentController.js");
const stripeProvider = await import("../services/payment/providers/stripeProvider.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Booking } = await import("../models/Booking.js");
const { default: IETransaction } = await import("../models/IETransaction.js");
const { createIETransaction } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

const sessionCompletedEvent = (paymentId, sessionId = "cs_test_123") => ({
  type: "checkout.session.completed",
  data: { object: { id: sessionId, metadata: { paymentId }, client_reference_id: null } },
});
const sessionExpiredEvent = (paymentId, sessionId = "cs_test_expired") => ({
  type: "checkout.session.expired",
  data: { object: { id: sessionId, metadata: { paymentId }, client_reference_id: null } },
});

describe("paymentController.stripeWebhook", () => {
  it("rejette proprement une signature invalide (400, pas de crash)", async () => {
    stripeProvider.verifyWebhookSignature.mockImplementation(() => { throw new Error("signature invalide"); });
    const { req, res } = mockReqRes({});
    await stripeWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("checkout.session.completed sur un Payment véhicule marque le paiement complété et la réservation payée", async () => {
    const booking = await Booking.create({
      type: "location",
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
      montantTotal: 45000,
    });
    const payment = await Payment.create({ booking: booking._id, amount: 45000, method: "card", status: "pending" });

    stripeProvider.verifyWebhookSignature.mockImplementation(() => sessionCompletedEvent(payment._id.toString()));
    const { req, res } = mockReqRes({});
    await stripeWebhook(req, res);

    expect(res.body).toEqual({ received: true });
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe("completed");
    expect(updatedPayment.transactionId).toBe("cs_test_123");
    const updatedBooking = await Booking.findById(booking._id);
    expect(updatedBooking.isPaid).toBe(true);
  });

  it("est idempotent — un webhook rejoué ne recomplète pas un paiement déjà confirmé", async () => {
    const booking = await Booking.create({
      type: "location",
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
      montantTotal: 45000,
    });
    const payment = await Payment.create({ booking: booking._id, amount: 45000, method: "card", status: "completed", transactionId: "cs_original" });

    stripeProvider.verifyWebhookSignature.mockImplementation(() => sessionCompletedEvent(payment._id.toString(), "cs_replay"));
    const { req, res } = mockReqRes({});
    await stripeWebhook(req, res);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.transactionId).toBe("cs_original"); // pas écrasé par le rejeu
  });

  it("checkout.session.expired marque le paiement échoué", async () => {
    const booking = await Booking.create({
      type: "location",
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
      montantTotal: 45000,
    });
    const payment = await Payment.create({ booking: booking._id, amount: 45000, method: "card", status: "pending" });

    stripeProvider.verifyWebhookSignature.mockImplementation(() => sessionExpiredEvent(payment._id.toString()));
    const { req, res } = mockReqRes({});
    await stripeWebhook(req, res);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe("failed");
  });

  it("checkout.session.completed sur une transaction escrow Import/Export (pas un Payment véhicule) sécurise l'entiercement", async () => {
    const tx = await createIETransaction({ status: "payment_submitted", payment: { amount: 25000, currency: "EUR" } });

    stripeProvider.verifyWebhookSignature.mockImplementation(() => sessionCompletedEvent(tx._id.toString()));
    const { req, res } = mockReqRes({});
    await stripeWebhook(req, res);

    const updatedTx = await IETransaction.findById(tx._id);
    expect(updatedTx.status).toBe("in_escrow");
    expect(updatedTx.payment.escrowRef).toBeTruthy();
  });
});
