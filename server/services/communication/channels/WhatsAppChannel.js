import logger from "../../../utils/logger.js";

// Délai maximal sur les appels sortants. Sans lui, un fournisseur qui ne
// répond pas laissait la requête HTTP appelante suspendue jusqu'au timeout
// par défaut de Node (~5 min) : le client voyait une page qui tourne au
// moment de payer et pouvait relancer le paiement.
const OUTBOUND_TIMEOUT_MS = 15_000;


// ── WhatsApp Business API (Meta) ──────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// Nécessite: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (WHATSAPP_GRAPH_VERSION facultatif)
//
// Version de la Graph API : figée en dur sur v18.0 (2023) jusqu'au 2026-10-07 —
// Meta retire chaque version environ deux ans après sa sortie. Réglable par
// WHATSAPP_GRAPH_VERSION (celle affichée dans le tableau de bord de l'app Meta).
const graphVersion = () => (process.env.WHATSAPP_GRAPH_VERSION || "v23.0").trim();

// Meta attend l'indicatif pays et des chiffres seulement (« 2250701020304 »).
// On retire espaces, tirets, points, parenthèses, « + » et le préfixe « 00 ».
export function numeroWhatsApp(brut) {
  const chiffres = String(brut || "").replace(/\D/g, "");
  return chiffres.startsWith("00") ? chiffres.slice(2) : chiffres;
}

export async function sendWhatsApp({ to, template, components = [], language = "fr", text }) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    logger.warn("[WhatsAppChannel] Credentials absents — message ignoré", { to });
    return { sent: false, provider: "whatsapp_api", reason: "not_configured" };
  }

  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: globalThis.fetch }));

    let body;
    if (template) {
      body = {
        messaging_product: "whatsapp",
        to:   numeroWhatsApp(to),
        type: "template",
        template: {
          name: template,
          language: { code: language === "fr" ? "fr" : "en_US" },
          ...(components.length ? { components } : {}),
        },
      };
    } else if (text) {
      body = {
        messaging_product: "whatsapp",
        to:   numeroWhatsApp(to),
        type: "text",
        text: { body: text, preview_url: false },
      };
    } else {
      throw new Error("WhatsApp: template ou text requis");
    }

    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneId}/messages`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "WhatsApp API error");

    logger.info("[WhatsAppChannel] Envoyé", { to, template: template || "text" });
    return { sent: true, provider: "whatsapp_api", messageId: json.messages?.[0]?.id };
  } catch (err) {
    logger.error("[WhatsAppChannel] Erreur", { error: err.message, to });
    return { sent: false, provider: "whatsapp_api", error: err.message };
  }
}

export function isAvailable() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}
