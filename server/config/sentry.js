import * as Sentry from "@sentry/node";
import logger from "../utils/logger.js";

// Lazy : lu après dotenv.config() — ne pas capturer à l'import (ESM hoist)
const DSN = () => process.env.SENTRY_DSN;
let _initialized = false;

export function initSentry() {
  const dsn = DSN();
  if (!dsn) {
    logger.warn("Sentry: SENTRY_DSN absent — monitoring désactivé");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    // Passer un tableau à `integrations` REMPLACE la liste par défaut au lieu
    // de l'étendre — sans onUncaughtException/onUnhandledRejection explicites
    // ici, les crashs process n'étaient plus jamais capturés par Sentry.
    integrations: [
      Sentry.expressIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    beforeSend(event, hint) {
      const status = hint?.originalException?.status;
      if (status && status < 500) return null;
      return event;
    },
  });

  _initialized = true;
  logger.info("Sentry initialisé", { env: process.env.NODE_ENV });
}

// Sentry v10 : plus besoin de requestHandler/tracingHandler séparés
// (expressIntegration() gère automatiquement le contexte de la requête)
export function sentryRequestHandler() {
  return (_req, _res, next) => next();
}

export function sentryTracingHandler() {
  return (_req, _res, next) => next();
}

// Doit être enregistré APRÈS toutes les routes, AVANT le handler d'erreur global
export function sentryErrorHandler() {
  if (!_initialized) return (_err, _req, _res, next) => next(_err);
  return Sentry.expressErrorHandler();
}

// Capture manuelle d'une exception (ex: dans un catch controller)
export function captureException(err, context = {}) {
  if (!_initialized) return;
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(err);
  });
}
