import User from "../models/User.js";
import { sendEmail } from "../config/email.js";
import logger from "./logger.js";

const APP_URL = () => process.env.APP_URL || "https://vit-auto.com";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function alertHtml({ titre, message, type, lien }) {
  const link = lien ? `${APP_URL()}${lien}` : `${APP_URL()}/admin`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <h2 style="color:#0f1b3f;margin-top:0">${escapeHtml(titre)}</h2>
  <p style="color:#334155;white-space:pre-wrap">${escapeHtml(message)}</p>
  <p style="text-align:center;margin:24px 0">
    <a href="${link}" style="background:#0f1b3f;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Voir dans l'admin →</a>
  </p>
  <p style="color:#94a3b8;font-size:.78rem">Notification admin automatique — type : ${escapeHtml(type)}</p>
</div></body></html>`;
}

// ── Copie email d'une notification admin (voir models/Notification.js) ──────
// ADMIN_ALERT_EMAIL vide = désactivé (aucune copie envoyée, comportement
// inchangé). Ne bloque jamais la création de la notification elle-même —
// une panne d'envoi ne doit jamais empêcher l'action métier qui l'a
// déclenchée (booking, KYC, litige...).
export async function notifyAdminByEmail(notification) {
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!to || !notification?.user) return;
  try {
    const recipient = await User.findById(notification.user).select("role").lean();
    if (recipient?.role !== "admin") return;
    await sendEmail({
      to,
      subject: `[VIT AUTO Admin] ${notification.titre}`,
      html: alertHtml(notification),
    });
  } catch (err) {
    logger.warn("notifyAdminByEmail (non bloquant) :", err.message);
  }
}

export async function notifyAdminsByEmailBulk(notifications) {
  if (!process.env.ADMIN_ALERT_EMAIL) return;
  await Promise.all((notifications || []).map((n) => notifyAdminByEmail(n)));
}
