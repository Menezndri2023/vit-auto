/**
 * VIT AUTO — config/email.js
 *
 * Couche de compatibilité : redirige tous les anciens appels vers le
 * Communication Service (services/communication/).
 * Les controllers existants n'ont pas besoin d'être modifiés.
 */
import { sendViaEmail } from "../services/communication/CommunicationService.js";
import logger from "../utils/logger.js";

export const FROM_ADDRESS = () => process.env.EMAIL_FROM || "VIT AUTO <noreply@vit-auto.com>";

// ── sendEmail — interface inchangée pour compatibilité ────────────────────────
export async function sendEmail({ to, subject, html, text, attachments, template, userId } = {}) {
  return sendViaEmail({ to, subject, html, text, attachments, template, userId });
}

// ── Re-exports templates (rétrocompatibilité) ─────────────────────────────────
export { emailVerificationTemplate } from "../services/communication/templates/email/Verification.js";
export { passwordResetTemplate }     from "../services/communication/templates/email/Verification.js";
export { bookingConfirmationTemplate, newBookingPartnerTemplate, bookingAcceptedTemplate }
  from "../services/communication/templates/email/Booking.js";
export { transactionCompletedTemplate }
  from "../services/communication/templates/email/Reservation.js";
export { kycSubmittedTemplate }      from "../services/communication/templates/email/KYC.js";
export { invoiceTemplate as invoiceAvailableTemplate }
  from "../services/communication/templates/email/Invoice.js";
export { loiReadyTemplate }          from "../services/communication/templates/email/WelcomePartner.js";
export { agreementReadyTemplate }    from "../services/communication/templates/email/WelcomePartner.js";

// identityRejectedTemplate (synchrone — rétrocompatibilité)
export function identityRejectedTemplate(firstName, reason) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <h2 style="color:#0f1b3f">VIT AUTO — Vérification d'identité</h2>
  <p>Bonjour <strong>${firstName}</strong>,</p>
  <p>Votre dossier d'identité a été <strong style="color:#ef4444">refusé</strong> pour la raison suivante :</p>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;color:#991b1b">${reason || "Documents insuffisants ou illisibles."}</div>
  <p>Merci de soumettre à nouveau votre dossier depuis votre espace profil.</p>
</div></body></html>`;
}
