// Veille de maintenance — lecture seule, administrateurs (voir utils/maintenanceWatchdog.js).
import express from "express";
import { authenticate, authorizeAdmin } from "../middleware/auth.js";
import { calculerEtatMaintenance, ACTION_REFUS_PUBLICATION } from "../utils/maintenanceWatchdog.js";
import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Toutes les vérifications, vertes comprises : un « rien à signaler » affiché
// vaut mieux qu'un silence qu'on ne sait pas interpréter.
router.get("/", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const checks = await calculerEtatMaintenance(new Date());
    res.json({ checkedAt: new Date().toISOString(), checks });
  } catch (err) {
    logger.error("GET /api/admin/maintenance:", err);
    res.status(500).json({ message: "Vérifications indisponibles." });
  }
});

// Publications refusées (7 jours) : qui a essayé de publier quoi, et pourquoi
// le serveur a refusé — pour relancer le partenaire au lieu de le perdre.
router.get("/refus-publication", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const depuis = new Date(Date.now() - 7 * 24 * 3600000);
    const refus = await AuditLog.find({ action: ACTION_REFUS_PUBLICATION, createdAt: { $gte: depuis } })
      .select("userId userEmail resource errorMessage changes.after createdAt")
      .populate("userId", "firstName lastName phone country partnerActivity kycStatus")
      .sort({ createdAt: -1 }).limit(200).lean();
    res.json({ refus });
  } catch (err) {
    logger.error("GET /api/admin/maintenance/refus-publication:", err);
    res.status(500).json({ message: "Journal indisponible." });
  }
});

export default router;
