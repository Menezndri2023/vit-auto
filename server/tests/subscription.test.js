import { describe, it, expect, beforeEach } from "vitest";
import {
  getMySubscription, activatePlan, purchaseBoost,
  getPendingSubscriptionRequests, adminApprovePlanPayment, adminRejectPlanPayment,
  adminApproveBoost,
} from "../controllers/subscriptionController.js";
import Subscription from "../models/Subscription.js";
import PricingConfig from "../models/PricingConfig.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

beforeEach(async () => {
  await PricingConfig.create({
    key: "global",
    commissions: { standard: { vente: 0.03, location: 0.15, chauffeur: 0.10, import_export: 0.03, leasing: 0.05 }, premium: { vente: 0.02, location: 0.12, chauffeur: 0.08, import_export: 0.02, leasing: 0.04 } },
    foundingPartner: { durationMonths: 12, entreprise: { location: 0.10, vente: 0.015, import_export: 0.015 }, particulier: { location: 0.10, vente: 0.02, import_export: null } },
    serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
    boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
    subscriptions: { individuel_plus: { priceUSD: 9.99 }, business: { priceUSD: 19.99 }, exportateur: { priceUSD: 49.99 } },
  });
});

describe("getMySubscription", () => {
  it("crée un abonnement gratuit par défaut au premier accès, avec la tarification live", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: { id: vendor._id } });
    await getMySubscription(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.plan).toBe("free");
    expect(res.body.pricing.plans.business).toBe(19.99);
    expect(res.body.pricing.boosts["24h"]).toBe(2);

    const count = await Subscription.countDocuments({ vendor: vendor._id });
    expect(count).toBe(1);
  });
});

describe("activatePlan / purchaseBoost — jamais d'activation automatique", () => {
  it("activatePlan enregistre une demande 'pending' au prix live, ne passe jamais le plan actif immédiatement", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { planTier: "business", paymentMethod: "card" } });
    await activatePlan(req, res);
    expect(res.statusCode).toBe(202);
    expect(res.body.subscription.plan).toBe("free");
    expect(res.body.subscription.paymentHistory).toHaveLength(1);
    expect(res.body.subscription.paymentHistory[0].status).toBe("pending");
    expect(res.body.subscription.paymentHistory[0].amount).toBe(19.99);
    expect(res.body.subscription.paymentHistory[0].planTier).toBe("business");
  });

  it("refuse un palier de plan invalide", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { planTier: "pro" } });
    await activatePlan(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("purchaseBoost refuse un véhicule qui n'appartient pas à l'appelant", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const otherOwner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: otherOwner._id });

    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { vehicleId: vehicle._id.toString(), tier: "7d" } });
    await purchaseBoost(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("refuse un palier de boost invalide", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: vendor._id });
    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { vehicleId: vehicle._id.toString(), tier: "60d" } });
    await purchaseBoost(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("purchaseBoost enregistre un boost inactif en attente de confirmation, au prix du palier", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: vendor._id });

    const { req, res } = mockReqRes({ user: { id: vendor._id }, body: { vehicleId: vehicle._id.toString(), tier: "international" } });
    await purchaseBoost(req, res);
    expect(res.statusCode).toBe(202);
    expect(res.body.subscription.boosts).toHaveLength(1);
    expect(res.body.subscription.boosts[0].isActive).toBe(false);
    expect(res.body.subscription.boosts[0].tier).toBe("international");
    expect(res.body.subscription.boosts[0].priceUSD).toBe(20);
  });
});

describe("adminApprovePlanPayment / adminRejectPlanPayment", () => {
  it("approuve un paiement pending → active le plan correspondant", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: vendor._id,
      paymentHistory: [{ planTier: "exportateur", amount: 49.99, method: "card", status: "pending", period: "2026-07" }],
    });
    const paymentId = sub.paymentHistory[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), paymentId } });
    await adminApprovePlanPayment(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.plan).toBe("exportateur");
    expect(res.body.subscription.planDetails.isActive).toBe(true);
    expect(res.body.subscription.planDetails.priceUSD).toBe(49.99);
  });

  it("409 si le paiement n'est plus en attente (déjà traité)", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: vendor._id,
      paymentHistory: [{ planTier: "business", amount: 19.99, method: "card", status: "completed", period: "2026-07" }],
    });
    const paymentId = sub.paymentHistory[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), paymentId } });
    await adminApprovePlanPayment(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("rejette une demande pending sans jamais activer le plan", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: vendor._id,
      paymentHistory: [{ planTier: "individuel_plus", amount: 9.99, method: "card", status: "pending", period: "2026-07" }],
    });
    const paymentId = sub.paymentHistory[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), paymentId } });
    await adminRejectPlanPayment(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.paymentHistory[0].status).toBe("failed");
    expect(res.body.subscription.plan).toBe("free");
  });
});

describe("adminApproveBoost", () => {
  it("active un boost pending selon la durée de son palier, refuse un second appel", async () => {
    const vendor = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: vendor._id });
    const sub = await Subscription.create({
      vendor: vendor._id,
      boosts: [{ vehicle: vehicle._id, tier: "24h", isActive: false }],
    });
    const boostId = sub.boosts[0]._id.toString();

    const { req, res } = mockReqRes({ params: { subscriptionId: sub._id.toString(), boostId } });
    await adminApproveBoost(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.subscription.boosts[0].isActive).toBe(true);
    expect(res.body.subscription.boosts[0].paidAt).toBeTruthy();
    const start = new Date(res.body.subscription.boosts[0].startDate).getTime();
    const end   = new Date(res.body.subscription.boosts[0].endDate).getTime();
    expect(end - start).toBe(24 * 60 * 60 * 1000); // palier "24h"

    const { req: req2, res: res2 } = mockReqRes({ params: { subscriptionId: sub._id.toString(), boostId } });
    await adminApproveBoost(req2, res2);
    expect(res2.statusCode).toBe(409);
  });
});

describe("getPendingSubscriptionRequests (admin)", () => {
  it("liste les abonnements avec un paiement pending ou un boost inactif", async () => {
    const vendor1 = await createUser({ role: "partenaire" });
    const vendor2 = await createUser({ role: "partenaire" });
    await Subscription.create({ vendor: vendor1._id, paymentHistory: [{ planTier: "business", amount: 19.99, status: "pending" }] });
    await Subscription.create({ vendor: vendor2._id, plan: "business", planDetails: { isActive: true } });

    const { req, res } = mockReqRes({});
    await getPendingSubscriptionRequests(req, res);
    expect(res.body.subscriptions).toHaveLength(1);
    expect(res.body.subscriptions[0].vendor._id.toString()).toBe(vendor1._id.toString());
  });
});
