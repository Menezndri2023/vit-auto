/**
 * VIT AUTO — BullMQ Queue System
 *
 * Point d'entrée unique.
 * Usage :
 *   import { initQueues, dispatch } from "../queue/index.js";
 *   await initQueues();
 *   dispatch.bookingCreated(booking, client, vehicle);
 */
import { Queue } from "bullmq";
import logger from "../utils/logger.js";
import { QUEUE_NAMES, QUEUE_OPTIONS, PRIORITY } from "./definitions.js";
import { initQueueConnection, isQueueConnected, isConnectionHardBroken } from "./connection.js";

// ── Registre des queues ───────────────────────────────────────────────────────
let _queues = {};
let _workers = [];
let _ready = false;
let _workersPaused = false;
let _pauseMonitor = null;

// ── Initialisation ────────────────────────────────────────────────────────────
export async function initQueues() {
  const conn = await initQueueConnection();
  if (!conn) {
    logger.warn("[Queue] Mode synchrone — BullMQ désactivé (REDIS_URL manquant)");
    return false;
  }

  // Créer toutes les queues
  for (const [key, name] of Object.entries(QUEUE_NAMES)) {
    _queues[name] = new Queue(name, {
      connection:         conn,
      defaultJobOptions:  QUEUE_OPTIONS[name] || {},
    });
  }

  _ready = true;
  logger.info("[Queue] Toutes les queues initialisées", { queues: Object.values(QUEUE_NAMES).join(", ") });

  // Démarrer tous les workers
  await startAllWorkers(conn);
  startPauseMonitor();
  return true;
}

// ── Surveillance panne dure Redis ─────────────────────────────────────────────
// Vérification purement locale (aucun appel Redis) : quand une panne dure est
// détectée (ex: quota Upstash), on met les workers en pause pour arrêter de
// solliciter Redis en boucle — les jobs continuent d'être traités via le
// fallback synchrone de enqueue(). Reprise automatique dès que ça se résorbe.
function startPauseMonitor() {
  if (_pauseMonitor) return;
  _pauseMonitor = setInterval(() => {
    const broken = isConnectionHardBroken();
    if (broken && !_workersPaused) {
      _workersPaused = true;
      _workers.forEach((w) => w.pause(true).catch(() => {}));
      logger.warn("[Queue] Workers mis en pause (panne Redis dure)");
    } else if (!broken && _workersPaused) {
      _workersPaused = false;
      _workers.forEach((w) => w.resume());
      logger.info("[Queue] Workers repris (Redis rétabli)");
    }
  }, 5000);
  _pauseMonitor.unref?.();
}

