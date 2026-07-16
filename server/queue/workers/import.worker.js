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
import { captureException } from "../../config/sentry.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { noteRedisError } from "../connection.js";

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

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processImportJob(job) {
  const { type, transactionId, data = {} } = job.data;

  switch (type) {
    case "step_transition": {
      const { newStep, triggerUserId, note } = data;
      const IETransaction = (await import("../../models/IETransaction.js")).default;
      const tx = await IETransaction.findById(transactionId);
      if (!tx) throw new Error(`Transaction ${transactionId} introuvable`);

      const stepLabel = IE_STEP_LABELS[newStep] || `Étape ${newStep}`;

      // Notifications aux participants
      const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");

      // IETransaction n'a que `client`/`partner` (voir models/IETransaction.js) —
      // pas de buyer/seller/broker, ces champs n'ont jamais existé sur ce
      // schéma. `notifyIds` était donc toujours vide et ce job ne notifiait
      // jamais personne.
      const notifyIds = [tx.client, tx.partner].filter(Boolean).map(String);
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
      // La libération réelle des fonds se fait de façon synchrone et explicite
      // dans releaseFunds (ieTransactionController.js — action du client ou d'un
      // admin sur une transaction "delivered"), jamais automatiquement ici. Ce
      // job référençait des champs qui n'ont jamais existé sur IETransaction
      // (currentStep/escrow.status/isPaid — le schéma réel n'a que `status` et
      // `payment.releasedAt`) et ne faisait donc jamais rien. Conservé comme
      // simple point de contrôle de cohérence plutôt que de réintroduire une
      // logique de libération automatique qui ne correspond à aucune règle
      // métier actuelle.
      const IETransaction = (await import("../../models/IETransaction.js")).default;
      const tx = await IETransaction.findById(transactionId).select("status payment").lean();
      if (!tx) return { skipped: true, reason: "tx_not_found" };

      const released = tx.status === "funds_released" || tx.status === "completed" || !!tx.payment?.releasedAt;
      return { transactionId, escrowAlreadyReleased: released };
    }

    case "evaluation_prompt": {
      // `data.buyerId`/`data.sellerId` n'ont jamais existé — dispatch.ieStepTransition
      // (queue/index.js) planifie ce job avec `data: {}`. Recharger la transaction
      // directement (client/partner, seuls champs réels du schéma IETransaction)
      // au moment où le job s'exécute (24h plus tard) est aussi plus fiable que de
      // figer des IDs dans les données du job.
      const IETransaction = (await import("../../models/IETransaction.js")).default;
      const tx = await IETransaction.findById(transactionId).select("client partner").lean();
      if (!tx) return { skipped: true, reason: "tx_not_found" };

      const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");

      await Promise.allSettled([
        tx.client && sendViaInternal({
          userId:  tx.client.toString(),
          type:    "system",
          titre:   "⭐ Évaluez votre expérience",
          message: "Votre transaction est terminée. Partagez votre avis sur le vendeur/partenaire.",
          lien:    `/ie/transaction/${transactionId}`,
        }),
        tx.partner && sendViaInternal({
          userId:  tx.partner.toString(),
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
    captureException(err, { worker: "ImportWorker", jobId: job?.id });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) {
      logger.error("[ImportWorker] Erreur worker", { error: err.message });
      captureException(err, { worker: "ImportWorker", source: "workerError" });
    }
  });

  logger.info("[ImportWorker] Démarré", { queue: QUEUE_NAMES.IMPORT });
  return worker;
}
