import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { initiatePayment, paydunyaWebhook } from "../controllers/paymentController.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// PayDunya, agrégateur retenu par l'exploitant (2026-10-09) : la facture est
// créée chez PayDunya, et un paiement n'est validé qu'après un rappel
// authentifié ET une relecture du statut au bon montant.
const CLES = { PAYDUNYA_MASTER_KEY: "maitre-test", PAYDUNYA_PRIVATE_KEY: "privee-test", PAYDUNYA_TOKEN: "jeton-test", PAYDUNYA_MODE: "test" };
const hashValide = crypto.createHash("sha512").update(CLES.PAYDUNYA_MASTER_KEY).digest("hex");
let statutConfirme;

beforeEach(() => {
  Object.assign(process.env, CLES);
  statutConfirme = { status: "completed", montant: 45000 };
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (String(url).includes("/checkout-invoice/create")) {
      return new Response(JSON.stringify({ response_code: "00", token: "tok_123", response_text: "https://app.paydunya.com/sandbox-checkout/invoice/tok_123" }), { status: 200 });
    }
    if (String(url).includes("/checkout-invoice/confirm/")) {
      return new Response(JSON.stringify({ response_code: "00", status: statutConfirme.status, invoice: { total_amount: statutConfirme.montant }, custom_data: {} }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(CLES)) delete process.env[k];
});

async function payerReservation() {
  const client = await createUser({ role: "client" });
  const booking = await Booking.create({ type: "location", client: client._id, clientInfo: { firstName: "A", lastName: "B", email: "a@vitauto-fixtures.fr", passportNumber: "P1" }, montantTotal: 45000, devise: "XOF" });
  const { req, res } = mockReqRes({ user: client, body: { bookingId: booking._id.toString(), method: "wave" } });
  await initiatePayment(req, res);
  return { res, booking, payment: await Payment.findById(res.body.paymentId) };
}
const rappel = async (body) => { const { req, res } = mockReqRes({ body }); await paydunyaWebhook(req, res); return res; };

describe("PayDunya", () => {
  it("crée la facture et renvoie la page de paiement PayDunya, même pour un moyen mobile money", async () => {
    const { res, payment } = await payerReservation();
    expect(res.body.checkoutUrl).toContain("paydunya.com");
    expect(res.body.simulated).toBe(false);
    expect(payment.fournisseur).toBe("paydunya");
    expect(payment.montantFournisseur).toBe(45000);
    expect(payment.transactionId).toBe("tok_123");
  });

  it("un rappel sans le bon hash est rejeté et ne valide rien", async () => {
    const { payment } = await payerReservation();
    expect((await rappel({ data: { hash: "faux", invoice: { token: "tok_123" } } })).status).toHaveBeenCalledWith(401);
    expect((await Payment.findById(payment._id).lean()).status).toBe("pending");
  });

  it("un rappel authentifié valide le paiement après relecture du statut", async () => {
    const { payment, booking } = await payerReservation();
    await rappel({ data: { hash: hashValide, invoice: { token: "tok_123" } } });
    expect((await Payment.findById(payment._id).lean()).status).toBe("completed");
    expect((await Booking.findById(booking._id).lean()).isPaid).toBe(true);
  });

  it("un montant confirmé différent ne valide pas le paiement", async () => {
    const { payment } = await payerReservation();
    statutConfirme = { status: "completed", montant: 100 };
    const res = await rappel({ data: { hash: hashValide, invoice: { token: "tok_123" } } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect((await Payment.findById(payment._id).lean()).status).toBe("pending");
  });
});
