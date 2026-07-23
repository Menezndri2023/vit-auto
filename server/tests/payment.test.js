import { describe, it, expect } from "vitest";
import { initiatePayment, createPayment, simulatePayment } from "../controllers/paymentController.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";
import ServiceRequest from "../models/ServiceRequest.js";
import InsuranceRequest from "../models/InsuranceRequest.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

async function createBookingDoc(overrides = {}) {
  return Booking.create({
    type: "location",
    clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test" },
    montantTotal: 45000,
    ...overrides,
  });
}

describe("paymentController.initiatePayment", () => {
  it("refuse une méthode non prise en charge en ligne", async () => {
    const booking = await createBookingDoc();
    const { req, res } = mockReqRes({ body: { bookingId: booking._id.toString(), method: "cash" } });
    await initiatePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse de payer une réservation déjà payée", async () => {
    const booking = await createBookingDoc({ isPaid: true });
    const { req, res } = mockReqRes({ body: { bookingId: booking._id.toString(), method: "card" } });
    await initiatePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("refuse qu'un client paie la réservation d'un autre compte", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const booking = await createBookingDoc({ client: owner._id });
    const { req, res } = mockReqRes({ user: intruder, body: { bookingId: booking._id.toString(), method: "card" } });
    await initiatePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("initie un paiement en mode simulé (aucun fournisseur réel configuré en test)", async () => {
    const booking = await createBookingDoc();
    const { req, res } = mockReqRes({ body: { bookingId: booking._id.toString(), method: "card" } });
    await initiatePayment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.simulated).toBe(true);
    expect(res.body.checkoutUrl).toBeTruthy();

    const payment = await Payment.findById(res.body.paymentId);
    expect(payment.status).toBe("pending");
  });
});

describe("paymentController.initiatePayment — devis ServiceRequest/InsuranceRequest", () => {
  it("refuse de payer un devis pas encore approuvé", async () => {
    const client = await createUser();
    const sr = await ServiceRequest.create({ client: client._id, category: "transport" });
    const { req, res } = mockReqRes({ user: client, body: { serviceRequestId: sr._id.toString(), method: "card" } });
    await initiatePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("refuse qu'un client paie le devis d'un autre compte", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const sr = await ServiceRequest.create({ client: owner._id, category: "garantie", status: "approved", quotedAmountUSD: 120 });
    const { req, res } = mockReqRes({ user: intruder, body: { serviceRequestId: sr._id.toString(), method: "card" } });
    await initiatePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("initie le paiement d'un devis ServiceRequest approuvé", async () => {
    const client = await createUser();
    const sr = await ServiceRequest.create({ client: client._id, category: "transport", status: "approved", quotedAmountUSD: 250 });
    const { req, res } = mockReqRes({ user: client, body: { serviceRequestId: sr._id.toString(), method: "card" } });
    await initiatePayment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.body.checkoutUrl).toBeTruthy();
    const payment = await Payment.findById(res.body.paymentId);
    expect(payment.serviceRequest.toString()).toBe(sr._id.toString());
    expect(payment.amount).toBe(250);
  });

  it("initie le paiement d'une prime InsuranceRequest approuvée", async () => {
    const client = await createUser();
    const ir = await InsuranceRequest.create({ client: client._id, type: "auto", status: "approved", premium: 80 });
    const { req, res } = mockReqRes({ user: client, body: { insuranceRequestId: ir._id.toString(), method: "card" } });
    await initiatePayment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const payment = await Payment.findById(res.body.paymentId);
    expect(payment.insuranceRequest.toString()).toBe(ir._id.toString());
    expect(payment.amount).toBe(80);
  });

  it("marque le devis payé après une simulation réussie", async () => {
    const client = await createUser();
    const sr = await ServiceRequest.create({ client: client._id, category: "financement", status: "approved", quotedAmountUSD: 60 });
    const { req: reqInit, res: resInit } = mockReqRes({ user: client, body: { serviceRequestId: sr._id.toString(), method: "card" } });
    await initiatePayment(reqInit, resInit);

    const { req: reqSim, res: resSim } = mockReqRes({ user: client, params: { id: resInit.body.paymentId.toString() }, body: { outcome: "success" } });
    await simulatePayment(reqSim, resSim);
    expect(resSim.body.status).toBe("completed");

    const updated = await ServiceRequest.findById(sr._id);
    expect(updated.isPaid).toBe(true);
    expect(updated.paidAt).toBeTruthy();
  });
});

describe("paymentController.createPayment", () => {
  it("refuse un montant qui ne correspond pas à la réservation", async () => {
    const booking = await createBookingDoc({ montantTotal: 45000 });
    const { req, res } = mockReqRes({ body: { booking: booking._id.toString(), amount: 10000, method: "card" } });
    await createPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("masque le numéro de carte sauf les 4 derniers chiffres", async () => {
    const booking = await createBookingDoc({ montantTotal: 45000 });
    const { req, res } = mockReqRes({
      body: { booking: booking._id.toString(), amount: 45000, method: "card", cardLast4: "4242424242424242", cardHolder: "Jean Client" },
    });
    await createPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.body.payment.paymentDetails.cardLast4).toBe("4242");
  });

  it("masque le numéro mobile money sauf les 2 derniers chiffres", async () => {
    const booking = await createBookingDoc({ montantTotal: 45000 });
    const { req, res } = mockReqRes({
      body: { booking: booking._id.toString(), amount: 45000, method: "orange_money", mobileNumber: "0700112233" },
    });
    await createPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.body.payment.paymentDetails.mobileNumber).toMatch(/^\*+33$/);
  });

  it("refuse une méthode de paiement non prise en charge", async () => {
    const booking = await createBookingDoc({ montantTotal: 45000 });
    const { req, res } = mockReqRes({ body: { booking: booking._id.toString(), amount: 45000, method: "bitcoin" } });
    await createPayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuse un doublon de paiement pour la même réservation", async () => {
    const booking = await createBookingDoc({ montantTotal: 45000 });
    const { req: req1, res: res1 } = mockReqRes({ body: { booking: booking._id.toString(), amount: 45000, method: "cash" } });
    await createPayment(req1, res1);
    expect(res1.status).toHaveBeenCalledWith(202);

    const { req: req2, res: res2 } = mockReqRes({ body: { booking: booking._id.toString(), amount: 45000, method: "cash" } });
    await createPayment(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(409);
  });
});

describe("paymentController.simulatePayment", () => {
  it("un succès simulé marque le paiement complété et la réservation payée", async () => {
    const booking = await createBookingDoc();
    const payment = await Payment.create({ booking: booking._id, amount: 45000, method: "card", status: "pending", simulated: true });

    const { req, res } = mockReqRes({ params: { id: payment._id.toString() }, body: { outcome: "success" } });
    await simulatePayment(req, res);

    expect(res.body.status).toBe("completed");
    const updatedBooking = await Booking.findById(booking._id);
    expect(updatedBooking.isPaid).toBe(true);
  });

  it("refuse de simuler un paiement lié à un vrai fournisseur", async () => {
    const booking = await createBookingDoc();
    const payment = await Payment.create({ booking: booking._id, amount: 45000, method: "card", status: "pending", simulated: false });

    const { req, res } = mockReqRes({ params: { id: payment._id.toString() }, body: { outcome: "success" } });
    await simulatePayment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
