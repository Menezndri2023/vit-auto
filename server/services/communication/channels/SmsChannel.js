import logger from "../../../utils/logger.js";
import { renderSms } from "../templates/sms/templates.js";

export async function sendSms({ to, template, data, message }) {
  const text = message || (template ? renderSms(template, data || {}) : null);
  if (!text) throw new Error("SMS: message ou template requis");

  // ── 1. Africa's Talking ───────────────────────────────────────────────────
  const { AT_USERNAME, AT_API_KEY, AT_SENDER_ID } = process.env;
  if (AT_USERNAME && AT_API_KEY && !AT_API_KEY.startsWith("atsk_xxx")) {
    try {
      const { default: AfricasTalking } = await import("africastalking");
      const at = AfricasTalking({ username: AT_USERNAME, apiKey: AT_API_KEY });
      const result = await at.SMS.send({
        to:   Array.isArray(to) ? to : [to],
        message: text,
        from: AT_SENDER_ID || "VIT-AUTO",
      });
      logger.info("[SmsChannel] Envoyé via Africa's Talking", { to, chars: text.length });
      return { sent: true, provider: "africastalking", result };
    } catch (err) {
      logger.error("[SmsChannel] Africa's Talking error", { error: err.message });
    }
  }

  // ── 2. Twilio ─────────────────────────────────────────────────────────────
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM } = process.env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_FROM) {
    try {
      const { default: twilio } = await import("twilio");
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const phoneList = Array.isArray(to) ? to : [to];
      await Promise.all(phoneList.map((phone) =>
        client.messages.create({ body: text, from: TWILIO_PHONE_FROM, to: phone })
      ));
      logger.info("[SmsChannel] Envoyé via Twilio", { to, chars: text.length });
      return { sent: true, provider: "twilio" };
    } catch (err) {
      logger.error("[SmsChannel] Twilio error", { error: err.message });
    }
  }

  // ── 3. Console fallback ───────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    logger.info(`[SMS DEV] → ${Array.isArray(to) ? to.join(", ") : to}`, { text });
    return { sent: false, provider: "console" };
  }

  logger.error("[SmsChannel] Aucun provider SMS configuré", { to });
  return { sent: false, provider: "none" };
}
