/**
 * VIT AUTO — Définition centralisée des queues BullMQ
 *
 * Toutes les queues + options par défaut.
 * Importer QUEUE_NAMES dans les controllers pour éviter les typos.
 */

export const QUEUE_NAMES = {
  EMAIL:        "vit_email",
  SMS:          "vit_sms",
  WHATSAPP:     "vit_whatsapp",
  NOTIFICATION: "vit_notification",
  PDF:          "vit_pdf",
  OCR:          "vit_ocr",
  IMPORT:       "vit_import",
  AI:           "vit_ai",
  PARTNER_FEED: "vit_partner_feed",
};

// Options par défaut communes
export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 500 },
  removeOnFail:     { count: 200 },
  attempts:         3,
  backoff: { type: "exponential", delay: 2000 },
};

// Options spécifiques par queue
export const QUEUE_OPTIONS = {
  [QUEUE_NAMES.EMAIL]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  5,
    backoff:   { type: "exponential", delay: 3000 },
  },
  [QUEUE_NAMES.SMS]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  4,
  },
  [QUEUE_NAMES.WHATSAPP]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  3,
  },
  [QUEUE_NAMES.NOTIFICATION]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  2,
    removeOnComplete: { count: 1000 },
  },
  [QUEUE_NAMES.PDF]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  3,
    backoff:   { type: "fixed", delay: 5000 },
    removeOnComplete: { count: 100 },
  },
  [QUEUE_NAMES.OCR]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  2,
    backoff:   { type: "fixed", delay: 10000 },
    removeOnComplete: { count: 200 },
  },
  [QUEUE_NAMES.IMPORT]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  3,
    removeOnComplete: { count: 100 },
  },
  [QUEUE_NAMES.AI]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  2,
    removeOnComplete: { count: 200 },
    // Les tâches AI peuvent prendre du temps
    backoff:   { type: "fixed", delay: 15000 },
  },
  [QUEUE_NAMES.PARTNER_FEED]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts:  2,
    removeOnComplete: { count: 100 },
    // Import de flotte : peut prendre du temps (téléchargement d'images)
    backoff:   { type: "fixed", delay: 10000 },
  },
};

// Priorités
export const PRIORITY = { URGENT: 1, HIGH: 2, NORMAL: 3, LOW: 4 };

// Concurrence des workers
export const WORKER_CONCURRENCY = {
  [QUEUE_NAMES.EMAIL]:        10,
  [QUEUE_NAMES.SMS]:          10,
  [QUEUE_NAMES.WHATSAPP]:      5,
  [QUEUE_NAMES.NOTIFICATION]: 20,
  [QUEUE_NAMES.PDF]:           3,
  [QUEUE_NAMES.OCR]:           2,
  [QUEUE_NAMES.IMPORT]:        5,
  [QUEUE_NAMES.AI]:            2,
  [QUEUE_NAMES.PARTNER_FEED]:  2,
};
