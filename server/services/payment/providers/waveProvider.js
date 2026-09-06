import crypto from "crypto";
import logger from "../../../utils/logger.js";

/**
 * Wave Checkout API (Côte d'Ivoire / Sénégal) — https://docs.wave.com
 * Nécessite WAVE_API_KEY (clé secrète du compte marchand Wave Business) et,
 * pour la vérification webhook, WAVE_WEBHOOK_SECRET. Sans ces variables,
 * isConfigured() renvoie false et le paiement passe par le mode simulé
 * (voir gateway.js) — le code ci-dessous suit le contrat documenté par Wave
 * mais n'a pas pu être testé en conditions réelles faute d'un compte
 * marchand Wave (nécessite une inscription business, pas de clé de test
 * self-service comme Stripe) : à valider avec un vrai compte sandbox avant
 * mise en production.
 */
const API_BASE = "https://api.wave.com/v1";

export function isConfigured() {
  return !!process.env.WAVE_API_KEY;
}

export async function createCheckout({ payment, booking, successUrl, cancelUrl }) {
  const apiKey = process.env.WAVE_API_KEY;
  const res = await fetch(`${API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(Math.round(payment.amount)),
      currency: payment.devise || "XOF",
      error_url: cancelUrl,
      success_url: successUrl,
      client_reference: payment._id.toString(),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wave checkout création échouée (${res.status}) : ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  logger.info("[Wave] Session checkout créée", { paymentId: payment._id.toString(), sessionId: data.id });
  return { checkoutUrl: data.wave_launch_url, providerRef: data.id };
}

/**
 * Rembourse intégralement une session Wave déjà payée — Booking Engine,
 * Remboursements (2026-09). Comme pour createCheckout ci-dessus, ce code
 * suit le contrat documenté publiquement par Wave
 * (POST /checkout/sessions/:id/refund) mais n'a pas pu être testé en
 * conditions réelles faute de compte marchand — à valider avec un vrai
 * compte sandbox avant mise en production. L'API Wave documentée ne permet
 * qu'un remboursement TOTAL de la session (pas de montant partiel) —
 * refundService.js retombe donc en mode manuel si un remboursement partiel
 * est demandé sur un paiement Wave plutôt que de rembourser plus que prévu.
 */
export async function refund({ payment }) {
  const apiKey = process.env.WAVE_API_KEY;
  if (!apiKey) throw new Error("Wave non configuré côté serveur.");
  if (!payment.transactionId) throw new Error("Paiement Wave sans session associée.");

  const res = await fetch(`${API_BASE}/checkout/sessions/${payment.transactionId}/refund`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wave remboursement échoué (${res.status}) : ${body.slice(0, 200)}`);
  }
  logger.info("[Wave] Remboursement effectué", { paymentId: payment._id.toString(), sessionId: payment.transactionId });
  return { providerRefundId: payment.transactionId };
}

/**
 * Vérifie la signature HMAC du webhook Wave (en-tête "Wave-Signature",
 * format "t=<timestamp>,v1=<hmac>"). Lève une erreur si la signature est
 * absente/invalide ou si WAVE_WEBHOOK_SECRET n'est pas configuré.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Wave non configuré côté serveur (WAVE_WEBHOOK_SECRET manquant).");
  if (!signatureHeader) throw new Error("En-tête Wave-Signature manquant.");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=").map((s) => s.trim()))
  );
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) throw new Error("En-tête Wave-Signature malformé.");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const validBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(signature, "hex");
  if (validBuf.length !== gotBuf.length || !crypto.timingSafeEqual(validBuf, gotBuf)) {
    throw new Error("Signature Wave invalide.");
  }
  return JSON.parse(rawBody);
}
