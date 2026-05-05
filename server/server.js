import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import connectDB from "./config/db.js";

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

dotenv.config();

// ── Validation des variables d'environnement critiques ────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "MONGO_URI"];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error("❌ Variables d'environnement manquantes :", missingEnv.join(", "));
  console.error("   Créez un fichier .env à partir de .env.example");
  process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error("❌ JWT_SECRET trop court (minimum 32 caractères requis)");
  process.exit(1);
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
    // Autorise les requêtes sans origin (Postman, mobile, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqué : origine ${origin} non autorisée`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsing avec limites raisonnables ────────────────────────────────
app.use(express.json({ limit: "5mb" }));           // 5 MB max (photos base64)
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,     // 15 minutes
  max:             15,                  // 15 tentatives max
  message:         { message: "Trop de tentatives. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,         // ne compte que les échecs
});

const apiLimiter = rateLimit({
  windowMs:        10 * 60 * 1000,     // 10 minutes
  max:             300,
  message:         { message: "Trop de requêtes. Réessayez dans quelques minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Healthcheck (sans rate limiting) ─────────────────────────────────────
app.get("/api/ping", (_req, res) => res.json({ status: "ok", timestamp: new Date() }));

// ── Routes API ────────────────────────────────────────────────────────────
app.use("/api/auth",           authLimiter, authRoutes);
app.use("/api/vehicles",       apiLimiter,  vehicleRoutes);
app.use("/api/bookings",       apiLimiter,  bookingRoutes);
app.use("/api/payments",       apiLimiter,  paymentRoutes);
app.use("/api/users",          apiLimiter,  userRoutes);
app.use("/api/drivers",        apiLimiter,  driverRoutes);
app.use("/api/reviews",        apiLimiter,  reviewRoutes);
app.use("/api/notifications",  apiLimiter,  notificationRoutes);
app.use("/api/subscriptions",  apiLimiter,  subscriptionRoutes);
app.use("/api/chats",          apiLimiter,  chatRoutes);
app.use("/api/contracts",      apiLimiter,  contractRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} non trouvée.` });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Erreur CORS
  if (err.message?.startsWith("CORS bloqué")) {
    return res.status(403).json({ message: err.message });
  }
  console.error("Erreur non gérée :", err);
  res.status(500).json({ message: "Erreur serveur interne." });
});

// ── Démarrage ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 5001;

    const http   = await import("http");
    const server = http.createServer(app);
    // SO_REUSEADDR : permet de réutiliser un port en TIME_WAIT (Windows)
    server.listen({ port: PORT, exclusive: false }, () => {
      const env = process.env.NODE_ENV || "development";
      console.log(`\n🚀 VIT AUTO API — ${env.toUpperCase()}`);
      console.log(`   Port     : ${PORT}`);
      console.log(`   CORS     : ${ALLOWED_ORIGINS.join(", ")}`);
      console.log(`   Auth     : /api/auth`);
      console.log(`   Véhicules: /api/vehicles`);
      console.log(`   Commandes: /api/bookings`);
      console.log(`   Chats    : /api/chats\n`);
    });

    // Gestion propre du port déjà occupé
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`\n❌ Le port ${PORT} est déjà utilisé.`);
        console.error(`   Sur Windows, ouvrez un terminal séparé et lancez :`);
        console.error(`   netstat -ano | findstr :${PORT}`);
        console.error(`   taskkill /PID <PID_AFFICHÉ> /F`);
        console.error(`   puis relancez npm run dev\n`);
        process.exit(1);
      } else {
        console.error("❌ Erreur serveur :", err);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error("❌ Erreur démarrage :", error);
    process.exit(1);
  }
};

startServer();
