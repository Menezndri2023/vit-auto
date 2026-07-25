import crypto from "crypto";
import logger from "../../../utils/logger.js";

/**
 * Orange Money Web Payment API — https://developer.orange.com (Orange Money
 * Web Payment). Nécessite ORANGE_MONEY_CLIENT_ID, ORANGE_MONEY_CLIENT_SECRET
 * (identifiants OAuth de l'espace développeur Orange) et ORANGE_MONEY_MERCHANT_KEY
 * (clé marchand fournie à l'activation du compte). Sans ces variables,
 * isConfigured() renvoie false et le paiement passe par le mode simulé (voir
 * gateway.js).
 *
 * ⚠️ Le contrat exact (endpoints, champs) varie selon le pays et l'intégrateur
 * Orange Money (CI/SN/MA n'ont pas toujours exactement la même API) — ce code
 * suit la forme la plus largement documentée publiquement, mais n'a pas pu
 * être testé en conditions réelles faute d'un compte marchand (contrairement
 * à Stripe, Orange Money ne propose pas de clé de test self-service : il faut
 * s'inscrire sur developer.orange.com et obtenir un accès sandbox). À valider
 * précisément avec la documentation remise lors de l'activation du compte
 * marchand avant mise en production.
 */
const OAUTH_URL   = "https://api.orange.com/oauth/v3/token";
const PAYMENT_URL = (env) => `https://api.orange.com/orange-money-webpay/${env}/v1/webpayment`;

let _tokenCache = null; // { accessToken, expiresAt }

export function isConfigured() {
  return !!(process.env.ORANGE_MONEY_CLIENT_ID && process.env.ORANGE_MONEY_CLIENT_SECRET && process.env.ORANGE_MONEY_MERCHANT_KEY);
}

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.accessToken;

  const clientId     = process.env.ORANGE_MONEY_CLIENT_ID;
  const clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Orange Money OAuth échoué (${res.status})`);

  const data = await res.json();
  _tokenCache = {
    accessToken: data.access_token,
    // Marge de 60s avant expiration réelle pour éviter d'utiliser un token
    // sur le point d'expirer au moment précis de l'appel suivant.
    expiresAt: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000,
  };
  return _tokenCache.accessToken;
}

export async function createCheckout({ payment, booking, successUrl, cancelUrl }) {
  const accessToken = await getAccessToken();
  const env = process.env.ORANGE_MONEY_ENV || "mp"; // "mp" (production) vs sandbox selon doc remise à l'activation

  // Jeton secret à haute entropie, généré côté serveur et jamais renvoyé au
  // client (contrairement à checkoutUrl) — embarqué dans notif_url pour que le
  // webhook puisse vérifier que l'appel provient bien d'une notification liée
  // à CE paiement, faute de signature HMAC fournie par Orange Money. Sans lui,
  // quiconque connaît/devine un order_id peut simuler un paiement réussi.
  const webhookToken = crypto.randomBytes(24).toString("hex");
  const notifUrl = `${(process.env.API_URL || process.env.APP_URL || "").replace(/\/$/, "")}/api/payments/webhook/orange-money?wt=${webhookToken}`;

  const res = await fetch(PAYMENT_URL(env), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchant_key: process.env.ORANGE_MONEY_MERCHANT_KEY,
      currency: payment.devise || "XOF",
      order_id: payment._id.toString(),
      amount: Math.round(payment.amount),
      return_url: successUrl,
      cancel_url: cancelUrl,
      notif_url: notifUrl,
      lang: "fr",
      reference: booking.reference || payment._id.toString(),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Orange Money checkout création échouée (${res.status}) : ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  logger.info("[OrangeMoney] Paiement web créé", { paymentId: payment._id.toString(), payToken: data.pay_token });
  return { checkoutUrl: data.payment_url, providerRef: data.pay_token, webhookToken };
}

/**
 * Orange Money ne signe pas systématiquement ses callbacks avec une signature
 * HMAC standard (contrairement à Stripe/Wave) — la vérification se fait donc
 * via le jeton secret propre à VIT AUTO généré dans createCheckout ci-dessus
 * (voir paymentController.orangeMoneyWebhook, qui compare `req.query.wt` au
 * `payment.webhookToken` stocké en base avant de faire confiance au body).
 */
export function verifyWebhookPayload(body) {
  if (!body?.order_id || !body?.status) throw new Error("Callback Orange Money malformé.");
  return body;
}
