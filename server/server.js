import express from "express";
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import connectDB from "./config/db.js";
import logger from "./utils/logger.js";
import { initSentry, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from "./config/sentry.js";
import { initQueues, isReady as isQueuesReady, getQueueStats } from "./queue/index.js";
import { startPartnerReminderScheduler } from "./utils/partnerReminders.js";
import { startAccountHealthScheduler } from "./utils/accountHealthCheck.js";

import authRoutes          from "./routes/auth.js";
import vehicleRoutes       from "./routes/vehicles.js";
import vehicleImportRoutes from "./routes/vehicleImport.js";
import bookingRoutes       from "./routes/bookings.js";
import paymentRoutes       from "./routes/payments.js";
import * as paymentController from "./controllers/paymentController.js";
import userRoutes          from "./routes/users.js";
import driverRoutes        from "./routes/drivers.js";
import reviewRoutes        from "./routes/reviews.js";
import notificationRoutes  from "./routes/notifications.js";
import subscriptionRoutes  from "./routes/subscriptions.js";
import chatRoutes          from "./routes/chats.js";
import contractRoutes      from "./routes/contracts.js";
import importExportRoutes  from "./routes/importExport.js";
import invoiceRoutes       from "./routes/invoices.js";
import adsRoutes           from "./routes/ads.js";
import geoRoutes           from "./routes/geo.js";
import kycRoutes           from "./routes/kyc.js";
import certificationRoutes    from "./routes/partnerCertification.js";
import partnerVerifRoutes     from "./routes/partnerVerification.js";
import pmsRoutes              from "./routes/pms.js";
import partnerOnboardingRoutes from "./routes/partnerOnboarding.js";
import auditLogRoutes         from "./routes/auditLog.js";
import analyticsRoutes        from "./routes/analytics.js";
import insuranceRoutes        from "./routes/insurance.js";
import favoritesRoutes        from "./routes/favorites.js";
import { authenticate, authorizeAdmin } from "./middleware/auth.js";

dotenv.config();
initSentry();

// ── Validation des variables d'environnement critiques ────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "REFRESH_TOKEN_SECRET", "MONGO_URI"];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error("❌ Variables d'environnement manquantes :", missingEnv.join(", "));
  console.error("   Créez un fichier .env à partir de .env.example");
  process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
  console.error("❌ JWT_SECRET trop court (minimum 64 caractères / 512 bits requis pour la sécurité cryptographique)");
  if (process.env.NODE_ENV === "production") process.exit(1);
  else console.warn("⚠️  Mode développement — clé acceptée temporairement.");
}

if (process.env.REFRESH_TOKEN_SECRET && process.env.REFRESH_TOKEN_SECRET.length < 64) {
  console.error("❌ REFRESH_TOKEN_SECRET trop court (minimum 64 caractères / 512 bits requis)");
  if (process.env.NODE_ENV === "production") process.exit(1);
  else console.warn("⚠️  Mode développement — clé acceptée temporairement.");
}

if (process.env.REFRESH_TOKEN_SECRET === process.env.JWT_SECRET) {
  console.error("❌ REFRESH_TOKEN_SECRET doit être DIFFÉRENT de JWT_SECRET (deux clés distinctes requises).");
  if (process.env.NODE_ENV === "production") process.exit(1);
}

// ── Filet de sécurité process : une exception/rejet non catché ne doit pas
// faire crasher le process en silence (ex: coupure Mongo pendant un await
// dans un handler async sans try/catch) — on logue puis on sort proprement
// pour que Railway relance le service au lieu de rester dans un état zombie.
process.on("unhandledRejection", async (reason) => {
  // Les tentatives de reconnexion ioredis (AUTH pendant le cycle connect/close)
  // rejettent parfois une promesse interne non rattrapée par le listener
  // "error" du client — sans ce filtre, une panne Redis dure (ex: quota
  // Upstash dépassé) inonderait les logs d'un dump brut à chaque reconnexion.
  // noteRedisError() reconnaît ce motif, ouvre le circuit-breaker (queue/index.js
  // met les workers en pause) et ne logue qu'une fois par fenêtre de cooldown.
  try {
    const { noteRedisError } = await import("./queue/connection.js");
    if (noteRedisError(reason)) return;
  } catch { /* ignore */ }
  logger.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  process.exit(1);
});

