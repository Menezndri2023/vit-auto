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
import { captureException } from "../../config/sentry.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processPdfJob(job) {
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

    // Reçu de transaction (cash sur place ou paiement en ligne confirmé) —
    // voir dispatch.transactionReceiptReady dans queue/index.js, déclenché
    // depuis bookingController.validateTransaction et paymentController.completePayment.
    case "receipt": {
      const { generateReceiptPDFBuffer } = await import("../../utils/pdfGenerator.js");
      const { booking, clientEmail } = data;
      const buffer = await generateReceiptPDFBuffer(booking);

      if (sendEmail && clientEmail) {
        const { sendViaEmail } = await import("../../services/communication/CommunicationService.js");
        await sendViaEmail({
          to: clientEmail,
          subject: `VIT AUTO — Reçu de paiement ${booking?.reference || ""}`,
          template: "payment_receipt",
          data: {
            firstName:  booking?.clientInfo?.firstName,
            vehicleName: booking?.vehicle?.title,
            booking: {
              reference:     booking?.reference,
              montantTotal:  booking?.montantTotal,
              devise:        booking?.devise,
              paymentMethod: booking?.transaction?.paymentMethod,
            },
          },
          userId: data.userId,
          attachments: [{ filename: `recu-${booking?.reference || "transaction"}.pdf`, content: buffer, contentType: "application/pdf" }],
        });
      }

      return { type: "receipt", size: buffer.length };
    }

    // Facture mensuelle de commission partenaire — voir dispatch.partnerInvoiceReady
    // dans queue/index.js, déclenché depuis invoiceController.js.
    case "invoice": {
      const { generateInvoicePDFBuffer } = await import("../../utils/pdfGenerator.js");
      const { invoice, partnerEmail, partnerName } = data;
      const buffer = await generateInvoicePDFBuffer(invoice);

      if (sendEmail && partnerEmail) {
        const { sendViaEmail } = await import("../../services/communication/CommunicationService.js");
        await sendViaEmail({
          to: partnerEmail,
          subject: `VIT AUTO — Facture #${invoice?.reference || ""}`,
          template: "invoice",
          data: {
            firstName: partnerName,
            invoice: {
              invoiceNumber: invoice?.reference,
              issueDate:     invoice?.createdAt,
              dueDate:       invoice?.dueDate,
              total:         invoice?.totalCommission,
              devise:        invoice?.devise,
              status:        invoice?.status,
              partnerName,
            },
          },
          userId: data.userId,
          attachments: [{ filename: `facture-${invoice?.reference || "invoice"}.pdf`, content: buffer, contentType: "application/pdf" }],
        });
      }

      return { type: "invoice", size: buffer.length };
    }

    case "contract":
      // Généré à la demande (streaming HTTP) — pas de stockage
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
    captureException(err, { worker: "PdfWorker", jobId: job?.id });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) {
      logger.error("[PdfWorker] Erreur worker", { error: err.message });
      captureException(err, { worker: "PdfWorker", source: "workerError" });
    }
  });

  logger.info("[PdfWorker] Démarré", { queue: QUEUE_NAMES.PDF });
  return worker;
}
