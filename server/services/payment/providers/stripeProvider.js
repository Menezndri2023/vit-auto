import Stripe from "stripe";
import logger from "../../../utils/logger.js";

let _stripe = null;
function getClient() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

export function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Stripe attend le montant dans la plus petite unité de la devise (centimes) —
// SAUF pour les devises "zéro décimale" qu'il liste explicitement (dont le XOF/
// XAF utilisés par VIT AUTO en Afrique de l'Ouest/Centrale), où le montant
// s'envoie tel quel. https://stripe.com/docs/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

function toStripeAmount(amount, currency) {
  const cur = (currency || "XOF").toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(cur) ? Math.round(amount) : Math.round(amount * 100);
}

/**
 * Crée une session Stripe Checkout (page de paiement hébergée par Stripe —
 * le numéro de carte ne transite jamais par nos serveurs). Nécessite
 * STRIPE_SECRET_KEY (clé "sk_test_..." pour un compte Stripe en mode test,
 * "sk_live_..." en production) — voir isConfigured().
 */
export async function createCheckout({ payment, booking, successUrl, cancelUrl }) {
  const stripe = getClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: (payment.devise || "XOF").toLowerCase(),
        product_data: { name: `Réservation VIT AUTO ${booking.reference || ""}`.trim() },
        unit_amount: toStripeAmount(payment.amount, payment.devise),
      },
      quantity: 1,
    }],
    success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    client_reference_id: payment._id.toString(),
    metadata: { paymentId: payment._id.toString(), bookingId: booking._id.toString() },
  });
  logger.info("[Stripe] Session checkout créée", { paymentId: payment._id.toString(), sessionId: session.id });
  return { checkoutUrl: session.url, providerRef: session.id };
}

/**
 * Rembourse (total ou partiel) un paiement Stripe déjà complété — Booking
 * Engine, Remboursements (2026-09). `payment.transactionId` est l'ID de la
 * session Checkout, pas le PaymentIntent (voir createCheckout ci-dessus et
 * paymentController.completePayment, qui stocke `providerRef: session.id`) —
 * il faut donc d'abord retrouver le PaymentIntent sous-jacent avant de
 * pouvoir appeler l'API de remboursement Stripe.
 */
export async function refund({ payment, amount }) {
  const stripe = getClient();
  if (!stripe) throw new Error("Stripe non configuré côté serveur.");
  if (!payment.transactionId) throw new Error("Paiement Stripe sans session associée.");

  const session = await stripe.checkout.sessions.retrieve(payment.transactionId);
  if (!session.payment_intent) throw new Error("Session Stripe sans paiement associé (pas encore réglée ?).");

  const refund = await stripe.refunds.create({
    payment_intent: session.payment_intent,
    amount: toStripeAmount(amount, payment.devise),
  });
  logger.info("[Stripe] Remboursement effectué", { paymentId: payment._id.toString(), refundId: refund.id, amount });
  return { providerRefundId: refund.id };
}

/**
 * Vérifie la signature cryptographique du webhook Stripe (en-tête
 * "stripe-signature") — nécessite le corps BRUT de la requête (avant
 * express.json()), voir routes/payments.js. Lève une erreur si la signature
 * est invalide ou si STRIPE_WEBHOOK_SECRET n'est pas configuré.
 */
export function verifyWebhookSignature(rawBody, signature) {
  const stripe = getClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) throw new Error("Stripe non configuré côté serveur.");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
