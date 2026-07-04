/**
 * VIT AUTO — PDF Worker
 *
 * Types:
 *   receipt           → Reçu de réservation (Buffer en mémoire)
 *   invoice           → Facture partenaire
 *   contract          → Contrat de prestation
 *   loi               → Lettre d'Intention (Founding Partner)
 *   agreement         → Accord de Partenariat Fondateur
 *   onboarding_report → Rapport dossier partenaire
 *
 * Résultat : { fileId, url } si stocké sur ImageKit, ou { buffer } si email attachment
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";

async function processPdfJob(job) {
  const { type, data, uploadToImageKit = false, sendEmail = false } = job.data;

  const { buildOnboardingPDFBuffer } = await import("../../utils/pdfGenerator.js");

  switch (type) {
    case "loi": {
      const { loiContent, referenceNumber, partnerEmail, partnerName } = data;
      const buffer = await buildOnboardingPDFBuffer(
        loiContent,
        "LETTRE D'INTENTION",
        `VA-LOI-${referenceNumber}`
      );

      if (sendEmail && partnerEmail) {
        const { sendViaEmail } = await import("../../services/communication/CommunicationService.js");
        const { loiReadyTemplate } = await import("../../services/communication/templates/email/WelcomePartner.js");
        const html = loiReadyTemplate({
          firstName:   partnerName,
          loiNumber:   `VA-LOI-${referenceNumber}`,
          signUrl:     data.signLink || `${process.env.APP_URL || "https://vit-auto.com"}/partner-onboarding?step=loi`,
        });
        await sendViaEmail({
          to:          partnerEmail,
          subject:     `VIT AUTO — Votre Lettre d'Intention VA-LOI-${referenceNumber}`,
          html,
          userId:      data.userId,
          attachments: [{ filename: `LOI-${referenceNumber}.pdf`, content: buffer, contentType: "application/pdf" }],
        });
      }

      return { type: "loi", referenceNumber, size: buffer.length };
    }

    case "agreement": {
      const { agreementContent, referenceNumber, partnerEmail, partnerName } = data;
      const buffer = await buildOnboardingPDFBuffer(
        agreementContent,
        "ACCORD DE PARTENARIAT FONDATEUR",
        `VA-FPA-${referenceNumber}`
      );

      if (sendEmail && partnerEmail) {
        const { sendViaEmail } = await import("../../services/communication/CommunicationService.js");
        const { agreementReadyTemplate } = await import("../../services/communication/templates/email/WelcomePartner.js");
        const html = agreementReadyTemplate({
          firstName:       partnerName,
          agreementNumber: `VA-FPA-${referenceNumber}`,
          signUrl:         data.signLink || `${process.env.APP_URL || "https://vit-auto.com"}/partner-onboarding?step=accord`,
        });
        await sendViaEmail({
          to:          partnerEmail,
          subject:     `VIT AUTO — Votre Accord VA-FPA-${referenceNumber}`,
          html,
          userId:      data.userId,
          attachments: [{ filename: `Accord-${referenceNumber}.pdf`, content: buffer, contentType: "application/pdf" }],
        });
      }

      return { type: "agreement", referenceNumber, size: buffer.length };
    }

    case "invoice":
    case "contract":
    case "receipt":
      // Ces types sont générés à la demande (streaming HTTP) — pas de stockage
      logger.info("[PdfWorker] Type géré à la demande", { type });
      return { type, skipped: true };

    default:
      throw new Error(`PDF type inconnu : ${type}`);
  }
}

export function startPdfWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.PDF,
    async (job) => {
      logger.debug("[PdfWorker] Traitement", { type: job.data.type, jobId: job.id });
      return processPdfJob(job);
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.PDF],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[PdfWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message });
  });

  logger.info("[PdfWorker] Démarré", { queue: QUEUE_NAMES.PDF });
  return worker;
}
