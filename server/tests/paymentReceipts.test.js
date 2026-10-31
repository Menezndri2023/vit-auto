import { describe, it, expect } from "vitest";
import { getRequestReceipt as getInsuranceReceipt } from "../controllers/insuranceController.js";
import { getRequestReceipt as getServiceReceipt } from "../controllers/serviceRequestController.js";
import { getTransactionReceipt } from "../controllers/ieTransactionController.js";
import InsuranceRequest from "../models/InsuranceRequest.js";
import ServiceRequest from "../models/ServiceRequest.js";
import { createUser, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Aucun reçu n'existait pour un paiement d'assurance, de service ou d'escrow
// Import/Export — seuls les bookings (location/vente/essai/chauffeur) en
// avaient un. Manque réel trouvé en audit.
describe("Reçus de paiement génériques", () => {
  it("insurance: refuse si la prime n'est pas payée", async () => {
    const client = await createUser();
    const request = await InsuranceRequest.create({ client: client._id, type: "auto", status: "approved", premium: 500 });

    const { req, res } = mockReqRes({ user: client, params: { id: request._id.toString() } });
    await getInsuranceReceipt(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("insurance: refuse un tiers non concerné", async () => {
    const client = await createUser();
    const stranger = await createUser();
    const request = await InsuranceRequest.create({ client: client._id, type: "auto", status: "approved", premium: 500, isPaid: true, paidAt: new Date() });

    const { req, res } = mockReqRes({ user: stranger, params: { id: request._id.toString() } });
    await getInsuranceReceipt(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("insurance: génère le PDF quand la prime est payée", async () => {
    const client = await createUser();
    const request = await InsuranceRequest.create({ client: client._id, type: "auto", status: "approved", premium: 500, isPaid: true, paidAt: new Date() });

    const { req, res } = mockReqRes({ user: client, params: { id: request._id.toString() } });
    await getInsuranceReceipt(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
  });

  it("service: génère le PDF quand le devis est payé", async () => {
    const client = await createUser();
    const request = await ServiceRequest.create({
      client: client._id, category: "inspection", status: "approved",
      quotedAmountUSD: 150, isPaid: true, paidAt: new Date(),
    });

    const { req, res } = mockReqRes({ user: client, params: { id: request._id.toString() } });
    await getServiceReceipt(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
  });

  it("service: refuse si le devis n'est pas payé", async () => {
    const client = await createUser();
    const request = await ServiceRequest.create({ client: client._id, category: "transport", status: "approved", quotedAmountUSD: 150 });

    const { req, res } = mockReqRes({ user: client, params: { id: request._id.toString() } });
    await getServiceReceipt(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("import/export: génère le PDF quand le paiement est confirmé", async () => {
    const client = await createUser();
    const tx = await createIETransaction({
      client: client._id,
      payment: { amount: 12000, currency: "EUR", paidAt: new Date(), method: "virement" },
    });

    const { req, res } = mockReqRes({ user: client, params: { id: tx._id.toString() } });
    await getTransactionReceipt(req, res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
  });

  it("import/export: refuse un tiers non concerné", async () => {
    const client = await createUser();
    const stranger = await createUser();
    const tx = await createIETransaction({
      client: client._id,
      payment: { amount: 12000, currency: "EUR", paidAt: new Date() },
    });

    const { req, res } = mockReqRes({ user: stranger, params: { id: tx._id.toString() } });
    await getTransactionReceipt(req, res);
    expect(res.statusCode).toBe(403);
  });

  // Séquestre fermé (2026-10-30) : un règlement direct RÉEL, confirmé par
  // l'exportateur, ouvre une attestation de règlement ; une simple déclaration non.
  it("import/export en règlement direct : rien tant que l'exportateur n'a pas confirmé", async () => {
    const client = await createUser();
    const tx = await createIETransaction({
      client: client._id, status: "payment_pending",
      reglementDirect: { declareParAcheteurLe: new Date(), referenceAcheteur: "SWIFT-42" },
    });

    const { req, res } = mockReqRes({ user: client, params: { id: tx._id.toString() } });
    await getTransactionReceipt(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/pas encore confirmé par l'exportateur/);
  });

  it("import/export en règlement direct confirmé : attestation PDF pour l'acheteur et l'exportateur", async () => {
    const client = await createUser();
    const partner = await createUser({ role: "partenaire" });
    const tx = await createIETransaction({
      client: client._id, partner: partner._id, status: "preparing",
      finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 },
      reglementDirect: { declareParAcheteurLe: new Date(), referenceAcheteur: "SWIFT-42", confirmeParExportateurLe: new Date() },
    });

    for (const user of [client, partner]) {
      const { req, res } = mockReqRes({ user, params: { id: tx._id.toString() } });
      await getTransactionReceipt(req, res);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    }
  });
});
