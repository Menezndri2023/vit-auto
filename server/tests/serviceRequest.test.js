import { describe, it, expect } from "vitest";
import { createRequest, getMyRequests, getAllRequests, setDecision } from "../controllers/serviceRequestController.js";
import ServiceRequest from "../models/ServiceRequest.js";
import PricingConfig from "../models/PricingConfig.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("createRequest", () => {
  it("rejette une catégorie invalide", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({ user: client, body: { category: "assurance" } });
    await createRequest(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("crée une demande, tronque les champs libres, ignore un details non-objet", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({
      user: client,
      body: { category: "transport", vehicleInfo: "x".repeat(500), notes: "y".repeat(2000), details: "not-an-object" },
    });
    await createRequest(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.request.vehicleInfo.length).toBe(300);
    expect(res.body.request.notes.length).toBe(1000);
    expect(res.body.request.status).toBe("pending");
    expect(res.body.request.details).toEqual({});
  });

  it("conserve les champs details fournis", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({
      user: client,
      body: { category: "change_devises", details: { amount: 1000, fromCurrency: "USD", toCurrency: "XOF" } },
    });
    await createRequest(req, res);
    expect(res.body.request.details.fromCurrency).toBe("USD");
  });
});

describe("getMyRequests", () => {
  it("ne renvoie que les demandes du client connecté", async () => {
    const client1 = await createUser();
    const client2 = await createUser();
    await ServiceRequest.create({ client: client1._id, category: "transport" });
    await ServiceRequest.create({ client: client2._id, category: "transit" });

    const { req, res } = mockReqRes({ user: client1 });
    await getMyRequests(req, res);
    expect(res.body.requests).toHaveLength(1);
  });
});

describe("getAllRequests (admin)", () => {
  it("filtre par statut et par catégorie", async () => {
    const client = await createUser();
    await ServiceRequest.create({ client: client._id, category: "transport", status: "pending" });
    await ServiceRequest.create({ client: client._id, category: "douanes", status: "approved" });

    const byStatus = mockReqRes({ query: { status: "approved" } });
    await getAllRequests(byStatus.req, byStatus.res);
    expect(byStatus.res.body.requests).toHaveLength(1);
    expect(byStatus.res.body.requests[0].category).toBe("douanes");

    const byCategory = mockReqRes({ query: { category: "transport" } });
    await getAllRequests(byCategory.req, byCategory.res);
    expect(byCategory.res.body.requests).toHaveLength(1);
    expect(byCategory.res.body.requests[0].category).toBe("transport");
  });
});

describe("setDecision (admin)", () => {
  it("rejette une décision invalide", async () => {
    const client = await createUser();
    const request = await ServiceRequest.create({ client: client._id, category: "transport" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: request._id.toString() }, body: { status: "maybe" } });
    await setDecision(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("approuve avec un devis, calcule la commission depuis PricingConfig.services.<catégorie>", async () => {
    await PricingConfig.create({
      key: "global",
      commissions: { standard: { vente: 0.03, location: 0.15, chauffeur: 0.10, import_export: 0.03, leasing: 0.05 }, premium: { vente: 0.02, location: 0.12, chauffeur: 0.08, import_export: 0.02, leasing: 0.04 } },
      foundingPartner: { durationMonths: 12, entreprise: { location: 0.10, vente: 0.015, import_export: 0.015 }, particulier: { location: 0.10, vente: 0.02, import_export: null } },
      serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
      boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
      subscriptions: { individuel_plus: { priceUSD: 9.99 }, business: { priceUSD: 19.99 }, exportateur: { priceUSD: 49.99 } },
      services: { transport: { enabled: true, commissionRate: 0.1, fixedFeeUSD: 5 } },
    });

    const client = await createUser();
    const admin = await createUser({ role: "admin" });
    const request = await ServiceRequest.create({ client: client._id, category: "transport" });

    const { req, res } = mockReqRes({ user: admin, params: { id: request._id.toString() }, body: { status: "approved", quotedAmountUSD: 1000 } });
    await setDecision(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.request.quotedAmountUSD).toBe(1000);
    expect(res.body.request.commission.rate).toBe(0.1);
    expect(res.body.request.commission.amount).toBe(105); // 1000*0.1 + 5
  });

  it("refus vide le devis et la commission", async () => {
    const client = await createUser();
    const admin = await createUser({ role: "admin" });
    const request = await ServiceRequest.create({ client: client._id, category: "garantie", quotedAmountUSD: 200 });

    const { req, res } = mockReqRes({ user: admin, params: { id: request._id.toString() }, body: { status: "rejected", note: "Véhicule inéligible" } });
    await setDecision(req, res);
    expect(res.body.request.quotedAmountUSD).toBeNull();
    expect(res.body.request.commission.amount).toBeNull();
    expect(res.body.request.decisionNote).toBe("Véhicule inéligible");
  });

  it("404 pour une demande introuvable", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: "000000000000000000000000" }, body: { status: "approved" } });
    await setDecision(req, res);
    expect(res.statusCode).toBe(404);
  });
});
