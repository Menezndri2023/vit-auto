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
import { QUEUE_NAMES, WORKER_CONCURRENCY } from "../definitions.js";
import { smsConfigured } from "../../utils/smsConfigured.js";
import { emailVerificationRequired } from "../../utils/emailVerificationRequired.js";

// Exportée pour être réutilisable en fallback synchrone (queue/index.js) quand
// Redis/BullMQ est indisponible.
export async function processOcrJob(job) {
  const { type, userId, data = {} } = job.data;

  switch (type) {
    case "validate_kyc_data": {
      // Re-calcul du score KYC côté serveur pour validation
      const User = (await import("../../models/User.js")).default;
      const user = await User.findById(userId).select("email phone kycOcrData kycFaceMatchScore emailVerified phoneVerified kycStatus").lean();
      if (!user) throw new Error(`Utilisateur ${userId} introuvable`);

      const ocrConf  = user.kycOcrData?.ocrConfidence || 0;
      const faceConf = user.kycFaceMatchScore || 0;
      const hasDoc   = !!user.kycOcrData?.documentNumber;
      // Un compte n'a qu'un seul canal (email OU téléphone — voir Register.jsx) :
      // le canal absent n'est jamais un motif de blocage/pénalité, seul celui
      // effectivement associé au compte doit être vérifié.
      const emailChannelOk = !user.email || user.emailVerified;
      const phoneChannelOk = !user.phone || user.phoneVerified;

      let score = 0;
      if (user.emailVerified) score += 15;
      if (user.phoneVerified) score += 15;
      if (user.kycOcrData?.documentNumber) score += 20;
      if (ocrConf >= 60)  score += 25;
      if (faceConf >= 80) score += 15;
      if (user.kycOcrData?.firstName && user.kycOcrData?.lastName && user.kycOcrData?.birthDate) score += 10;
      score = Math.min(score, 100);

      const badge = score >= 80 ? "CERTIFIÉ" : score >= 60 ? "VÉRIFIÉ" : "INSUFFISANT";
      // Sans provider SMS configuré, phoneChannelOk resterait éternellement faux
      // pour un compte téléphone (voir smsConfigured()) : ne pas en dépendre pour
      // l'auto-approbation, sinon AUCUN utilisateur ne serait jamais auto-approuvé
      // tant que l'équipe n'a pas de provider SMS réel — tout finirait en revue
      // manuelle admin. Même logique pour l'email tant que
      // emailVerificationRequired() est désactivé.
      const autoApprove = ocrConf >= 70 && faceConf >= 80
        && (emailChannelOk || !emailVerificationRequired())
        && (phoneChannelOk || !smsConfigured())
        && hasDoc;
      const newStatus = autoApprove ? "VERIFIE" : user.kycStatus;

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
            note:      `Score recalculé serveur: ${score}/100 — OCR:${ocrConf}% Face:${faceConf}%`,
            timestamp: new Date(),
          },
        },
      });

      if (autoApprove && newStatus !== "VERIFIE") {
        const { sendViaInternal } = await import("../../services/communication/CommunicationService.js");
        await sendViaInternal({
          userId,
          type:    "kyc",
          titre:   "✅ Identité vérifiée automatiquement",
          message: "Votre dossier KYC a été validé. Vous pouvez effectuer des réservations.",
        }).catch(() => {});
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
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.OCR],
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("[OcrWorker] Échec", { jobId: job?.id, type: job?.data?.type, error: err.message });
  });

  logger.info("[OcrWorker] Démarré", { queue: QUEUE_NAMES.OCR });
  return worker;
}
