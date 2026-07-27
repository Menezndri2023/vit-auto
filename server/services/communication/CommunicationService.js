/**
 * VIT AUTO — Communication Service (moteur central)
 *
 * Façade unifiée pour tous les canaux : email, SMS, WhatsApp, push, internal.
 * Tous les envois passent par ce service → log centralisé + analytics.
 */
import { randomUUID } from "crypto";
import logger from "../../utils/logger.js";
import { logSend } from "./analytics/CommunicationAnalytics.js";
import { sendEmail, buildTrackingPixel, buildTrackedUrl, getProviderName } from "./channels/EmailChannel.js";
import { sendSms }      from "./channels/SmsChannel.js";
import { sendWhatsApp } from "./channels/WhatsAppChannel.js";
import { sendPush }     from "./channels/PushChannel.js";
import { sendInternal, sendInternalBroadcast } from "./channels/InternalChannel.js";

// ── Templates email ───────────────────────────────────────────────────────────
import { emailVerificationTemplate, passwordResetTemplate, emailChangeConfirmationTemplate } from "./templates/email/Verification.js";
import { bookingConfirmationTemplate, newBookingPartnerTemplate, bookingAcceptedTemplate, paymentReceiptTemplate } from "./templates/email/Booking.js";
import { reservationCreatedTemplate, reservationConfirmedTemplate, transactionCompletedTemplate } from "./templates/email/Reservation.js";
import { invoiceTemplate }    from "./templates/email/Invoice.js";
import { welcomePartnerTemplate, loiReadyTemplate, agreementReadyTemplate, documentsReadyTemplate } from "./templates/email/WelcomePartner.js";
import { loiSignedTemplate, agreementSignedTemplate } from "./templates/email/LOI.js";
import { contractReadyTemplate, contractSignedTemplate } from "./templates/email/Contract.js";
import { kycSubmittedTemplate, kycApprovedTemplate, kycRejectedTemplate } from "./templates/email/KYC.js";

const EMAIL_TEMPLATES = {
  email_verification:      emailVerificationTemplate,
  email_change_confirmation: emailChangeConfirmationTemplate,
  password_reset:          passwordResetTemplate,
  booking_confirmation:    bookingConfirmationTemplate,
  new_booking_partner:     newBookingPartnerTemplate,
  booking_accepted:        bookingAcceptedTemplate,
  payment_receipt:         paymentReceiptTemplate,
  reservation_created:     reservationCreatedTemplate,
  reservation_confirmed:   reservationConfirmedTemplate,
  transaction_completed:   transactionCompletedTemplate,
  invoice:                 invoiceTemplate,
  welcome_partner:         welcomePartnerTemplate,
  loi_ready:               loiReadyTemplate,
  agreement_ready:         agreementReadyTemplate,
  documents_ready_reminder: documentsReadyTemplate,
  loi_signed:              loiSignedTemplate,
  agreement_signed:        agreementSignedTemplate,
  contract_ready:          contractReadyTemplate,
  contract_signed:         contractSignedTemplate,
  kyc_submitted:           kycSubmittedTemplate,
  kyc_approved:            kycApprovedTemplate,
  kyc_rejected:            kycRejectedTemplate,
};

