import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

import authRoutes         from "./routes/auth.js";
import vehicleRoutes      from "./routes/vehicles.js";
import bookingRoutes      from "./routes/bookings.js";
import paymentRoutes      from "./routes/payments.js";
import userRoutes         from "./routes/users.js";
import driverRoutes       from "./routes/drivers.js";
import reviewRoutes       from "./routes/reviews.js";
import notificationRoutes from "./routes/notifications.js";

dotenv.config();

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Healthcheck ───────────────────────────────────────────
app.get("/api/ping", (_req, res) => res.json({ status: "ok", timestamp: new Date() }));

// ── Routes API ────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/vehicles",      vehicleRoutes);
app.use("/api/bookings",      bookingRoutes);
app.use("/api/payments",      paymentRoutes);
app.use("/api/users",         userRoutes);
app.use("/api/drivers",       driverRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/notifications", notificationRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} non trouvée.` });
});

// ── Erreur globale ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Erreur non gérée :", err);
  res.status(500).json({ message: "Erreur serveur interne." });
});

// ── Démarrage ─────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      console.log(`🚀 VIT AUTO API lancée sur http://localhost:${PORT}`);
      console.log(`   → Auth          : /api/auth`);
      console.log(`   → Véhicules     : /api/vehicles`);
      console.log(`   → Chauffeurs    : /api/drivers`);
      console.log(`   → Commandes     : /api/bookings`);
      console.log(`   → Paiements     : /api/payments`);
      console.log(`   → Avis          : /api/reviews`);
      console.log(`   → Notifications : /api/notifications`);
      console.log(`   → Utilisateurs  : /api/users`);
    });
  } catch (error) {
    console.error("❌ Erreur démarrage :", error);
    process.exit(1);
  }
};

startServer();
