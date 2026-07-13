import logger from "../utils/logger.js";
import Review from "../models/Review.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";

// ── Laisser un avis après une commande complétée ──────────────────────────
export const createReview = async (req, res) => {
  try {
    const { bookingId, note, commentaire } = req.body;

    if (!bookingId || !note) {
      return res.status(400).json({ message: "bookingId et note requis." });
    }
    if (note < 1 || note > 5) {
      return res.status(400).json({ message: "Note entre 1 et 5." });
    }

    const booking = await Booking.findById(bookingId)
      .populate("vehicle", "owner")
      .populate("driver", "owner");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });
    if (booking.client?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Cette commande ne vous appartient pas." });
    }
    if (booking.status !== "completed") {
      return res.status(400).json({ message: "La commande doit être terminée pour laisser un avis." });
    }
    if (booking.review) {
      return res.status(409).json({ message: "Vous avez déjà laissé un avis pour cette commande." });
    }

    // Déterminer la cible
    let targetType, targetId, ownerId;
    if (booking.vehicle) {
      targetType = "vehicle";
      targetId   = booking.vehicle._id;
      ownerId    = booking.vehicle.owner;
    } else if (booking.driver) {
      targetType = "driver";
      targetId   = booking.driver._id;
      ownerId    = booking.driver.owner;
    } else {
      return res.status(400).json({ message: "Aucune ressource associée à cette commande." });
    }

    const review = await Review.create({
      booking: bookingId,
      reviewer: req.user._id,
      targetType,
      targetId,
      note,
      commentaire,
    });

    // Lier l'avis à la commande
    booking.review = review._id;
    await booking.save();

    // Notifier le partenaire
    if (ownerId) {
      await Notification.create({
        user: ownerId,
        type: "new_review",
        titre: "Nouvel avis reçu ⭐",
        message: `${req.user.firstName} a laissé un avis ${note}/5 sur votre annonce.`,
        lien: "/vendor/dashboard",
      });
    }

    res.status(201).json({ review });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Vous avez déjà laissé un avis pour cette commande." });
    }
    logger.error("createReview:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Avis d'un véhicule ou chauffeur (public) ──────────────────────────────
export const getReviews = async (req, res) => {
  try {
    const { targetType, targetId } = req.query;
    if (!targetType || !targetId) {
      return res.status(400).json({ message: "targetType et targetId requis." });
    }

    const reviews = await Review.find({ targetType, targetId, visible: true })
      .sort({ createdAt: -1 })
      .populate("reviewer", "firstName lastName profilePhoto");

    const avg = reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.note, 0) / reviews.length) * 10) / 10
      : 0;

    res.json({ reviews, noteMoyenne: avg, total: reviews.length });
  } catch (err) {
    logger.error("getReviews:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Liste des avis (admin) — pour modération ──────────────────────────────
export const adminListReviews = async (req, res) => {
  try {
    const { visible, targetType, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (visible === "true" || visible === "false") filter.visible = visible === "true";
    if (targetType) filter.targetType = targetType;

    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (Math.max(Number(page), 1) - 1) * safeLimit;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("reviewer", "firstName lastName email")
        .lean(),
      Review.countDocuments(filter),
    ]);

    // Annoter le nom de la cible (véhicule ou chauffeur) pour l'affichage admin
    const Vehicle = (await import("../models/Vehicle.js")).default;
    const Driver  = (await import("../models/Driver.js")).default;
    const vehicleIds = reviews.filter((r) => r.targetType === "vehicle").map((r) => r.targetId);
    const driverIds  = reviews.filter((r) => r.targetType === "driver").map((r) => r.targetId);
    const [vehicles, drivers] = await Promise.all([
      vehicleIds.length ? Vehicle.find({ _id: { $in: vehicleIds } }).select("title").lean() : [],
      driverIds.length  ? Driver.find({ _id: { $in: driverIds } }).select("firstName lastName").lean() : [],
    ]);
    const vehicleMap = Object.fromEntries(vehicles.map((v) => [String(v._id), v.title]));
    const driverMap  = Object.fromEntries(drivers.map((d) => [String(d._id), `${d.firstName} ${d.lastName}`]));
    const annotated = reviews.map((r) => ({
      ...r,
      targetLabel: r.targetType === "vehicle" ? vehicleMap[String(r.targetId)] : driverMap[String(r.targetId)],
    }));

    res.json({ reviews: annotated, total, page: Number(page), pages: Math.ceil(total / safeLimit) });
  } catch (err) {
    logger.error("adminListReviews:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Masquer / réafficher un avis (admin) ──────────────────────────────────
// findByIdAndUpdate ne déclenche pas le hook post("save") du modèle — la
// moyenne/nombre d'avis du véhicule/chauffeur doit être recalculée ici
// explicitement, sinon un avis masqué continue de fausser la note affichée.
export const setReviewVisibility = async (req, res, visible) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { visible }, { new: true });
    if (!review) return res.status(404).json({ message: "Avis introuvable." });
    await Review.recalcTargetStats(review.targetType, review.targetId);
    res.json({ review });
  } catch (err) {
    logger.error("setReviewVisibility:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const hideReview   = (req, res) => setReviewVisibility(req, res, false);
export const unhideReview = (req, res) => setReviewVisibility(req, res, true);
