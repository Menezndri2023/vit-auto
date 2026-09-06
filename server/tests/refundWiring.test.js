import { describe, it, expect, vi } from "vitest";

vi.mock("../services/payment/providers/stripeProvider.js", () => ({
  isConfigured: vi.fn(() => true),
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  refund: vi.fn(async () => ({ providerRefundId: "re_test_wiring" })),
}));
vi.mock("../services/payment/providers/waveProvider.js", () => ({
  isConfigured: vi.fn(() => false),
  createCheckout: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  refund: vi.fn(),
}));

const { updateBookingStatus, cancelBookingByClient, resolveDispute } = await import("../controllers/bookingController.js");
const stripeProvider = await import("../services/payment/providers/stripeProvider.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Booking } = await import("../models/Booking.js");
const { createUser, createVehicleDoc } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P1234567" };

async function makePaidLocationBooking({ status = "confirmed" } = {}) {
  const owner  = await createUser({ role: "partenaire" });
  const client = await createUser({ role: "client" });
  const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 100 });
  const booking = await Booking.create({
    type: "location", vehicle: vehicle._id, client: client._id, clientInfo,
    status, adminValidation: { status: "approved" },
    location: { startDate: new Date(Date.now() + 86400000), endDate: new Date(Date.now() + 3 * 86400000), days: 2 },
    montantTotal: 200, isPaid: true, paidAt: new Date(),
  });
  const payment = await Payment.create({ booking: booking._id, amount: 200, method: "card", status: "completed", transactionId: "cs_wiring_test" });
  booking.payment = payment._id;
  await booking.save();
  return { owner, client, vehicle, booking, payment };
}

describe("Booking Engine — Remboursements (câblage)", () => {
  it("le partenaire qui annule une réservation payée déclenche un remboursement Stripe automatique", async () => {
    const { owner, booking, payment } = await makePaidLocationBooking();
    const { req, res } = mockReqRes({
      user: owner, params: { id: booking._id.toString() },
      body: { status: "cancelled", cancelReasonCode: "vehicule_indisponible" },
    });
    await updateBookingStatus(req, res);
    expect(res.statusCode).toBe(200);
    expect(stripeProvider.refund).toHaveBeenCalled();

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe("refunded");
  });

  it("le client qui annule une réservation payée déclenche un remboursement automatique", async () => {
    const { client, booking, payment } = await makePaidLocationBooking({ status: "pending" });
    const { req, res } = mockReqRes({
      user: client, params: { id: booking._id.toString() },
      body: { reasonCode: "changement_de_plans" },
    });
    await cancelBookingByClient(req, res);
    expect(res.statusCode).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe("refunded");
  });

  it("un litige résolu avec refundClient déclenche le remboursement du montant demandé", async () => {
    const { booking, payment } = await makePaidLocationBooking({ status: "disputed" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: booking._id.toString() },
      body: { resolution: "compensated", refundClient: true, refundAmount: 75 },
    });
    await resolveDispute(req, res);
    expect(res.statusCode).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe("partially_refunded");
    expect(updatedPayment.refundedAmount).toBe(75);
  });

  it("un litige résolu sans refundClient ne déclenche aucun remboursement", async () => {
    const { booking, payment } = await makePaidLocationBooking({ status: "disputed" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: booking._id.toString() },
      body: { resolution: "completed", refundClient: false },
    });
    await resolveDispute(req, res);
    expect(res.statusCode).toBe(200);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe("completed");
  });
});
