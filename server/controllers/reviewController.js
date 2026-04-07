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
    console.error("createReview:", err);
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
    console.error("getReviews:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Masquer un avis (admin) ───────────────────────────────────────────────
export const hideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { visible: false }, { new: true });
    if (!review) return res.status(404).json({ message: "Avis introuvable." });
    res.json({ review });
  } catch (err) {
    console.error("hideReview:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