async function startAllWorkers(conn) {
  const [
    { startEmailWorker },
    { startSmsWorker },
    { startWhatsAppWorker },
    { startNotificationWorker },
    { startPdfWorker },
    { startOcrWorker },
    { startImportWorker },
    { startAiWorker },
    { startPartnerFeedWorker },
  ] = await Promise.all([
    import("./workers/email.worker.js"),
    import("./workers/sms.worker.js"),
    import("./workers/whatsapp.worker.js"),
    import("./workers/notification.worker.js"),
    import("./workers/pdf.worker.js"),
    import("./workers/ocr.worker.js"),
    import("./workers/import.worker.js"),
    import("./workers/ai.worker.js"),
    import("./workers/partnerFeed.worker.js"),
  ]);

  _workers = [
    startEmailWorker(conn),
    startSmsWorker(conn),
    startWhatsAppWorker(conn),
    startNotificationWorker(conn),
    startPdfWorker(conn),
    startOcrWorker(conn),
    startImportWorker(conn),
    startAiWorker(conn),
    startPartnerFeedWorker(conn),
  ].filter(Boolean);

  logger.info("[Queue] Workers démarrés", { count: _workers.length });
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
export const isReady = () => _ready;

export async function getQueueStats() {
  if (!_ready) return null;
  const stats = {};
  for (const [name, q] of Object.entries(_queues)) {
    stats[name] = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed").catch(() => ({}));
  }
  return stats;
}

export async function closeQueues() {
  if (_pauseMonitor) { clearInterval(_pauseMonitor); _pauseMonitor = null; }
  await Promise.all(_workers.map((w) => w.close?.().catch(() => {})));
  await Promise.all(Object.values(_queues).map((q) => q.close?.().catch(() => {})));
  const { closeQueueConnection } = await import("./connection.js");
  await closeQueueConnection();
  _ready = false;
  logger.info("[Queue] Fermeture propre effectuée");
}

// ── Fallback synchrone (Redis/BullMQ indisponible) ────────────────────────────
// Chaque entrée charge (dynamiquement, comme startAllWorkers) la fonction de
// traitement exportée par le worker correspondant, pour exécuter le job en
// synchrone quand la queue n'est pas prête — au lieu de le perdre silencieusement.
const SYNC_FALLBACK_LOADERS = {
  [QUEUE_NAMES.EMAIL]:        async () => (await import("./workers/email.worker.js")).processEmail,
  [QUEUE_NAMES.SMS]:          async () => (await import("./workers/sms.worker.js")).processSmsJob,
  [QUEUE_NAMES.WHATSAPP]:     async () => (await import("./workers/whatsapp.worker.js")).processWhatsAppJob,
  [QUEUE_NAMES.NOTIFICATION]: async () => (await import("./workers/notification.worker.js")).processNotificationJob,
  [QUEUE_NAMES.PDF]:          async () => (await import("./workers/pdf.worker.js")).processPdfJob,
  [QUEUE_NAMES.OCR]:          async () => (await import("./workers/ocr.worker.js")).processOcrJob,
  [QUEUE_NAMES.IMPORT]:       async () => (await import("./workers/import.worker.js")).processImportJob,
  [QUEUE_NAMES.AI]:           async () => (await import("./workers/ai.worker.js")).processAiJob,
  [QUEUE_NAMES.PARTNER_FEED]: async () => (await import("./workers/partnerFeed.worker.js")).processPartnerFeedJob,
};

// Queues dont le traitement peut être long (téléchargement d'images, écritures DB
// en volume) : on les exécute après la réponse HTTP en cours (setImmediate) pour
// éviter un timeout de la requête. Le comportement observable reste identique
// (le job est bien traité), seule la latence change — comme en mode BullMQ normal.
const DEFERRED_SYNC_QUEUES = new Set([QUEUE_NAMES.PARTNER_FEED]);

async function runSyncFallback(queueName, jobName, data) {
  const loadProcessor = SYNC_FALLBACK_LOADERS[queueName];
  if (!loadProcessor) {
    logger.error("[Queue] Aucun fallback synchrone connu pour cette queue — job perdu", { queue: queueName, job: jobName });
    return null;
  }

  const fakeJob = { id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: jobName, data };

  const execute = async () => {
    try {
      const processFn = await loadProcessor();
      await processFn(fakeJob);
      logger.info("[Queue] Fallback synchrone exécuté avec succès", { queue: queueName, job: jobName, jobId: fakeJob.id });
    } catch (err) {
      logger.error("[Queue] Échec du fallback synchrone — job perdu", { queue: queueName, job: jobName, jobId: fakeJob.id, error: err.message });
    }
  };

  if (DEFERRED_SYNC_QUEUES.has(queueName)) {
    // Ne bloque pas la requête HTTP en cours : traitement différé après la réponse.
    setImmediate(execute);
    return fakeJob.id;
  }

  await execute();
  return fakeJob.id;
}

// ── Circuit-breaker Redis ──────────────────────────────────────────────────
// Si un quota Redis (ex: Upstash) est dépassé, CHAQUE q.add() échoue de toute
// façon — les retenter à chaque requête HTTP ne fait qu'ajouter de la latence
// et du bruit dans les logs pour rien. Après un échec, on saute directement le
// fallback synchrone pendant un court délai plutôt que de re-solliciter Redis
// à chaque appel ; un succès referme aussitôt le circuit (reprise automatique
// dès que le quota/la connexion redevient disponible).
const REDIS_BREAKER_COOLDOWN_MS = 60_000;
let _redisBrokenUntil = 0;

// ── Fonction d'enqueue bas niveau ─────────────────────────────────────────────
export async function enqueue(queueName, jobName, data, opts = {}) {
  const q = _queues[queueName];
  if (!q) {
    // Redis indisponible (REDIS_URL manquant ou jamais connecté) — fallback synchrone.
    logger.warn("[Queue] Queue indisponible — fallback synchrone", { queue: queueName, job: jobName });
    return runSyncFallback(queueName, jobName, data);
  }
  if (Date.now() < _redisBrokenUntil) {
    logger.warn("[Queue] Circuit Redis ouvert (échec récent) — fallback synchrone direct", { queue: queueName, job: jobName });
    return runSyncFallback(queueName, jobName, data);
  }
  try {
    const job = await q.add(jobName, data, opts);
    _redisBrokenUntil = 0;
    return job.id;
  } catch (err) {
    // Redis était connecté mais l'ajout échoue (ex : quota Upstash dépassé) — même filet
    // de sécurité que ci-dessus pour ne jamais perdre le job silencieusement.
    _redisBrokenUntil = Date.now() + REDIS_BREAKER_COOLDOWN_MS;
    logger.error("[Queue] Erreur enqueue — bascule en fallback synchrone (circuit ouvert 60s)", { queue: queueName, job: jobName, error: err.message });
    return runSyncFallback(queueName, jobName, data);
  }
}

// ── Planification (delayed job) ────────────────────────────────────────────────
export async function schedule(queueName, jobName, data, delayMs) {
  return enqueue(queueName, jobName, data, { delay: delayMs });
}

// ══════════════════════════════════════════════════════════════════════════════
// DISPATCHERS MÉTIER — fonctions haut-niveau pour les controllers
// ══════════════════════════════════════════════════════════════════════════════

export const dispatch = {

  // ── Notification push native (iOS/Android) ──────────────────────────────────
  // Résout les pushTokens de l'utilisateur puis enqueue vers le canal "push"
  // déjà routé par notification.worker.js → CommunicationService.sendViaPush.
  // No-op silencieux si l'utilisateur n'a aucun appareil natif enregistré (voir
  // NotificationContext.jsx côté client) — ne bloque jamais l'appelant.
  async pushNotification(userId, title, body, data = {}) {
    if (!userId) return;
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(userId).select("pushTokens").lean();
    const tokens = user?.pushTokens || [];
    if (!tokens.length) return;
    await enqueue(QUEUE_NAMES.NOTIFICATION, "push_notification", {
      channel: "push",
      to:      tokens,
      title,
      body,
      data,
    });
  },

  // ── Booking ────────────────────────────────────────────────────────────────
  async bookingCreated(booking, client, vehicle) {
    const bId  = booking._id?.toString() || booking.id;
    const ref  = booking.reference;
    const partnerPhone = vehicle?.owner?.phone || null;

    await Promise.allSettled([
      // Email confirmation client
      client?.email && enqueue(QUEUE_NAMES.EMAIL, "booking_confirmation", {
        type: "booking_confirmation",
        to:   client.email,
        userId: client._id?.toString(),
        data: {
          firstName:    client.firstName,
          reference:    ref,
          vehicleTitle: vehicle?.title || "Véhicule",
          startDate:    booking.location?.startDate,
          endDate:      booking.location?.endDate,
          montantTotal: booking.montantTotal,
          type:         booking.type,
        },
      }),

      // SMS client
      client?.phone && enqueue(QUEUE_NAMES.SMS, "booking_confirmed_sms", {
        type: "booking_confirmed",
        to:   client.phone,
        data: { reference: ref, vehicleTitle: vehicle?.title, firstName: client.firstName },
      }),

      // Notification interne client
      client?._id && enqueue(QUEUE_NAMES.NOTIFICATION, "booking_created_notif", {
        channel: "internal",
        userId:  client._id?.toString(),
        type:    "new_booking",   // "booking" n'existe pas dans l'enum Notification.type — échec silencieux sinon
        titre:   "🚗 Réservation créée",
        message: `Votre réservation ${ref} a été enregistrée. En attente de confirmation du partenaire.`,
        lien:    `/bookings/${bId}`,
      }),

      // Notification interne partenaire
      vehicle?.owner?._id && enqueue(QUEUE_NAMES.NOTIFICATION, "booking_partner_notif", {
        channel: "internal",
        userId:  vehicle.owner._id?.toString(),
        type:    "new_booking",
        titre:   "📋 Nouvelle réservation",
        message: `Nouvelle réservation ${ref} — ${client?.firstName || "Client"} — À confirmer.`,
        lien:    `/partner/bookings`,
      }),

      // AI : analyse risque
      client?._id && enqueue(QUEUE_NAMES.AI, "fraud_check", {
        type: "fraud_detection",
        data: {
          bookingId: bId,
          userId:    client._id?.toString(),
          amount:    booking.montantTotal,
        },
      }, { priority: PRIORITY.LOW }),
    ]);
  },

  async bookingStatusChanged(booking, client, vehicle, newStatus) {
    const bId = booking._id?.toString() || booking.id;
    const ref = booking.reference;

    // `type` doit être une valeur existante de l'enum Notification.type — "booking"
    // n'en fait pas partie (échouait silencieusement pour TOUS les changements de
    // statut). booking_confirmed/completed/cancelled existent déjà spécifiquement ;
    // in_progress n'a pas d'équivalent dédié, "system" est le fallback générique
    // déjà utilisé ailleurs (ex: vehicleController) pour ce cas.
    const STATUS_MESSAGES = {
      confirmed:    { type: "booking_confirmed", titre: "✅ Réservation confirmée", message: `Votre réservation ${ref} est confirmée.` },
      in_progress:  { type: "system",            titre: "🚗 Location en cours", message: `Votre réservation ${ref} est maintenant en cours.` },
      completed:    { type: "booking_completed", titre: "✅ Location terminée", message: `Votre réservation ${ref} est terminée. Merci !` },
      cancelled:    { type: "booking_cancelled", titre: "❌ Réservation annulée", message: `Votre réservation ${ref} a été annulée.` },
    };

    const notif = STATUS_MESSAGES[newStatus];
    if (notif && client?._id) {
      await enqueue(QUEUE_NAMES.NOTIFICATION, `booking_${newStatus}`, {
        channel: "internal",
        userId:  client._id?.toString(),
        type:    notif.type,
        titre:   notif.titre,
        message: notif.message,
        lien:    `/bookings/${bId}`,
      });
    }

    // Email si confirmé
    if (newStatus === "confirmed" && client?.email) {
      await enqueue(QUEUE_NAMES.EMAIL, "booking_accepted_email", {
        type:   "booking_accepted",
        to:     client.email,
        userId: client._id?.toString(),
        data:   { firstName: client.firstName, reference: ref, vehicleTitle: vehicle?.title },
      });
    }
  },

  // ── KYC ───────────────────────────────────────────────────────────────────
  async kycSubmitted(userId, userEmail, firstName) {
    await Promise.allSettled([
      // Validation serveur asynchrone (score + anti-fraude)
      enqueue(QUEUE_NAMES.OCR, "validate_kyc", {
        type: "validate_kyc_data",
        userId,
      }, { priority: PRIORITY.NORMAL }),

      // Email confirmation soumission
      userEmail && enqueue(QUEUE_NAMES.EMAIL, "kyc_submitted_email", {
        type:   "kyc_submitted",
        to:     userEmail,
        userId,
        data:   { firstName },
      }),
    ]);
  },

  async kycReviewed(userId, userEmail, firstName, decision, note) {
    const emailType = decision === "VERIFIE" ? "kyc_approved" : "kyc_rejected";
    await Promise.allSettled([
      userEmail && enqueue(QUEUE_NAMES.EMAIL, "kyc_review_email", {
        type:   emailType,
        to:     userEmail,
        userId,
        data:   { firstName, reason: note },
      }),
    ]);
  },

  // ── Partenaires ──────────────────────────────────────────────────────────
  async partnerWelcome(userId, email, firstName) {
    await enqueue(QUEUE_NAMES.EMAIL, "welcome_partner_email", {
      type:   "welcome_partner",
      to:     email,
      userId,
      data:   { firstName },
    });
  },

  async loiReady(userId, email, partnerName, companyName, loiContent, referenceNumber, signLink, expiresAt) {
    // PDF + email en un seul job PDF worker
    await enqueue(QUEUE_NAMES.PDF, "generate_loi", {
      type:      "loi",
      sendEmail: true,
      data: {
        userId,
        partnerEmail:    email,
        partnerName,
        companyName,
        loiContent,
        referenceNumber,
        signLink,
        expiresAt,
      },
    });
  },

  async agreementReady(userId, email, partnerName, companyName, agreementContent, referenceNumber, signLink, expiresAt) {
    await enqueue(QUEUE_NAMES.PDF, "generate_agreement", {
      type:      "agreement",
      sendEmail: true,
      data: {
        userId,
        partnerEmail:    email,
        partnerName,
        companyName,
        agreementContent,
        referenceNumber,
        signLink,
        expiresAt,
      },
    });
  },

  // Relance — regroupe LOI et/ou Accord encore en attente en UN seul email
  // (renvoi manuel admin ou relance automatique sur dossier bloqué). Pas de PDF
  // à regénérer : le document existe déjà (doc.loi.content / doc.agreement.content),
  // seul le lien de signature change — direct sur la queue EMAIL (pas PDF).
  async documentsReadyReminder(userId, email, { firstName, companyName, referenceNumber, loiUrl, agreementUrl, expiresAt }) {
    await enqueue(QUEUE_NAMES.EMAIL, "documents_ready_reminder", {
      type:   "documents_ready_reminder",
      to:     email,
      userId,
      data: { firstName, companyName, referenceNumber, loiUrl, agreementUrl, expiresAt },
    });
  },

  // Confirmation email — LOI signée par le partenaire (pas de PDF à regénérer ici,
  // juste la confirmation ; le PDF signé reste consultable depuis le dossier).
  async loiSigned(to, userId, data) {
    await enqueue(QUEUE_NAMES.EMAIL, "loi_signed", {
      type: "loi_signed",
      to,
      userId,
      data,
    }, { priority: PRIORITY.HIGH });
  },

  // Confirmation email — Accord signé = badge Founding Partner activé.
  async agreementSigned(to, userId, data) {
    await enqueue(QUEUE_NAMES.EMAIL, "agreement_signed", {
      type: "agreement_signed",
      to,
      userId,
      data,
    }, { priority: PRIORITY.HIGH });
  },

  // Relance — dossier Founding Partner resté incomplet (voir adminRequestInfo).
  async foundingPartnerInfoRequested(to, userId, data) {
    await enqueue(QUEUE_NAMES.EMAIL, "founding_partner_info_requested", {
      type: "founding_partner_info_requested",
      to,
      userId,
      data,
    }, { priority: PRIORITY.HIGH });
  },

  // Relance générique — dossier Vérification Partenaire ou Certification resté
  // incomplet (voir utils/partnerReminders.js).
  async partnerDocumentsMissing(to, userId, data) {
    await enqueue(QUEUE_NAMES.EMAIL, "partner_documents_missing", {
      type: "partner_documents_missing",
      to,
      userId,
      data,
    }, { priority: PRIORITY.NORMAL });
  },

  // Relance "profil incomplet" — tous les comptes (voir utils/accountHealthCheck.js).
  async accountIncomplete(to, userId, data) {
    await enqueue(QUEUE_NAMES.EMAIL, "account_incomplete", {
      type: "account_incomplete",
      to,
      userId,
      data,
    }, { priority: PRIORITY.LOW });
  },

  // ── Import/Export ─────────────────────────────────────────────────────────
  async ieStepTransition(transactionId, newStep, triggerUserId, note) {
    await enqueue(QUEUE_NAMES.IMPORT, `ie_step_${newStep}`, {
      type:          "step_transition",
      transactionId,
      data:          { newStep, triggerUserId, note },
    });

    // Vérifier escrow aux étapes clés (7, 13, 14)
    if ([7, 13, 14].includes(newStep)) {
      await enqueue(QUEUE_NAMES.IMPORT, `ie_escrow_check_${newStep}`, {
        type:          "escrow_check",
        transactionId,
        data:          { step: newStep },
      }, { delay: 2000 }); // Délai 2s pour laisser la DB se mettre à jour
    }

    // Invitation évaluation à la clôture
    if (newStep === 14) {
      await schedule(QUEUE_NAMES.IMPORT, "ie_evaluation_prompt", {
        type:          "evaluation_prompt",
        transactionId,
        data:          {},
      }, 24 * 3600 * 1000); // 24h après la clôture
    }
  },

  // ── Véhicules ────────────────────────────────────────────────────────────
  async vehicleCreated(vehicleId) {
    await enqueue(QUEUE_NAMES.AI, "score_vehicle", {
      type: "score_vehicle",
      data: { vehicleId },
    }, { priority: PRIORITY.LOW });
  },

  // ── Import de flotte partenaire ───────────────────────────────────────────
  async vehicleImportBatchQueued(batchId) {
    return enqueue(QUEUE_NAMES.PARTNER_FEED, "process_import_batch", {
      type: "process_import_batch",
      batchId,
    });
  },

  // ── Authentification ─────────────────────────────────────────────────────
  async emailVerification(to, userId, verifyUrl, firstName, code = null) {
    await enqueue(QUEUE_NAMES.EMAIL, "email_verification", {
      type:   "email_verification",
      to,
      userId,
      data:   { verifyUrl, firstName, code },
    }, { priority: PRIORITY.HIGH });
  },

  // Envoyé à la NOUVELLE adresse (voir usersController.requestEmailChange) —
  // l'ancienne adresse n'est jamais notifiée, l'ancienne reste active tant que
  // ce lien n'est pas confirmé.
  async emailChangeConfirmation(to, userId, confirmUrl, firstName, newEmail) {
    await enqueue(QUEUE_NAMES.EMAIL, "email_change_confirmation", {
      type:   "email_change_confirmation",
      to,
      userId,
      data:   { confirmUrl, firstName, newEmail },
    }, { priority: PRIORITY.HIGH });
  },

  async passwordReset(to, userId, resetUrl, firstName) {
    await enqueue(QUEUE_NAMES.EMAIL, "password_reset", {
      type:   "password_reset",
      to,
      userId,
      data:   { resetUrl, firstName },
    }, { priority: PRIORITY.HIGH });
  },

  // ── Factures ─────────────────────────────────────────────────────────────
  async invoiceReady(to, userId, invoiceData) {
    await enqueue(QUEUE_NAMES.EMAIL, "invoice_ready", {
      type:   "invoice_ready",
      to,
      userId,
      data:   invoiceData,
    });
  },

  // Facture mensuelle de commission partenaire — génère le PDF et l'envoie en
  // pièce jointe (voir queue/workers/pdf.worker.js, case "invoice").
  async partnerInvoiceReady(invoice, partnerEmail, partnerId, partnerName) {
    await enqueue(QUEUE_NAMES.PDF, "generate_invoice", {
      type:      "invoice",
      sendEmail: true,
      data:      { invoice, partnerEmail, partnerName, userId: partnerId },
    });
  },

  // ── Reçu de transaction ──────────────────────────────────────────────────
  // Déclenché après toute transaction réglée — cash sur place (validateTransaction)
  // ou paiement en ligne confirmé (webhook/simulatePayment) — pour que le client
  // reçoive systématiquement un reçu PDF par email, peu importe le mode de paiement.
  async transactionReceiptReady(booking, clientEmail, userId) {
    if (!clientEmail) return;
    await enqueue(QUEUE_NAMES.PDF, "generate_receipt", {
      type:      "receipt",
      sendEmail: true,
      data:      { booking, clientEmail, userId },
    });
  },
};
