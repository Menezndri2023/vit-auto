import logger from "../utils/logger.js";
import Report from "../models/Report.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";

const TARGET_MODELS = {
  vehicle:    "Vehicle",
  ie_listing: "ImportExportListing",
  review:     "Review",
  driver:     "Driver",
  user:       "User",
};

// ── POST /api/reports — créer un signalement ──────────────────────────────
export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, description } = req.body;
    if (!TARGET_MODELS[targetType] || !targetId || !reason) {
      return res.status(400).json({ message: "Champs requis manquants ou invalides." });
    }

    const report = await Report.create({
      reporter: req.user._id,
      targetType, targetId, reason,
      description: description || null,
    });

    // Notifier les admins — bug réel corrigé (audit) : Notification.insertMany
    // ne pousse jamais l'événement socket temps réel (même trou déjà comblé
    // pour vehicle/driver/KYC/showroom/Import-Export) — basculé sur
    // notifyAdmins() (email + in-app + socket, un seul mécanisme partout).
    notifyAdmins(
      "system",
      "🚩 Nouveau signalement",
      `Signalement (${reason}) sur ${targetType} — à examiner.`,
      "/admin?tab=reports",
    ).catch((e) => logger.error("createReport notify admins:", e.message));

    res.status(201).json({ message: "Signalement envoyé — notre équipe va l'examiner.", report });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json({ message: "Vous avez déjà signalé ce contenu." });
    }
    logger.error("createReport:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/reports/admin — liste (admin) ────────────────────────────────
export const getReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const filter = {};
    if (status) filter.status = status;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate("reporter", "firstName lastName email")
        .populate("reviewedBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip((Math.max(Number(page), 1) - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Report.countDocuments(filter),
    ]);

    res.json({ reports, total, pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("getReports:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/reports/admin/:id — traiter un signalement ─────────────────
export const updateReportStatus = async (req, res) => {
  try {
    const { status, reviewNote } = req.body;
    if (!["examine", "classe_sans_suite", "action_prise"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const report = await Report.findByIdAndUpdate(req.params.id, {
      status, reviewNote: reviewNote || null,
      reviewedBy: req.user._id, reviewedAt: new Date(),
    }, { new: true });
    if (!report) return res.status(404).json({ message: "Signalement introuvable." });
    res.json({ report });
  } catch (err) {
    logger.error("updateReportStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
