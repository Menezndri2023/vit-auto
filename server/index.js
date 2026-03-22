import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { initDatabase } from "./db/index.js";
import authRoutes from "./routes/auth.js";
import vehicleRoutes from "./routes/vehicles.js";
import bookingRoutes from "./routes/bookings.js";
import paymentRoutes from "./routes/payments.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;

(async () => {
  await initDatabase();

  app.get("/api/ping", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/vehicles", vehicleRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/payments", paymentRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: "Route non trouvée" });
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });
})();

