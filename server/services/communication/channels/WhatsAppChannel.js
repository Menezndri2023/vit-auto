import logger from "../../../utils/logger.js";

// ── WhatsApp Business API (Meta) ──────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// Nécessite: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_BUSINESS_ID

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
        to:   to.replace(/\+/g, "").replace(/\s/g, ""),
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
        to:   to.replace(/\+/g, "").replace(/\s/g, ""),
        type: "text",
        text: { body: text, preview_url: false },
      };
    } else {
      throw new Error("WhatsApp: template ou text requis");
    }

    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
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