const app = express();

// Railway (et tout load balancer devant l'app) transmet X-Forwarded-For — sans
// ceci, express-rate-limit ne peut pas identifier les clients de façon fiable
// et logge une erreur de validation à chaque requête (tous les clients
// partageant potentiellement le même compteur de rate-limit derrière le proxy).
app.set("trust proxy", 1);

// ── Healthcheck (avant tout middleware) ───────────────────────────────────
// Doit répondre avant Helmet/CORS : les sondes Railway (et autres load balancers)
// n'envoient pas de header Origin, or la vérif CORS rejette toute requête sans
// origin en production — placé après ces middlewares, /api/ping échouait
// systématiquement, empêchant tout déploiement de passer le healthcheck.
app.get("/api/ping", (_req, res) => res.json({ status: "ok", timestamp: new Date() }));

// ── Sentry request handler (doit être le PREMIER middleware) ─────────────
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// ── Compression gzip/brotli des réponses JSON — aucune réponse n'était compressée ──
app.use(compression());

// ── Origines autorisées ───────────────────────────────────────────────────
// Comparaison par NOM DE DOMAINE (sans "www.", indépendamment du protocole/port/slash
// final), pas par égalité stricte de chaîne — la précédente version comparait des
// chaînes exactes et restait fragile à la moindre différence entre FRONTEND_URL et
// l'origine réellement envoyée par le navigateur (www vs non-www, valeur sans
// protocole, etc.), reproduisant "CORS bloqué : origine ... non autorisée" en
// production malgré un premier correctif. Log de démarrage pour diagnostic immédiat
// dans les logs Railway si un domaine est rejeté à tort.
const configuredOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const normalizeHost = (raw) => {
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
};

const ALLOWED_HOSTS = [...new Set(configuredOrigins.map(normalizeHost).filter(Boolean))];
logger.info("[CORS] Domaines autorisés (www/non-www acceptés automatiquement)", {
  fromEnv: configuredOrigins, resolvedHosts: ALLOWED_HOSTS,
});

const isOriginAllowed = (origin) => {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.replace(/^www\./i, "").toLowerCase();
    return ALLOWED_HOSTS.includes(host);
  } catch {
    return false;
  }
};

