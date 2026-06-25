import nodemailer from "nodemailer";
import logger from "../utils/logger.js";
import {
  emailVerificationTemplate,
  resetPasswordTemplate,
  bookingConfirmationTemplate,
  newBookingPartnerTemplate,
  bookingAcceptedTemplate,
  transactionCompletedTemplate,
  kycSubmittedTemplate,
  invoiceAvailableTemplate,
} from "../utils/emailTemplates.js";

// Re-export templates for backwards compat
export {
  emailVerificationTemplate,
  resetPasswordTemplate as passwordResetTemplate,
  bookingConfirmationTemplate,
  newBookingPartnerTemplate,
  bookingAcceptedTemplate,
  transactionCompletedTemplate,
  kycSubmittedTemplate,
  invoiceAvailableTemplate,
};

// Transporter intelligent : SMTP si configuré, sinon log console (dev)
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const t = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
      pool:   true,
      maxConnections: 5,
    });
    t.verify((err) => {
      if (err) logger.warn("SMTP verify failed", { error: err.message });
      else     logger.info("SMTP prêt", { host: SMTP_HOST });
    });
    return t;
  }

  // Fallback console — aucun vrai email envoyé
  return {
    sendMail: async (opts) => {
      const link = opts.html?.match(/href="([^"]+)"/)?.[1] || "";
      logger.info("EMAIL SIMULÉ (configurer SMTP dans .env)", {
        to: opts.to, subject: opts.subject, link: link || undefined,
      });
      return { messageId: "console-" + Date.now() };
    },
  };
}

export const transporter   = createTransporter();
export const FROM_ADDRESS  = process.env.SMTP_FROM || "VIT AUTO <noreply@vit-auto.com>";

// ── Envoi sécurisé — jamais de crash si email échoue ─────────────────────
export async function sendEmail({ to, subject, html, text }) {
  try {
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to, subject, html,
      text: text || html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    });
    logger.debug("Email envoyé", { to, subject, messageId: info.messageId });
    return info;
  } catch (err) {
    logger.error("Erreur envoi email", { to, subject, error: err.message });
    return null; // Ne jamais throw — l'email est non-bloquant
  }
}

// Template identité rejetée (rétrocompatibilité)
export function identityRejectedTemplate(firstName, reason) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <h2 style="color:#0f1b3f">🚗 VIT AUTO — Vérification d'identité</h2>
  <p>Bonjour <strong>${firstName}</strong>,</p>
  <p>Votre dossier d'identité a été <strong style="color:#ef4444">refusé</strong> pour la raison suivante :</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;color:#991b1b">${reason || "Documents insuffisants ou illisibles."}</div>
  <p>Merci de soumettre à nouveau votre dossier depuis votre espace profil.</p>
</div></body></html>`;
}
