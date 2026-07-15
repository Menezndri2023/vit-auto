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

// Relance Founding Partner — dossier resté incomplet (brouillon jamais soumis,
// ou informations manquantes signalées par l'admin). Voir adminRequestInfo
// (partnerOnboardingController.js) : jusqu'ici cette action n'envoyait qu'une
// notification in-app, jamais d'email — inefficace pour un partenaire inactif
// qui ne consulte pas le site.
export function foundingPartnerInfoRequestedTemplate(firstName, companyName, infoRequested, referenceNumber) {
  const portalUrl = `${process.env.APP_URL || "https://vit-auto.com"}/partner-onboarding`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <h2 style="color:#0f1b3f">VIT AUTO — Programme Founding Partner</h2>
  <p>Bonjour <strong>${firstName || ""}</strong>,</p>
  <p>Votre candidature Founding Partner${companyName ? ` (<strong>${companyName}</strong>)` : ""}${referenceNumber ? ` — réf. ${referenceNumber}` : ""} n'est pas encore complète. Notre équipe a besoin des informations suivantes pour poursuivre l'examen de votre dossier :</p>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin:16px 0;color:#92400e">${infoRequested}</div>
  <p style="text-align:center;margin:24px 0">
    <a href="${portalUrl}" style="background:#0f1b3f;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Compléter mon dossier →</a>
  </p>
  <p style="color:#64748b;font-size:.85rem">Le programme Founding Partner est limité aux 20 premiers partenaires par pays — plus votre dossier sera complété rapidement, plus vite il pourra être examiné.</p>
</div></body></html>`;
}