// ── Sécurité headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    // L'API ne sert pas de HTML : CSP bloque les réponses non-JSON accidentelles
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// ── CORS restreint ────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Aucune origine (healthchecks Railway, curl/Postman, apps mobiles, et — cas
    // découvert en prod — certaines requêtes fetch() same-origin du navigateur qui
    // n'envoient pas systématiquement d'en-tête Origin sur un simple GET) : on ne
    // bloque pas, car l'en-tête Origin est de toute façon trivialement falsifiable
    // et n'apporte donc aucune protection réelle contre un client malveillant — la
    // vraie protection vient de l'authentification (JWT) ou du token applicatif de
    // chaque route, pas de la présence d'un Origin.
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error(`CORS bloqué : origine ${origin} non autorisée`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Webhooks Stripe/Wave — corps BRUT requis pour vérifier leur signature
// cryptographique (stripe-signature / Wave-Signature), donc montés ICI, avant
// express.json() qui parserait sinon le corps et empêcherait toute vérification
// fiable de la signature (voir services/payment/providers/*Provider.js).
app.post("/api/payments/webhook/stripe", express.raw({ type: "application/json" }), paymentController.stripeWebhook);
app.post("/api/payments/webhook/wave",   express.raw({ type: "application/json" }), paymentController.waveWebhook);

// ── Body parsing — 20 MB pour couvrir jusqu'à 6 photos véhicule (VendorSubmit.jsx,
// recompressées côté client mais avec marge) en plus des photos base64 KYC ──
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ── Protection injection NoSQL (MongoDB) ──────────────────────────────────
// Supprime les opérateurs $... des inputs utilisateur (ex: { "$gt": "" })
app.use(mongoSanitize({
  replaceWith: "_",      // remplace $ et . plutôt que supprimer
  allowDots: false,
  onSanitize: ({ key }) => {
    logger.warn("[SECURITY] Tentative injection NoSQL bloquée", { field: key });
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,     // 15 minutes
  max:             10,                  // 10 tentatives (anti brute-force renforcé)
  message:         { message: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,     // 10 minutes
  max:             300,
  message:         { message: "Trop de requêtes. Réessayez dans quelques minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Limiter catalogue public (anti-scraping bots)
const catalogueLimiter = rateLimit({
  windowMs:        5 * 60 * 1000,
  max:             200,               // 200 req/5min = largement suffisant pour navigation normale
  message:         { message: "Trop de requêtes. Réessayez dans quelques minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
  // Skip les IPs localhost en dev
  skip:            (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});

// Limiter upload / KYC (ressources intensives)
const uploadLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             20,
  message:         { message: "Trop de soumissions. Réessayez dans 1 heure." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Request logging middleware ────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ── Health check détaillé (pour load balancers / monitoring) ─────────────
app.get("/api/health", async (_req, res) => {
  const mongoose = await import("mongoose");
  const { isRedisAvailable } = await import("./config/redis.js");
  const dbState = ["disconnected", "connected", "connecting", "disconnecting"][mongoose.default.connection.readyState] || "unknown";
  const healthy = dbState === "connected";
  res.status(healthy ? 200 : 503).json({
    status:    healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || "1.0.0",
    uptime:    Math.floor(process.uptime()),
    services:  {
      database: dbState,
      redis:    isRedisAvailable() ? "connected" : "unavailable",
      queues:   isQueuesReady() ? "ready" : "sync-mode",
      socketio: !!global._io,
      email:    process.env.RESEND_API_KEY ? "resend" : (process.env.SMTP_HOST ? "smtp" : "console"),
      imagekit: process.env.IMAGEKIT_PUBLIC_KEY ? "configured" : "disabled",
      whatsapp: process.env.WHATSAPP_TOKEN ? "configured" : "disabled",
      push:     process.env.FCM_SERVER_KEY ? "configured" : "disabled",
      sentry:   process.env.SENTRY_DSN ? "configured" : "disabled",
    },
    memory:    {
      used:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
  });
});

// ── Routes API ────────────────────────────────────────────────────────────
app.use("/api/auth",           authLimiter,      authRoutes);
app.use("/api/vehicles/import", apiLimiter,      vehicleImportRoutes); // AVANT /api/vehicles (routes statiques d'abord)
app.use("/api/vehicles",       catalogueLimiter, vehicleRoutes);   // Anti-scraping catalogue
app.use("/api/bookings",       apiLimiter,       bookingRoutes);
app.use("/api/payments",       apiLimiter,       paymentRoutes);
app.use("/api/users",          apiLimiter,       userRoutes);
app.use("/api/drivers",        apiLimiter,       driverRoutes);
app.use("/api/reviews",        apiLimiter,       reviewRoutes);
app.use("/api/notifications",  apiLimiter,       notificationRoutes);
app.use("/api/subscriptions",  apiLimiter,       subscriptionRoutes);
app.use("/api/chats",          apiLimiter,       chatRoutes);
app.use("/api/contracts",      apiLimiter,       contractRoutes);
app.use("/api/import-export",  apiLimiter,       importExportRoutes);
app.use("/api/invoices",       apiLimiter,       invoiceRoutes);
app.use("/api/ads",            catalogueLimiter, adsRoutes);
app.use("/api/geo",            apiLimiter,       geoRoutes);
app.use("/api/kyc",            uploadLimiter,    kycRoutes);        // KYC = ressource intensive
app.use("/api/certification",  uploadLimiter,    certificationRoutes); // Certification partenaire
app.use("/api/partner-verif", apiLimiter,       partnerVerifRoutes);  // Dossiers vérification partenaires
app.use("/api/pms",           apiLimiter,       pmsRoutes);           // Partner Management System
// apiLimiter ici (pas uploadLimiter) — "/my" et "/availability" sont pollés/rechargés
// fréquemment ; seule PATCH /section/:sectionName (documents/photos) reste sous uploadLimiter,
// appliqué directement dans routes/partnerOnboarding.js.
app.use("/api/partner-onboarding", apiLimiter, partnerOnboardingRoutes); // Founding Partner Onboarding
app.use("/api/audit-log",          apiLimiter, auditLogRoutes);          // Journal d'audit (consultation admin)
app.use("/api/analytics",          apiLimiter, analyticsRoutes);         // Analytics avancé (consultation admin)
app.use("/api/insurance",          apiLimiter, insuranceRoutes);         // Demandes d'assurance
app.use("/api/favorites",          apiLimiter, favoritesRoutes);         // Favoris véhicules / annonces IE

// ── Communication tracking (pixel ouverture + clic email) ────────────────────
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"
);
app.get("/api/comm/track/open/:trackingId", apiLimiter, async (req, res) => {
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache" });
  res.end(TRANSPARENT_GIF);
  const { trackOpen } = await import("./services/communication/analytics/CommunicationAnalytics.js");
  trackOpen(req.params.trackingId).catch(() => {});
});

app.get("/api/comm/track/click/:trackingId", apiLimiter, async (req, res) => {
  const { url } = req.query;
  const { trackClick } = await import("./services/communication/analytics/CommunicationAnalytics.js");
  trackClick(req.params.trackingId, url).catch(() => {});

  // Sécurité open-redirect : n'autoriser que les URLs du domaine VIT AUTO
  const SAFE_ORIGINS = [
    process.env.APP_URL        || "https://vit-auto.com",
    process.env.FRONTEND_URL   || "http://localhost:5173",
    "https://vit-auto.com",
    "https://www.vit-auto.com",
  ];
  const isSafe = url &&
    typeof url === "string" &&
    /^https?:\/\//.test(url) &&
    SAFE_ORIGINS.some((o) => url === o || url.startsWith(o + "/"));

  res.redirect(302, isSafe ? url : (process.env.APP_URL || "https://vit-auto.com"));
});

// ── Analytics communication (admin uniquement — JWT + rôle vérifié) ──────────
app.get("/api/comm/stats", apiLimiter, authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { getStats } = await import("./services/communication/analytics/CommunicationAnalytics.js");
    const stats = await getStats(req.query);
    res.json({ stats });
  } catch (err) {
    logger.error("comm/stats error:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
});

// ── ImageKit auth token (frontend upload direct) ──────────────────────────────
// Authentifié + rate-limité : sans cela, n'importe quel visiteur anonyme pouvait
// obtenir en boucle des jetons d'upload direct vers ImageKit (abus de quota/stockage).
app.get("/api/imagekit/auth", apiLimiter, authenticate, (req, res) => {
  import("./config/imagekit.js").then(({ getAuthToken }) => {
    const token = getAuthToken();
    if (!token) return res.status(503).json({ message: "ImageKit non configuré." });
    res.json(token);
  }).catch(() => res.status(500).json({ message: "Erreur." }));
});

// ── Queue stats (admin) ────────────────────────────────────────────────────────
app.get("/api/queue/stats", apiLimiter, authenticate, authorizeAdmin, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json({ ready: isQueuesReady(), queues: stats });
  } catch (err) {
    logger.error("queue/stats error:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
});

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} non trouvée.` });
});

// ── Sentry error handler (doit être AVANT le handler d'erreur global) ────
app.use(sentryErrorHandler());

// ── Gestionnaire d'erreurs global ─────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.message?.startsWith("CORS bloqué")) {
    logger.warn("[CORS] Origine rejetée", { origin: req.headers.origin, allowedHosts: ALLOWED_HOSTS, fromEnv: process.env.FRONTEND_URL });
    return res.status(403).json({ message: err.message });
  }
  const isProd = process.env.NODE_ENV === "production";
  logger.error("Erreur non gérée", {
    message: err.message,
    path:    req.path,
    method:  req.method,
    ...(isProd ? {} : { stack: err.stack }),
  });
  // Ne jamais exposer la stack en production
  res.status(err.status || 500).json({
    message: isProd ? "Erreur serveur interne." : (err.message || "Erreur serveur interne."),
  });
});

// ── Démarrage ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();

    // ── BullMQ : queues + workers (si Redis configuré) ───────────────────
    await initQueues();

    // ── Relance automatique des dossiers partenaire incomplets ───────────
    // En mémoire (pas de job Redis) — voir utils/partnerReminders.js.
    startPartnerReminderScheduler();

    // ── Relance automatique des profils/comptes incomplets (tous rôles) ──
    startAccountHealthScheduler();

    const PORT = process.env.PORT || 5001;

    const http    = await import("http");
    const { Server } = await import("socket.io");
    const server  = http.createServer(app);

    // ── Socket.io — Temps réel partenaire & admin ────────────────────────────
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || isOriginAllowed(origin)) return callback(null, true);
          callback(new Error(`CORS bloqué (socket.io) : origine ${origin} non autorisée`));
        },
        methods:     ["GET", "POST"],
        credentials: true,
      },
    });

    global._io = io;

    // Socket.io : vérifier le JWT avant d'autoriser la connexion
    const { verify: jwtVerify } = await import("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET;

    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(); // Connexion anonyme tolérée (lecture publique)
      try {
        const decoded = jwtVerify(token, JWT_SECRET);
        socket.data.userId = decoded.id || decoded.userId;
        socket.data.role   = decoded.role;
        next();
      } catch {
        next(); // Token invalide → connexion anonyme
      }
    });

    io.on("connection", (socket) => {
      const userId = socket.data.userId;
      const role   = socket.data.role;
      if (userId) {
        socket.join(`user_${userId}`);
        if (role === "partenaire" || role === "admin") socket.join(`partner_${userId}`);
        if (role === "admin") socket.join("admins");
      }
      socket.on("disconnect", () => {});
    });

    // SO_REUSEADDR : permet de réutiliser un port en TIME_WAIT (Windows)
    server.listen({ port: PORT, exclusive: false }, () => {
      const env = process.env.NODE_ENV || "development";
      logger.info(`VIT AUTO API démarré — ${env.toUpperCase()}`, {
        port: PORT, corsHosts: ALLOWED_HOSTS.join(", "),
      });
    });

    // Gestion propre du port déjà occupé
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} déjà utilisé`);
        process.exit(1);
      } else {
        logger.error("Erreur serveur", { message: err.message });
        process.exit(1);
      }
    });

    // Shutdown gracieux SIGTERM (Kubernetes, Docker, Railway)
    const gracefulShutdown = async (signal) => {
      logger.info(`Signal ${signal} reçu — arrêt gracieux`);
      server.close(async () => {
        logger.info("Serveur HTTP fermé — fermeture des queues BullMQ");
        try {
          const { closeQueues } = await import("./queue/index.js");
          await closeQueues();
        } catch (_) {}
        try {
          const mongoose = (await import("mongoose")).default;
          await mongoose.connection.close();
        } catch (_) {}
        process.exit(0);
      });
      setTimeout(() => { logger.error("Timeout shutdown — force exit"); process.exit(1); }, 30000);
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

  } catch (error) {
    logger.error("Erreur démarrage", { message: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
