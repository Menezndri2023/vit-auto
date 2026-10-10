/**
 * VIT AUTO — OCR Worker
 *
 * Traitement serveur des documents KYC (backup si Tesseract.js côté client échoue).
 * Actuellement : validation des données OCR + mise à jour statut KYC.
 *
 * Types:
 *   validate_kyc_data   → Validation des données OCR soumises, mise à jour score
 *   verify_document     → Vérification de cohérence document (futur : AWS Rekognition)
 *   check_duplicate     → Anti-fraude : vérification doublons entre comptes
 */
import { Worker } from "bullmq";
import logger from "../../utils/logger.js";
import { captureException } from "../../config/sentry.js";
import { QUEUE_NAMES, WORKER_CONCURRENCY, WORKER_OPTIONS_ECONOMES } from "../definitions.js";
import { noteRedisError } from "../connection.js";
import { nonBloquant } from "../../utils/nonBloquant.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processOcrJob(job) {
  const { type, userId, data = {} } = job.data;

  switch (type) {
    case "validate_kyc_data": {
      // Re-calcul du score KYC côté serveur pour validation
      const User = (await import("../../models/User.js")).default;
      const user = await User.findById(userId).select("email phone kycOcrData emailVerified phoneVerified kycStatus identity.type identity.expiryDate identity.frontImage identity.backImage identity.selfie").lean();
      if (!user) throw new Error(`Utilisateur ${userId} introuvable`);

      const ocrConf  = user.kycOcrData?.ocrConfidence || 0;
      const hasDoc   = !!user.kycOcrData?.documentNumber;
      // Règle de l'exploitant (2026-10-07) : validation AUTOMATIQUE seulement si
      // tout est en règle — e-mail OU téléphone confirmé, et dossier complet
      // (recto, verso sauf passeport, selfie, pièce non expirée). Sinon la
      // validation reste MANUELLE (le statut ne bouge pas, l'admin tranche).
      const contactConfirme = !!(user.emailVerified || user.phoneVerified);
      const id = user.identity || {};
      const dossierComplet = !!(id.frontImage && id.selfie
        && (id.type === "passport" || id.backImage)
        && (!id.expiryDate || new Date(id.expiryDate) > new Date()));

      let score = 0;
      if (user.emailVerified) score += 15;
      if (user.phoneVerified) score += 15;
      if (user.kycOcrData?.documentNumber) score += 20;
      if (ocrConf >= 60)  score += 25;
      if (user.identity?.selfie) score += 15;   // selfie fourni — aucune analyse du visage (CNDP, 2026-10-09)
      if (user.kycOcrData?.firstName && user.kycOcrData?.lastName && user.kycOcrData?.birthDate) score += 10;
      score = Math.min(score, 100);

      const badge = score >= 80 ? "CERTIFIÉ" : score >= 60 ? "VÉRIFIÉ" : "INSUFFISANT";
      // Plus de score de visage (traitement biométrique, CNDP) : la pièce lue,
      // le contact confirmé et le dossier complet suffisent (règle de
      // l'exploitant) ; le selfie fait partie du dossier complet.
      const autoApprove = ocrConf >= 70 && contactConfirme && dossierComplet && hasDoc;
      const dejaVerifie = user.kycStatus === "VERIFIE";

      await User.findByIdAndUpdate(userId, {
        $set: {
          kycScore:          score,
          kycBadge:          badge,
          ...(autoApprove ? {
            kycStatus:        "VERIFIE",
            documentsVerified: true,
            "identity.status": "verified",
            "identity.verifiedAt": new Date(),
          } : {}),
        },
        $push: {
          kycAuditLog: {
            action:    autoApprove ? "SERVER_AUTO_VERIFIED" : "SERVER_SCORE_UPDATED",
            note:      `Score recalculé serveur: ${score}/100 — OCR:${ocrConf}%`,
            timestamp: new Date(),
          },
        },
      });

      if (autoApprove) {
        const { reevaluerPartenaire } = await import("../../services/validationPartenaire.js");
        reevaluerPartenaire(userId);
      }
      if (autoApprove && !dejaVerifie) {
        const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");
        await sendViaInternal({
          userId,
          // "kyc" n'est pas dans l'enum Notification.type : la création échouait
          // en silence (nonBloquant) — le client n'a jamais reçu cette notification.
          type:    "kyc_approved",
          titre:   "✅ Identité vérifiée automatiquement",
          message: "Votre dossier KYC a été validé. Vous pouvez effectuer des réservations.",
        }).catch(nonBloquant("ocr.worker"));
      }

      return { userId, score, badge, autoApprove };
    }

    case "check_duplicate": {
      const { documentHash, documentNumber } = data;
      const User = (await import("../../models/User.js")).default;

      const [hashMatch, numberMatch] = await Promise.all([
        documentHash ? User.findOne({ kycDocumentHash: documentHash, _id: { $ne: userId } }).select("_id").lean() : null,
        documentNumber ? User.findOne({ "kycOcrData.documentNumber": documentNumber, _id: { $ne: userId }, kycStatus: { $in: ["VERIFIE", "EN_ATTENTE"] } }).select("_id").lean() : null,
      ]);

      const isDuplicate = !!(hashMatch || numberMatch);
      if (isDuplicate) {
        await User.findByIdAndUpdate(userId, {
          $set:  { kycStatus: "REFUSE", kycRejectionReason: "Document déjà associé à un autre compte." },
          $push: { kycAuditLog: { action: "DUPLICATE_DETECTED_SERVER", note: `Hash:${!!hashMatch} Num:${!!numberMatch}`, timestamp: new Date() } },
        });
        logger.warn("[OcrWorker] Doublon document détecté", { userId });
      }

      return { userId, isDuplicate };
    }

    default:
      logger.warn("[OcrWorker] Type inconnu", { type });
      return { skipped: true };
  }
}

export function startOcrWorker(connection) {
  if (!connection) return null;

  const worker = new Worker(
    QUEUE_NAMES.OCR,
    async (job) => {
      logger.debug("[OcrWorker] Traitement", { type: job.data.type, userId: job.data.userId, jobId: job.id });
      return processOcrJob(job);
    },
    {
      connection,
      ...WORKER_OPTIONS_ECONOMES,
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.OCR],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[OcrWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message });
    captureException(err, { worker: "OcrWorker", jobId: job?.id });
  });
  worker.on("error", (err) => {
    if (!noteRedisError(err)) {
      logger.error("[OcrWorker] Erreur worker", { error: err.message });
      captureException(err, { worker: "OcrWorker", source: "workerError" });
    }
  });

  logger.info("[OcrWorker] Démarré", { queue: QUEUE_NAMES.OCR });
  return worker;
}
