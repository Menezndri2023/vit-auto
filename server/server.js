import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import connectDB from "./config/db.js";
import logger from "./utils/logger.js";

import authRoutes          from "./routes/auth.js";
import vehicleRoutes       from "./routes/vehicles.js";
import bookingRoutes       from "./routes/bookings.js";
import paymentRoutes       from "./routes/payments.js";
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

dotenv.config();

// ── Validation des variables d'environnement critiques ────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "MONGO_URI"];
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

const app = express();

// ── Origines autorisées ───────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// ── Sécurité headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // autorise les images
  contentSecurityPolicy: false, // désactivé car géré par le frontend React
}));

// ── CORS restreint ────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // En production : bloquer toute requête sans origin
    // En dev : autoriser Postman/curl (sans origin)
    if (!origin) {
      if (process.env.NODE_ENV === "production") {
        return callback(new Error("Requêtes sans origin interdites en production."));
      }
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqué : origine ${origin} non autorisée`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsing — 10 MB pour les photos base64 KYC (recto + verso + selfie) ─
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Protection injection NoSQL (MongoDB) ──────────────────────────────────
// Supprime les opérateurs $... des inputs utilisateur (ex: { "$gt": "" })
app.use(mongoSanitize({
  replaceWith: "_",      // remplace $ et . plutôt que supprimer
  allowDots: false,
  onSanitize: ({ key }) => {
    console.warn(`[SECURITY] Tentative injection NoSQL bloquée — champ : ${key}`);
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

// Limitation stricte : OTP, reset mot de passe
const strictLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,     // 1 heure
  max:             5,
  message:         { message: "Trop de tentatives. Réessayez dans 1 heure." },
  standardHeaders: true,
  legacyHeaders:   false,
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
  if (!req.path.startsWith("/api/ping")) {
    logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  }
  next();
});

// ── Healthcheck (sans rate limiting) ─────────────────────────────────────
app.get("/api/ping", (_req, res) => res.json({ status: "ok", timestamp: new Date() }));

// ── Health check détaillé (pour load balancers / monitoring) ─────────────
app.get("/api/health", async (_req, res) => {
  const { connection } = await import("mongoose");
  const dbState = ["disconnected", "connected", "connecting", "disconnecting"][connection.readyState] || "unknown";
  const healthy = dbState === "connected";
  res.status(healthy ? 200 : 503).json({
    status:    healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || "1.0.0",
    uptime:    Math.floor(process.uptime()),
    services:  { database: dbState, socketio: !!global._io },
    memory:    {
      used:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
  });
});

// ── Routes API ────────────────────────────────────────────────────────────
app.use("/api/auth",           authLimiter,      authRoutes);
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

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} non trouvée.` });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.message?.startsWith("CORS bloqué")) {
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
    const PORT = process.env.PORT || 5001;

    const http    = await import("http");
    const { Server } = await import("socket.io");
    const server  = http.createServer(app);

    // ── Socket.io — Temps réel partenaire & admin ────────────────────────────
    const io = new Server(server, {
      cors: {
        origin:      ALLOWED_ORIGINS,
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
        port: PORT, cors: ALLOWED_ORIGINS.join(", "),
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
    const gracefulShutdown = (signal) => {
      logger.info(`Signal ${signal} reçu — arrêt gracieux`);
      server.close(() => {
        logger.info("Serveur HTTP fermé");
        process.exit(0);
      });
      setTimeout(() => { logger.error("Timeout shutdown — force exit"); process.exit(1); }, 10000);
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

  } catch (error) {
    logger.error("Erreur démarrage", { message: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
