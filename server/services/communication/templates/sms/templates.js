// ── VIT AUTO — Templates SMS (160 chars max par segment) ──────────────────

const APP = "VIT AUTO";

export const SMS_TEMPLATES = {
  otp_verification: ({ code, minutes = 10 }) =>
    `[${APP}] Votre code de vérification : ${code}. Valable ${minutes} min. Ne le partagez jamais.`,

  otp_login: ({ code }) =>
    `[${APP}] Code de connexion 2FA : ${code}. Valable 5 min.`,

  booking_confirmed: ({ vehicleName, startDate, ref }) =>
    `[${APP}] Réservation confirmée ! ${vehicleName} du ${startDate}. Réf: ${ref}. Détails: vit-auto.com`,

  booking_reminder: ({ vehicleName, startDate, hoursLeft }) =>
    `[${APP}] Rappel: votre réservation ${vehicleName} commence dans ${hoursLeft}h (${startDate}). Bon voyage!`,

  payment_received: ({ amount, devise = "XOF", ref }) =>
    `[${APP}] Paiement reçu: ${Number(amount).toLocaleString("fr-FR")} ${devise}. Réf: ${ref}. Merci!`,

  transaction_step: ({ step, vehicleName }) =>
    `[${APP}] Mise à jour: votre transaction pour ${vehicleName} est à l'étape "${step}". Consultez l'app.`,

  kyc_approved: ({ firstName }) =>
    `[${APP}] Bonjour ${firstName}, votre identité a été vérifiée ! Accédez à toutes les fonctionnalités VIT AUTO.`,

  kyc_rejected: ({ firstName }) =>
    `[${APP}] ${firstName}, votre vérification d'identité a été refusée. Soumettez un nouveau dossier sur vit-auto.com.`,

  partner_approved: ({ companyName }) =>
    `[${APP}] ${companyName} est maintenant partenaire VIT AUTO ! Connectez-vous à votre tableau de bord.`,

  loi_ready: ({ companyName }) =>
    `[${APP}] ${companyName}: votre LOI est prête. Signez-la sur vit-auto.com/partner-onboarding`,

  agreement_ready: ({ companyName }) =>
    `[${APP}] ${companyName}: votre accord partenaire est prêt. Signez sur vit-auto.com/partner-onboarding`,

  driver_assigned: ({ firstName, driverName, vehicleName }) =>
    `[${APP}] ${firstName}, ${driverName} a été assigné comme chauffeur pour votre ${vehicleName}. Contact: voir l'app.`,

  escrow_released: ({ amount, devise = "XOF" }) =>
    `[${APP}] Fonds libérés: ${Number(amount).toLocaleString("fr-FR")} ${devise} virés sur votre compte. Délai: 2-5 jours ouvrables.`,

  generic: ({ message }) =>
    `[${APP}] ${message}`,
};

export function renderSms(template, data) {
  const fn = SMS_TEMPLATES[template];
  if (!fn) throw new Error(`SMS template "${template}" introuvable`);
  const text = fn(data);
  if (text.length > 320) {
    console.warn(`SMS template "${template}" trop long (${text.length} chars)`);
  }
  return text;
}
