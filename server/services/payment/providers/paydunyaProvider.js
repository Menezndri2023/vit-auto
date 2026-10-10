import crypto from "crypto";
import logger from "../../../utils/logger.js";
import { convertAmount } from "../../currencyEngine.js";

/**
 * PayDunya — agrégateur de paiement (choix de l'exploitant, 2026-10-09).
 * Un seul contrat couvre la carte bancaire, Orange Money, Wave, MTN, Moov,
 * Free Money… au Sénégal, en Côte d'Ivoire, au Bénin, au Togo, au Burkina et
 * au Mali : le client choisit son moyen sur la page PayDunya.
 *
 * Variables : PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN, et
 * PAYDUNYA_MODE = "test" (bac à sable, par défaut) ou "live".
 * Documentation : https://developers.paydunya.com/doc/FR/http_json
 *
 * Montants en francs CFA (XOF) : un paiement libellé dans une autre devise est
 * converti au taux du jour (services/currencyEngine.js) avant l'envoi.
 */
const OUTBOUND_TIMEOUT_MS = 15_000;
const base = () => (process.env.PAYDUNYA_MODE === "live"
  ? "https://app.paydunya.com/api/v1"
  : "https://app.paydunya.com/sandbox-api/v1");

export function isConfigured() {
  return !!(process.env.PAYDUNYA_MASTER_KEY && process.env.PAYDUNYA_PRIVATE_KEY && process.env.PAYDUNYA_TOKEN);
}

const entetes = () => ({
  "Content-Type": "application/json",
  "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY,
  "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY,
  "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN,
});

export async function montantXOF(montant, devise) {
  const d = String(devise || "XOF").toUpperCase();
  if (d === "XOF") return Math.round(Number(montant));
  const converti = await convertAmount(Number(montant), d, "XOF");
  if (!Number.isFinite(converti) || converti <= 0) throw new Error(`Conversion ${d} → XOF impossible.`);
  return Math.round(converti);
}

export async function createCheckout({ payment, booking, successUrl, cancelUrl, description }) {
  const api = (process.env.API_PUBLIC_URL || process.env.APP_URL || "https://vit-auto.com").replace(/\/$/, "");
  const total = await montantXOF(payment.amount, payment.devise);
  const libelle = description || `VIT AUTO — ${booking?.reference || payment._id.toString().slice(-8).toUpperCase()}`;
  const res = await fetch(`${base()}/checkout-invoice/create`, {
    method: "POST",
    headers: entetes(),
    body: JSON.stringify({
      invoice: { total_amount: total, description: libelle.slice(0, 200) },
      store: { name: "VIT AUTO", website_url: "https://vit-auto.com" },
      actions: { cancel_url: cancelUrl, return_url: successUrl, callback_url: `${api}/api/payments/webhook/paydunya` },
      custom_data: { paymentId: payment._id.toString() },
    }),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.response_code !== "00" || !data.token) {
    throw new Error(`PayDunya : création de facture refusée (${res.status} ${data.response_code || ""} ${String(data.response_text || "").slice(0, 120)})`);
  }
  logger.info("[PayDunya] Facture créée", { paymentId: payment._id.toString(), token: data.token, mode: process.env.PAYDUNYA_MODE || "test" });
  return { checkoutUrl: data.response_text, providerRef: data.token, montantXOF: total };
}

// Statut d'une facture, lu À LA SOURCE : un rappel (callback) n'est jamais
// cru sur parole, on redemande toujours à PayDunya.
export async function confirm(token) {
  const res = await fetch(`${base()}/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
    headers: entetes(), signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.response_code !== "00") throw new Error(`PayDunya : facture introuvable (${res.status}).`);
  return {
    status: data.status, // pending | completed | cancelled | failed
    montant: Number(data.invoice?.total_amount ?? NaN),
    paymentId: data.custom_data?.paymentId || null,
    failReason: data.fail_reason || null,
  };
}

// Le rappel PayDunya porte `hash` = SHA-512 de la clé principale : il prouve
// que l'appel vient de PayDunya (comparaison à temps constant).
export function verifierHash(hash) {
  const master = process.env.PAYDUNYA_MASTER_KEY;
  if (!master || typeof hash !== "string") return false;
  const attendu = crypto.createHash("sha512").update(master).digest("hex");
  const a = Buffer.from(attendu, "utf8"), b = Buffer.from(hash.toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
