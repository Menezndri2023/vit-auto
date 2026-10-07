import { describe, it, expect, beforeEach } from "vitest";
import { payEscrow, confirmEscrowPayment, releaseFunds } from "../controllers/ieTransactionController.js";
import IETransaction from "../models/IETransaction.js";
import { createUser, createListing, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Cette suite construit directement une transaction au statut "payment_pending"
// (finalOffer déjà négociée) plutôt que de rejouer tout le cycle de 14 étapes
// (createReservation → confirmReservation → inspection → sendFinalOffer →
// acceptOffer) — hors périmètre ici : on cible le risque réel signalé (argent),
// pas la négociation qui le précède.
describe("Cycle escrow Import/Export (ieTransactionController)", () => {
  let client, partner, admin, tx;

  beforeEach(async () => {
    client = await createUser({ role: "client" });
    partner = await createUser({ role: "client", isFounder: true });
    admin = await createUser({ role: "admin" });
    const listing = await createListing({ partner: partner._id });
    tx = await createIETransaction({
      listing: listing._id,
      client: client._id,
      partner: partner._id,
      status: "payment_pending",
      finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 },
    });
  });

  it("refuse de libérer les fonds avant que la transaction soit livrée", async () => {
    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin });
    await releaseFunds(req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    const stillPending = await IETransaction.findById(tx._id);
    expect(stillPending.status).toBe("payment_pending");
  });

  it("refuse payEscrow sans moyen de paiement précisé", async () => {
    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: client, body: {} });
    await payEscrow(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("déroule le cycle escrow complet : déclaration → vérification admin → libération avec commission", async () => {
    // 1. Le client déclare son paiement (virement bancaire)
    let { req, res } = mockReqRes({
      params: { id: tx._id.toString() },
      user: client,
      body: { method: "virement", transactionRef: "REF-TEST-1" },
    });
    await payEscrow(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(404);

    let updated = await IETransaction.findById(tx._id);
    expect(updated.status).toBe("payment_submitted");
    expect(updated.payment.amount).toBe(25000);
    expect(updated.payment.method).toBe("virement");

    // 2. L'admin vérifie la réception réelle des fonds
    ({ req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin }));
    await confirmEscrowPayment(req, res);
    updated = await IETransaction.findById(tx._id);
    expect(updated.status).toBe("in_escrow");
    expect(updated.payment.escrowRef).toBeTruthy();
    expect(updated.payment.verifiedBy.toString()).toBe(admin._id.toString());

    // 3. Livraison (hors périmètre argent, on avance directement le statut)
    updated.status = "delivered";
    await updated.save();

    // 4. Le client ne libère plus les fonds (règle du 2026-10-07) : VIT AUTO seul.
    ({ req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: client }));
    await releaseFunds(req, res);
    expect(res.status).toHaveBeenCalledWith(403);

    // 5. L'admin verse : commission calculée sur la part exportateur (offre négociée = 25 000).
    ({ req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin }));
    await releaseFunds(req, res);
    updated = await IETransaction.findById(tx._id);
    expect(updated.status).toBe("funds_released");
    expect(updated.payment.commission.rate).toBeGreaterThan(0);
    expect(updated.payment.commission.amount).toBeGreaterThan(0);
    expect(updated.payment.commission.payoutAmount).toBe(
      Math.round((25000 - updated.payment.commission.amount) * 100) / 100
    );
  });

  it("refuse à un tiers non-participant de libérer les fonds", async () => {
    tx.status = "delivered";
    await tx.save();
    const stranger = await createUser({ role: "client" });

    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: stranger });
    await releaseFunds(req, res);
    expect(res.status).toHaveBeenCalledWith(403);

    const stillDelivered = await IETransaction.findById(tx._id);
    expect(stillDelivered.status).toBe("delivered");
  });

  it("paie l'exportateur à l'embarquement, seulement une fois le connaissement validé", async () => {
    tx.status = "shipped";
    tx.payment = { amount: 25000, currency: "EUR", method: "virement" };
    await tx.save();
    let { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin });
    await releaseFunds(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    await IETransaction.updateOne({ _id: tx._id }, { $set: { "documents.billOfLading.status": "valide" } });
    ({ req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin }));
    await releaseFunds(req, res);
    const apres = await IETransaction.findById(tx._id);
    expect(apres.status).toBe("shipped");           // l'acheminement continue
    expect(apres.payment.releasedAt).toBeTruthy();

    // Deuxième versement refusé.
    ({ req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin }));
    await releaseFunds(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("achat direct : la commission et le versement portent sur la part exportateur, pas sur le total client", async () => {
    await IETransaction.updateOne({ _id: tx._id }, { $set: {
      status: "delivered", directPurchase: true,
      payment: { amount: 40000, currency: "EUR", method: "virement" },
      ventilation: { exportateur: 25000, logistique: 3000, droitsTaxes: 10500, fraisVitAuto: 1500, currency: "EUR" },
    } });
    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin });
    await releaseFunds(req, res);
    const apres = await IETransaction.findById(tx._id);
    const { amount, payoutAmount } = apres.payment.commission;
    expect(amount).toBe(Math.round(25000 * apres.payment.commission.rate * 100) / 100);
    expect(payoutAmount).toBe(Math.round((25000 - amount) * 100) / 100);
    expect(payoutAmount).toBeLessThan(25000);
  });
});
