/**
 * VIT AUTO — Email Worker
 *
 * Traite tous les envois d'emails de la plateforme.
 * Délègue au CommunicationService (Resend → SMTP → console).
 *
 * Types de jobs supportés :
 *   booking_confirmation | booking_accepted | booking_cancelled
 *   kyc_submitted | kyc_approved | kyc_rejected
 *   welcome_partner | loi_ready | agreement_ready | loi_signed | agreement_signed
 *   invoice_ready | transaction_completed
 *   email_verification | password_reset | identity_rejected
 *   contract_ready | contract_signed
 *   reservation_created | reservation_confirmed
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";

// ── Dispatche vers le bon template selon le type de job ──────────────────────
async function processEmail(job) {
  const { type, to, userId, data = {}, subject, html } = job.data;

  const { sendViaEmail } = await import("../../services/communication/CommunicationService.js");

  // HTML brut (ex: reset password depuis auth controller)
  if (html && !type) {
    return sendViaEmail({ to, subject, html, userId });
  }

  // Résoudre le template email
  let templateData;
  try {
    templateData = await resolveEmailTemplate(type, data);
  } catch (err) {
    throw new Error(`Template email "${type}" introuvable : ${err.message}`);
  }

  return sendViaEmail({
    to,
    subject:  templateData.subject || subject,
    template: templateData.template,
    data:     templateData.data,
    html:     templateData.html,
    userId,
    tags:     [type],
    context:  { jobId: job.id, jobType: type },
  });
}

async function resolveEmailTemplate(type, data) {
  switch (type) {
    // ── Réservation ──────────────────────────────────────────────────────
    case "booking_confirmation":
      return {
        subject:  `VIT AUTO — Confirmation de votre réservation ${data.reference || ""}`,
        template: "booking_confirmation",
        data,
      };
    case "booking_accepted":
      return { subject: "VIT AUTO — Votre réservation a été acceptée", template: "booking_accepted", data };
    case "booking_cancelled":
      return { subject: "VIT AUTO — Annulation de réservation", template: "booking_confirmation", data };

    // ── KYC ──────────────────────────────────────────────────────────────
    case "kyc_submitted":
      return { subject: "VIT AUTO — Dossier KYC reçu", template: "kyc_submitted", data };
    case "kyc_approved":
      return { subject: "VIT AUTO — ✅ Identité vérifiée", template: "kyc_approved", data };
    case "kyc_rejected":
      return { subject: "VIT AUTO — Dossier KYC refusé", template: "kyc_rejected", data };

    // ── Partenaires ──────────────────────────────────────────────────────
    case "welcome_partner":
      return { subject: "Bienvenue chez VIT AUTO Partenaires 🤝", template: "welcome_partner", data };
    case "loi_ready":
      return { subject: "VIT AUTO — Votre Lettre d'Intention est prête", template: "loi_ready", data };
    case "agreement_ready":
      return { subject: "VIT AUTO — Votre Accord de Partenariat est prêt", template: "agreement_ready", data };
    case "loi_signed":
      return { subject: "VIT AUTO — LOI signée ✅", template: "loi_signed", data };
    case "agreement_signed":
      return { subject: "VIT AUTO — Accord signé — Activation Founding Partner 🎉", template: "agreement_signed", data };

    // ── Factures ──────────────────────────────────────────────────────────
    case "invoice_ready":
      return { subject: `VIT AUTO — Facture #${data.invoiceNumber || ""}`, template: "invoice", data };
    case "transaction_completed":
      return { subject: "VIT AUTO — Transaction finalisée", template: "transaction_completed", data };

    // ── Auth ──────────────────────────────────────────────────────────────
    case "email_verification":
      return { subject: "VIT AUTO — Vérifiez votre e-mail", template: "email_verification", data };
    case "password_reset":
      return { subject: "VIT AUTO — Réinitialisation de mot de passe", template: "password_reset", data };
    case "identity_rejected": {
      const { identityRejectedTemplate } = await import("../../config/email.js");
      return {
        subject: "VIT AUTO — Vérification d'identité refusée",
        html:    identityRejectedTemplate(data.firstName, data.reason),
      };
    }

    // ── Contrats ──────────────────────────────────────────────────────────
    case "contract_ready":
      return { subject: "VIT AUTO — Votre contrat est disponible", template: "contract_ready", data };
    case "contract_signed":
      return { subject: "VIT AUTO — Contrat signé ✅", template: "contract_signed", data };

    // ── Réservations IE ───────────────────────────────────────────────────
    case "reservation_created":
      return { subject: "VIT AUTO — Demande reçue", template: "reservation_created", data };
    case "reservation_confirmed":
      return { subject: "VIT AUTO — Réservation confirmée ✅", template: "reservation_confirmed", data };

    default:
      throw new Error(`Type "${type}" non géré par le worker email`);
  }
}

// ── Démarrage du worker ───────────────────────────────────────────────────────
export function startEmailWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      logger.debug("[EmailWorker] Traitement", { type: job.data.type, jobId: job.id, to: job.data.to });
      return processEmail(job);
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.EMAIL],
    }
  );

  worker.on("completed", (job) => {
    logger.debug("[EmailWorker] Complété", { jobId: job.id, type: job.data.type });
  });
  worker.on("failed", (job, err) => {
    logger.error("[EmailWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message, attempts: job?.attemptsMade });
  });

  logger.info("[EmailWorker] Démarré", { queue: QUEUE_NAMES.EMAIL });
  return worker;
}