// ─────────────────────────────────────────────────────────────────────────────
// sendViaEmail — email avec template ou HTML brut
// ─────────────────────────────────────────────────────────────────────────────
export async function sendViaEmail({
  to, subject, html, template, data = {}, userId,
  priority = "normal", tags = [], context = {}, attachments = [],
}) {
  const trackingId = randomUUID();

  try {
    let finalHtml = html;

    if (template && EMAIL_TEMPLATES[template]) {
      const pixel = buildTrackingPixel(trackingId);
      finalHtml = EMAIL_TEMPLATES[template](data, pixel);
    } else if (!finalHtml) {
      throw new Error(`Template email "${template}" introuvable`);
    }

    const { messageId, provider } = await sendEmail({
      to, subject, html: finalHtml, trackingId, userId, attachments,
    });

    await logSend({
      userId, to, channel: "email", template, subject,
      preview: subject, provider: provider || getProviderName(),
      messageId, status: "sent", trackingId, context, tags, priority,
    });

    logger.info("[CommService] Email envoyé", { to, template, provider });
    return { sent: true, messageId, trackingId };
  } catch (err) {
    await logSend({
      userId, to, channel: "email", template, subject,
      provider: getProviderName(), status: "failed",
      errorMessage: err.message, context, tags, priority,
    });
    logger.error("[CommService] Email failed", { to, template, error: err.message });
    return { sent: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendViaSms
// ─────────────────────────────────────────────────────────────────────────────
export async function sendViaSms({ to, template, data, message, userId, priority = "normal", context = {} }) {
  try {
    const result = await sendSms({ to, template, data, message });
    await logSend({
      userId, to: Array.isArray(to) ? to.join(",") : to,
      channel: "sms", template, preview: message?.slice(0, 80) || template,
      provider: result.provider, status: result.sent ? "sent" : "failed",
      context, priority,
    });
    return result;
  } catch (err) {
    logger.error("[CommService] SMS failed", { to, error: err.message });
    return { sent: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendViaWhatsApp
// ─────────────────────────────────────────────────────────────────────────────
export async function sendViaWhatsApp({ to, template, components, text, language, userId, context = {} }) {
  try {
    const result = await sendWhatsApp({ to, template, components, text, language });
    await logSend({
      userId, to, channel: "whatsapp", template,
      provider: result.provider, messageId: result.messageId,
      status: result.sent ? "sent" : "failed",
      errorMessage: result.error, context,
    });
    return result;
  } catch (err) {
    logger.error("[CommService] WhatsApp failed", { to, error: err.message });
    return { sent: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendViaPush
// ─────────────────────────────────────────────────────────────────────────────
export async function sendViaPush({ to, title, body, data, imageUrl, userId, context = {} }) {
  try {
    const result = await sendPush({ to, title, body, data, imageUrl });
    await logSend({
      userId, to: Array.isArray(to) ? `${to.length} tokens` : to,
      channel: "push", preview: title,
      provider: result.provider, status: result.sent ? "sent" : "failed",
      errorMessage: result.error, context,
    });
    return result;
  } catch (err) {
    logger.error("[CommService] Push failed", { title, error: err.message });
    return { sent: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendViaInternal — notification Socket.io + MongoDB
// ─────────────────────────────────────────────────────────────────────────────
export async function sendViaInternal({ userId, type, titre, message, lien, priority, metadata }) {
  return sendInternal({ userId, type, titre, message, lien, priority, metadata });
}

// ─────────────────────────────────────────────────────────────────────────────
// broadcast — envoyer à tous les utilisateurs d'un rôle
// ─────────────────────────────────────────────────────────────────────────────
export async function broadcast({ role, type, titre, message, lien }) {
  return sendInternalBroadcast({ role, type, titre, message, lien });
}

// ─────────────────────────────────────────────────────────────────────────────
// send — façade unifiée multi-canal
// ─────────────────────────────────────────────────────────────────────────────
export async function send({ channel = "email", ...params }) {
  switch (channel) {
    case "email":    return sendViaEmail(params);
    case "sms":      return sendViaSms(params);
    case "whatsapp": return sendViaWhatsApp(params);
    case "push":     return sendViaPush(params);
    case "internal": return sendViaInternal(params);
    default: throw new Error(`Canal inconnu : ${channel}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendMulti — envoyer sur plusieurs canaux simultanément
// ─────────────────────────────────────────────────────────────────────────────
export async function sendMulti({ channels = [], ...params }) {
  return Promise.allSettled(channels.map((ch) => send({ channel: ch, ...params })));
}

export { buildTrackedUrl, buildTrackingPixel, EMAIL_TEMPLATES };
