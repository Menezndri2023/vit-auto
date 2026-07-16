import { describe, it, expect } from "vitest";
import {
  getMySubscription, activatePro, purchaseBoost,
  getPendingSubscriptionRequests, adminApproveProPayment, adminRejectProPayment,
  adminApproveBoost, computeCommission, getPricing,
} from "../controllers/subscriptionController.js";
import Subscription from "../models/Subscription.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("getMySubscription", () => {
  it("crée un abonnement gratuit par défaut au premier accès", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: { id: vendor._id } });
    await getMySubscription(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.plan).toBe("free");

    const count = await Subscription.countDocuments({ vendor: vendor._id });
    expect(count).toBe(1);
  });
});

describe("activatePro / purchaseBoost — jamais d'activation automatique", () => {
  it("activatePro enregistre une demande 'pending', ne passe jamais le plan à pro immédiatement", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { paymentMethod: "card" } });
    await activatePro(req, res);
    expect(res.statusCode).toBe(202);
    expect(res.body.subscription.plan).toBe("free");
    expect(res.body.subscription.paymentHistory).toHaveLength(1);
    expect(res.body.subscription.paymentHistory[0].status).toBe("pending");
  });

  it("purchaseBoost refuse un véhicule qui n'appartient pas à l'appelant", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const otherOwner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: otherOwner._id });

    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { vehicleId: vehicle._id.toString() } });
    await purchaseBoost(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("purchaseBoost enregistre un boost inactif en attente de confirmation", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: vendor._id });

    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { vehicleId: vehicle._id.toString() } });
    await purchaseBoost(req, res);
    expect(res.statusCode).toBe(202);
    expect(res.body.subscription.boosts).toHaveLength(1);
    expect(res.body.subscription.boosts[0].isActive).toBe(false);
  });
});

describe("adminApproveProPayment / adminRejectProPayment", () => {
  it("approuve un paiement pending → active le plan pro", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: vendor._id,
      paymentHistory: [{ amount: 25000, method: "card", status: "pending", period: "2026-07" }],
    });
    const paymentId = sub.paymentHistory[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), paymentId } });
    await adminApproveProPayment(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.plan).toBe("pro");
    expect(res.body.subscription.proDetails.isActive).toBe(true);
  });

  it("409 si le paiement n'est plus en attente (déjà traité)", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: vendor._id,
      paymentHistory: [{ amount: 25000, method: "card", status: "completed", period: "2026-07" }],
    });
    const paymentId = sub.paymentHistory[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), paymentId } });
    await adminApproveProPayment(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("rejette une demande pending sans jamais activer le plan", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: vendor._id,
      paymentHistory: [{ amount: 25000, method: "card", status: "pending", period: "2026-07" }],
    });
    const paymentId = sub.paymentHistory[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), paymentId } });
    await adminRejectProPayment(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.paymentHistory[0].status).toBe("failed");
    expect(res.body.subscription.plan).toBe("free");
  });
});

describe("adminApproveBoost", () => {
  it("active un boost pending pour 30 jours, refuse un second appel", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: vendor._id });
    const sub = await Subscription.create({
      vendor: vendor._id,
      boosts: [{ vehicle: vehicle._id, isActive: false }],
    });
    const boostId = sub.boosts[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), boostId } });
    await adminApproveBoost(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.boosts[0].isActive).toBe(true);
    expect(res.body.subscription.boosts[0].paidAt).toBeTruthy();

    const { req: req2, res: res2 } = mockReqRes({ params: { subscriptionId: sub._id.toString(), boostId } });
    await adminApproveBoost(req2, res2);
    expect(res2.statusCode).toBe(409);
  });
});

describe("getPendingSubscriptionRequests (admin)", () => {
  it("liste les abonnements avec un paiement pending ou un boost inactif", async () => {
    const vendor1 = await createUser({ role: "partenaire" });
    const vendor2 = await createUser({ role: "partenaire" });
    await Subscription.create({ vendor: vendor1._id, paymentHistory: [{ amount: 25000, status: "pending" }] });
    await Subscription.create({ vendor: vendor2._id, plan: "pro", proDetails: { isActive: true } });

    const { req, res } = mockReqRes({});
    await getPendingSubscriptionRequests(req, res);
    expect(res.body.subscriptions).toHaveLength(1);
    expect(res.body.subscriptions[0].vendor._id.toString()).toBe(vendor1._id.toString());
  });
});

describe("computeCommission — logique pure", () => {
  it("15% sur une location, 3% sur une vente, net = base - commission", () => {
    const location = computeCommission(100000, "location");
    expect(location.commissionAmount).toBe(15000);
    expect(location.partnerPayout).toBe(85000);

    const vente = computeCommission(100000, "vente");
    expect(vente.commissionAmount).toBe(3000);
    expect(vente.partnerPayout).toBe(97000);
  });

  it("ne renvoie jamais un payout négatif", () => {
    const result = computeCommission(0, "location");
    expect(result.partnerPayout).toBe(0);
  });
});

describe("getPricing", () => {
  it("expose les tarifs publics sans authentification", async () => {
    const { req, res } = mockReqRes({});
    await getPricing(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.commissions.location.rate).toBe(0.15);
    expect(res.body.plans).toHaveLength(2);
  });
});
