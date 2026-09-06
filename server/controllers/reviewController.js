import logger from "../utils/logger.js";
import Review from "../models/Review.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";

// Champ Booking correspondant à chaque targetType — permet un contrôle
// "déjà noté" par cible (au lieu du seul champ historique `review`) et de
// tracer l'avis sur la réservation sans requête Review supplémentaire.
const BOOKING_REVIEW_FIELD = {
  vehicle:  "review",
  driver:   "review",
  partner:  "partnerReviewByClient",
  platform: "platformReviewByClient",
  client:   "clientReviewByPartner",
};

// ── Laisser un avis après une commande complétée ──────────────────────────
// Point d'entrée unique pour les 5 cibles d'avis (véhicule/chauffeur/agence/
// plateforme/client) — dispatch par targetType, même principe que
// ieTransactionController.addReview pour les avis Import/Export.
export const createReview = async (req, res) => {
  try {
    const { bookingId, targetType, note, commentaire, wentWell } = req.body;

    if (!bookingId || !note) {
      return res.status(400).json({ message: "bookingId et note requis." });
    }
    if (note < 1 || note > 5) {
      return res.status(400).json({ message: "Note entre 1 et 5." });
    }
    if (targetType && !BOOKING_REVIEW_FIELD[targetType]) {
      return res.status(400).json({ message: "Cible d'avis invalide." });
    }

    const booking = await Booking.findById(bookingId)
      .populate("vehicle", "owner")
      .populate("driver", "owner");

    if (!booking) return res.status(404).json({ message: "Commande introuvable." });
    if (booking.status !== "completed") {
      return res.status(400).json({ message: "La commande doit être terminée pour laisser un avis." });
    }

    const ownerId = booking.vehicle?.owner || booking.driver?.owner || null;
    const isClient  = booking.client?.toString() === req.user._id.toString();
    const isPartner = ownerId?.toString() === req.user._id.toString();

    // Résoudre effectiveTargetType/targetId/ownerId selon le rôle de l'auteur.
    let effectiveTargetType = targetType, resolvedTargetId;

    if (targetType === "client") {
      // Le partenaire note le client — l'auteur doit être le propriétaire
      // du véhicule/chauffeur de la réservation, jamais le client lui-même.
      if (!isPartner) return res.status(403).json({ message: "Seul le partenaire de cette commande peut noter le client." });
      resolvedTargetId = booking.client;
    } else {
      // vehicle/driver/partner/platform — l'auteur doit être le client.
      if (!isClient) return res.status(403).json({ message: "Cette commande ne vous appartient pas." });
      if (!targetType) {
        // Compatibilité : appel historique sans targetType → déduit du contenu de la commande.
        if (booking.vehicle) effectiveTargetType = "vehicle";
        else if (booking.driver) effectiveTargetType = "driver";
        else return res.status(400).json({ message: "Aucune ressource associée à cette commande." });
      }
      resolvedTargetId =
        effectiveTargetType === "vehicle"  ? booking.vehicle?._id :
        effectiveTargetType === "driver"   ? booking.driver?._id  :
        effectiveTargetType === "partner"  ? ownerId :
        /* platform */                        booking._id;
      if (!resolvedTargetId) {
        return res.status(400).json({ message: "Aucune ressource associée à cette commande." });
      }
    }

    const bookingField = BOOKING_REVIEW_FIELD[effectiveTargetType];
    if (booking[bookingField]) {
      return res.status(409).json({ message: "Vous avez déjà laissé un avis pour cette commande." });
    }

    const review = await Review.create({
      booking: bookingId,
      reviewer: req.user._id,
      targetType: effectiveTargetType,
      targetId: resolvedTargetId,
      note,
      commentaire,
      wentWell: effectiveTargetType === "platform" && typeof wentWell === "boolean" ? wentWell : null,
    });

    booking[bookingField] = review._id;
    await booking.save();

    // Notifier le destinataire pertinent (pas de notification pour "platform" —
    // signal interne VIT AUTO — ni pour "client" — signal de fiabilité interne
    // au partenaire, pour éviter tout jeu/représailles).
    if (effectiveTargetType === "vehicle" || effectiveTargetType === "driver") {
      if (ownerId) await notifyNewReview(ownerId, req.user.firstName, note, "Nouvel avis reçu ⭐", `${req.user.firstName} a laissé un avis ${note}/5 sur votre annonce.`);
    } else if (effectiveTargetType === "partner") {
      if (ownerId) await notifyNewReview(ownerId, req.user.firstName, note, "Nouvel avis sur votre agence ⭐", `${req.user.firstName} a laissé un avis ${note}/5 sur votre agence.`);
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

async function notifyNewReview(ownerId, _authorFirstName, _note, titre, message) {
  const reviewNotif = { type: "new_review", titre, message, lien: "/vendor/dashboard" };
  const reviewNotifDoc = await Notification.create({ user: ownerId, ...reviewNotif });
  if (global._io) {
    global._io.to(`user_${ownerId}`).emit("notification_new", {
      _id: reviewNotifDoc._id, ...reviewNotif, lu: false, createdAt: reviewNotifDoc.createdAt,
    });
  }
}

// ── Avis d'un véhicule ou chauffeur (public) ──────────────────────────────
export const getReviews = async (req, res) => {
  try {
    const { targetType, targetId } = req.query;
    if (!targetType || !targetId) {
      return res.status(400).json({ message: "targetType et targetId requis." });
    }
    // "platform" (avis VIT AUTO) et "client" (fiabilité) sont des signaux
    // internes, pas des vitrines publiques comme les avis véhicule/chauffeur/
    // agence — réservés à l'admin.
    if ((targetType === "platform" || targetType === "client") && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé." });
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

    // Annoter le nom de la cible pour l'affichage admin (véhicule/chauffeur/
    // partenaire/client — "platform" n'a pas d'entité à annoter, targetId y
    // pointe une réservation).
    const Vehicle = (await import("../models/Vehicle.js")).default;
    const Driver  = (await import("../models/Driver.js")).default;
    const User    = (await import("../models/User.js")).default;
    const vehicleIds = reviews.filter((r) => r.targetType === "vehicle").map((r) => r.targetId);
    const driverIds  = reviews.filter((r) => r.targetType === "driver").map((r) => r.targetId);
    const userIds    = reviews.filter((r) => r.targetType === "partner" || r.targetType === "client").map((r) => r.targetId);
    const [vehicles, drivers, users] = await Promise.all([
      vehicleIds.length ? Vehicle.find({ _id: { $in: vehicleIds } }).select("title").lean() : [],
      driverIds.length  ? Driver.find({ _id: { $in: driverIds } }).select("firstName lastName").lean() : [],
      userIds.length    ? User.find({ _id: { $in: userIds } }).select("firstName lastName").lean() : [],
    ]);
    const vehicleMap = Object.fromEntries(vehicles.map((v) => [String(v._id), v.title]));
    const driverMap  = Object.fromEntries(drivers.map((d) => [String(d._id), `${d.firstName} ${d.lastName}`]));
    const userMap    = Object.fromEntries(users.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`]));
    const annotated = reviews.map((r) => ({
      ...r,
      targetLabel:
        r.targetType === "vehicle" ? vehicleMap[String(r.targetId)] :
        r.targetType === "driver"  ? driverMap[String(r.targetId)]  :
        r.targetType === "partner" || r.targetType === "client" ? userMap[String(r.targetId)] :
        undefined,
    }));

    // Stats plateforme (avis VIT AUTO / transaction bien déroulée) — calculées
    // à la volée sur l'ensemble filtré, pas de doc singleton dédié.
    let platformStats;
    if (targetType === "platform") {
      const [agg] = await Review.aggregate([
        { $match: filter },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          avg:   { $avg: "$note" },
          wentWellCount: { $sum: { $cond: [{ $eq: ["$wentWell", true] }, 1, 0] } },
          wentWellAnswered: { $sum: { $cond: [{ $ne: ["$wentWell", null] }, 1, 0] } },
        } },
      ]);
      platformStats = agg ? {
        total: agg.total,
        noteMoyenne: Math.round(agg.avg * 10) / 10,
        wentWellRate: agg.wentWellAnswered ? Math.round((agg.wentWellCount / agg.wentWellAnswered) * 1000) / 10 : null,
      } : { total: 0, noteMoyenne: 0, wentWellRate: null };
    }

    res.json({ reviews: annotated, total, page: Number(page), pages: Math.ceil(total / safeLimit), ...(platformStats ? { platformStats } : {}) });
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
