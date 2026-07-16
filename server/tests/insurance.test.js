import { describe, it, expect } from "vitest";
import { createRequest, getMyRequests, getAllRequests, setDecision } from "../controllers/insuranceController.js";
import InsuranceRequest from "../models/InsuranceRequest.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("createRequest", () => {
  it("rejette un type invalide", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({ user: client, body: { type: "sante" } });
    await createRequest(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("crée une demande, tronque les champs libres", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({
      user: client, body: { type: "auto", vehicleInfo: "x".repeat(500), notes: "y".repeat(2000) },
    });
    await createRequest(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.request.vehicleInfo.length).toBe(300);
    expect(res.body.request.notes.length).toBe(1000);
    expect(res.body.request.coveragePeriodMonths).toBe(12);
    expect(res.body.request.status).toBe("pending");
  });
});

describe("getMyRequests", () => {
  it("ne renvoie que les demandes du client connecté", async () => {
    const client1 = await createUser();
    const client2 = await createUser();
    await InsuranceRequest.create({ client: client1._id, type: "auto" });
    await InsuranceRequest.create({ client: client2._id, type: "location" });

    const { req, res } = mockReqRes({ user: client1 });
    await getMyRequests(req, res);
    expect(res.body.requests).toHaveLength(1);
  });
});

describe("getAllRequests (admin)", () => {
  it("filtre par statut", async () => {
    const client = await createUser();
    await InsuranceRequest.create({ client: client._id, type: "auto", status: "pending" });
    await InsuranceRequest.create({ client: client._id, type: "location", status: "approved" });

    const { req, res } = mockReqRes({ query: { status: "approved" } });
    await getAllRequests(req, res);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].status).toBe("approved");
  });
});

describe("setDecision (admin)", () => {
  it("rejette une décision invalide", async () => {
    const client = await createUser();
    const request = await InsuranceRequest.create({ client: client._id, type: "auto" });
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, params: { id: request._id.toString() }, body: { status: "maybe" } });
    await setDecision(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("approuve avec une prime, refuse en vide la prime", async () => {
    const client = await createUser();
    const admin = await createUser({ role: "admin" });

    const approved = await InsuranceRequest.create({ client: client._id, type: "auto" });
    const a = mockReqRes({ user: admin, params: { id: approved._id.toString() }, body: { status: "approved", premium: 45000, devise: "XOF" } });
    await setDecision(a.req, a.res);
    expect(a.res.statusCode).toBe(200);
    expect(a.res.body.request.premium).toBe(45000);
    expect(a.res.body.request.decisionBy.toString()).toBe(admin._id.toString());

    const rejected = await InsuranceRequest.create({ client: client._id, type: "auto", premium: 10000 });
    const r = mockReqRes({ user: admin, params: { id: rejected._id.toString() }, body: { status: "rejected", note: "Véhicule trop ancien" } });
    await setDecision(r.req, r.res);
    expect(r.res.body.request.premium).toBeNull();
    expect(r.res.body.request.decisionNote).toBe("Véhicule trop ancien");
  });

  it("404 pour une demande introuvable", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin,
      params: { id: "000000000000000000000000" },
      body: { status: "approved" },
    });
    await setDecision(req, res);
    expect(res.statusCode).toBe(404);
  });
});
