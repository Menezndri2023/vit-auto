/**
 * VIT AUTO — Import/Export Worker
 *
 * Traite les étapes du pipeline Import/Export (14 étapes).
 *
 * Types:
 *   step_transition    → Passer une transaction à l'étape suivante + notifier
 *   escrow_check       → Vérifier l'état de l'escrow et débloquer si conditions remplies
 *   document_reminder  → Rappel de documents manquants
 *   evaluation_prompt  → Inviter acheteur/vendeur à laisser une évaluation
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";

const IE_STEP_LABELS = {
  1:  "Demande soumise",
  2:  "Vérification documents",
  3:  "Inspection véhicule",
  4:  "Rapport d'inspection",
  5:  "Négociation prix",
  6:  "Accord commercial",
  7:  "Paiement escrow",
  8:  "Expédition",
  9:  "Dédouanement",
  10: "Livraison port",
  11: "Transport local",
  12: "Livraison finale",
  13: "Validation client",
  14: "Transaction clôturée",
};

async function processImportJob(job) {
  const { type, transactionId, data = {} } = job.data;

  switch (type) {
    case "step_transition": {
      const { newStep, triggerUserId, note } = data;
      const IETransaction = (await import("../../models/IETransaction.js")).default;
      const tx = await IETransaction.findById(transactionId);
      if (!tx) throw new Error(`Transaction ${transactionId} introuvable`);

      const stepLabel = IE_STEP_LABELS[newStep] || `Étape ${newStep}`;

      // Notifications aux participants
      const { sendViaInternal, sendViaSms } = await import("../../services/communication/CommunicationService.js");

      const notifyIds = [tx.buyer, tx.seller, tx.broker].filter(Boolean).map(String);
      await Promise.allSettled(notifyIds.map((uid) =>
        sendViaInternal({
          userId:  uid,
          type:    "system",
          titre:   `📦 Étape ${newStep}/14 — ${stepLabel}`,
          message: note || `Votre transaction est passée à l'étape "${stepLabel}".`,
          lien:    `/ie/transaction/${transactionId}`,
        })
      ));

      logger.info("[ImportWorker] Transition étape", { transactionId, newStep });
      return { transactionId, newStep, stepLabel };
    }

    case "escrow_check": {
      const IETransaction = (await import("../../models/IETransaction.js")).default;
      const tx = await IETransaction.findById(transactionId).lean();
      if (!tx) return { skipped: true, reason: "tx_not_found" };

      // Escrow libérable si step >= 13 (validation client) et isPaid
      const canRelease = tx.currentStep >= 13 && tx.escrow?.status === "held" && tx.isPaid;

      if (canRelease) {
        await IETransaction.findByIdAndUpdate(transactionId, {
          $set: {
            "escrow.status":      "released",
            "escrow.releasedAt":  new Date(),
          },
        });

        const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");
        if (tx.seller) {
          await sendViaInternal({
            userId:  tx.seller.toString(),
            type:    "payment",
            titre:   "💰 Fonds débloqués — Escrow libéré",
            message: "Les fonds de votre transaction ont été libérés depuis l'escrow.",
            lien:    `/ie/transaction/${transactionId}`,
          }).catch(() => {});
        }
        logger.info("[ImportWorker] Escrow libéré", { transactionId });
        return { transactionId, escrowReleased: true };
      }

      return { transactionId, escrowReleased: false };
    }

    case "evaluation_prompt": {
      const { buyerId, sellerId } = data;
      const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");

      await Promise.allSettled([
        buyerId && sendViaInternal({
          userId:  buyerId,
          type:    "system",
          titre:   "⭐ Évaluez votre expérience",
          message: "Votre transaction est terminée. Partagez votre avis sur le vendeur/partenaire.",
          lien:    `/ie/transaction/${transactionId}`,
        }),
        sellerId && sendViaInternal({
          userId:  sellerId,
          type:    "system",
          titre:   "⭐ Évaluez l'acheteur",
          message: "La transaction est clôturée. Évaluez l'acheteur pour améliorer la communauté.",
          lien:    `/ie/transaction/${transactionId}`,
        }),
      ]);

      return { transactionId, evaluationPromptSent: true };
    }

    default:
      logger.warn("[ImportWorker] Type inconnu", { type });
      return { skipped: true };
  }
}

export function startImportWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.IMPORT,
    async (job) => {
      logger.debug("[ImportWorker] Traitement", { type: job.data.type, jobId: job.id });
      return processImportJob(job);
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.IMPORT],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[ImportWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message });
  });

  logger.info("[ImportWorker] Démarré", { queue: QUEUE_NAMES.IMPORT });
  return worker;
}
