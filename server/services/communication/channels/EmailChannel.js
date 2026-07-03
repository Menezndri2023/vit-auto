import { Resend } from "resend";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import logger from "../../../utils/logger.js";

const FROM = () => process.env.EMAIL_FROM || "VIT AUTO <noreply@vit-auto.com>";
const TRACK_BASE = () => (process.env.API_URL || process.env.APP_URL || "http://localhost:5001").replace(/\/$/, "");

let _provider = null;

function buildProvider() {
  if (_provider) return _provider;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const client = new Resend(resendKey);
    logger.info("[EmailChannel] Resend activé");
    _provider = {
      name: "resend",
      send: async ({ to, subject, html, text, attachments }) => {
        const payload = {
          from: FROM(),
          to: Array.isArray(to) ? to : [to],
          subject, html,
          ...(text ? { text } : {}),
        };
        if (attachments?.length) {
          payload.attachments = attachments.map((a) => ({
            filename: a.filename,
            content:  a.content ?? a.path,
          }));
        }
        const { data, error } = await client.emails.send(payload);
        if (error) throw new Error(error.message);
        return { messageId: data.id, provider: "resend" };
      },
    };
    return _provider;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST, port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      pool: true, maxConnections: 5,
    });
    transport.verify((err) => {
      if (err) logger.warn("[EmailChannel] SMTP verify failed", { error: err.message });
      else logger.info("[EmailChannel] SMTP activé", { host: SMTP_HOST });
    });
    _provider = {
      name: "smtp",
      send: async (opts) => {
        const info = await transport.sendMail({ from: FROM(), ...opts });
        return { messageId: info.messageId, provider: "smtp" };
      },
    };
    return _provider;
  }

  logger.warn("[EmailChannel] Mode console — aucun email réel envoyé");
  _provider = {
    name: "console",
    send: async ({ to, subject, html }) => {
      const link = html?.match(/href="([^"]+)"/)?.[1] || "";
      logger.info("[EMAIL SIMULÉ]", { to, subject, link: link || undefined });
      return { messageId: `console-${Date.now()}`, provider: "console" };
    },
  };
  return _provider;
}

export async function sendEmail({ to, subject, html, text, attachments, trackingId, userId } = {}) {
  const provider = buildProvider();

  // Injecter pixel de tracking si trackingId présent
  let finalHtml = html;
  if (trackingId && html && provider.name !== "console") {
    const pixelUrl = `${TRACK_BASE()}/api/comm/track/open/${trackingId}`;
    finalHtml += `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none"/>`;
  }

  const result = await provider.send({ to, subject, html: finalHtml, text, attachments });
  return { ...result, trackingId };
}

export function buildTrackingPixel(trackingId) {
  if (!trackingId) return "";
  const base = TRACK_BASE();
  return `<img src="${base}/api/comm/track/open/${trackingId}" width="1" height="1" alt="" style="display:none;max-height:0;overflow:hidden"/>`;
}

export function buildTrackedUrl(url, trackingId) {
  if (!trackingId || !url) return url;
  const base = TRACK_BASE();
  return `${base}/api/comm/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
}

export function getProviderName() {
  return buildProvider().name;
}
