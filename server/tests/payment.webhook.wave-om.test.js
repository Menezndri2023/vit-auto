import { describe, it, expect, vi } from "vitest";

vi.mock("../services/payment/providers/waveProvider.js", () => ({
  isConfigured: vi.fn(() => true),
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
}));
vi.mock("../services/payment/providers/orangeMoneyProvider.js", () => ({
  isConfigured: vi.fn(() => true),
  createCheckout: vi.fn(),
  verifyWebhookPayload: vi.fn(),
}));

const { waveWebhook, orangeMoneyWebhook } = await import("../controllers/paymentController.js");
const waveProvider = await import("../services/payment/providers/waveProvider.js");
const orangeMoneyProvider = await import("../services/payment/providers/orangeMoneyProvider.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Booking } = await import("../models/Booking.js");
// completePayment() (paymentController.js) fait Booking.findById(...).populate("vehicle", ...)
// — exige que le schéma Vehicle soit enregistré sur la connexion mongoose de
// CE fichier de test (chaque fichier a son propre registre avec l'isolation
// par défaut de Vitest, voir tests/review.test.js pour le même piège).
await import("../models/Vehicle.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

async function createPendingPayment(montant = 45000) {
  const booking = await Booking.create({
    type: "location",
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
    montantTotal: montant,
  });
  const payment = await Payment.create({ booking: booking._id, amount: montant, method: "wave", status: "pending" });
  return { booking, payment };
}

describe("paymentController.waveWebhook", () => {
  it("rejette une signature invalide (400)", async () => {
    waveProvider.verifyWebhookSignature.mockImplementation(() => { throw new Error("signature invalide"); });
    const { req, res } = mockReqRes({ body: Buffer.from("{}") });
    await waveWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("payment_status succeeded marque le paiement complété", async () => {
    const { payment, booking } = await createPendingPayment();
    waveProvider.verifyWebhookSignature.mockImplementation(() => ({
      client_reference: payment._id.toString(), id: "wv_evt_1", payment_status: "succeeded",
    }));

    const { req, res } = mockReqRes({ body: Buffer.from("{}") });
    await waveWebhook(req, res);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("completed");
    expect((await Booking.findById(booking._id)).isPaid).toBe(true);
  });

  it("checkout_status expired marque le paiement échoué", async () => {
    const { payment } = await createPendingPayment();
    waveProvider.verifyWebhookSignature.mockImplementation(() => ({
      client_reference: payment._id.toString(), id: "wv_evt_2", checkout_status: "expired",
    }));

    const { req, res } = mockReqRes({ body: Buffer.from("{}") });
    await waveWebhook(req, res);

    expect((await Payment.findById(payment._id)).status).toBe("failed");
  });

  it("un paiement introuvable ne fait pas échouer le webhook (200, aucun crash)", async () => {
    waveProvider.verifyWebhookSignature.mockImplementation(() => ({
      client_reference: "000000000000000000000000", id: "wv_evt_3", payment_status: "succeeded",
    }));
    const { req, res } = mockReqRes({ body: Buffer.from("{}") });
    await waveWebhook(req, res);
    expect(res.body).toEqual({ received: true });
  });
});

describe("paymentController.orangeMoneyWebhook", () => {
  it("rejette un payload invalide (400)", async () => {
    orangeMoneyProvider.verifyWebhookPayload.mockImplementation(() => { throw new Error("payload invalide"); });
    const { req, res } = mockReqRes({});
    await orangeMoneyWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("status SUCCESS marque le paiement complété", async () => {
    const { payment, booking } = await createPendingPayment();
    orangeMoneyProvider.verifyWebhookPayload.mockImplementation(() => ({
      order_id: payment._id.toString(), txnid: "om_txn_1", status: "SUCCESS",
    }));

    const { req, res } = mockReqRes({});
    await orangeMoneyWebhook(req, res);

    const updated = await Payment.findById(payment._id);
    expect(updated.status).toBe("completed");
    expect((await Booking.findById(booking._id)).isPaid).toBe(true);
  });

  it("un statut différent de SUCCESS/SUCCESSFUL marque le paiement échoué", async () => {
    const { payment } = await createPendingPayment();
    orangeMoneyProvider.verifyWebhookPayload.mockImplementation(() => ({
      order_id: payment._id.toString(), status: "FAILED",
    }));

    const { req, res } = mockReqRes({});
    await orangeMoneyWebhook(req, res);

    expect((await Payment.findById(payment._id)).status).toBe("failed");
  });
});
