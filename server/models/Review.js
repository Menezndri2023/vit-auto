import mongoose from "mongoose";

/**
 * Avis laissé par un client après une commande complétée.
 * Peut concerner un véhicule ou un chauffeur.
 */
const reviewSchema = new mongoose.Schema({
  // ── Commande associée ─────────────────────────────────────
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },

  // ── Auteur de l'avis ──────────────────────────────────────
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Cible de l'avis ───────────────────────────────────────
  targetType: {
    type: String,
    enum: ["vehicle", "driver"],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Référence dynamique vers Vehicle ou Driver selon targetType
  },

  // ── Contenu ───────────────────────────────────────────────
  note:       { type: Number, required: true, min: 1, max: 5 },
  commentaire:{ type: String, trim: true, maxlength: 1000 },

  // ── Modération ────────────────────────────────────────────
  visible: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

// Un client ne peut laisser qu'un seul avis par commande
reviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ targetType: 1, targetId: 1 });

// Après création d'un avis, mettre à jour noteMoyenne + nombreAvis
reviewSchema.post("save", async function () {
  const { targetType, targetId } = this;
  const Model = targetType === "vehicle"
    ? mongoose.model("Vehicle")
    : mongoose.model("Driver");

  const aggs = await mongoose.model("Review").aggregate([
    { $match: { targetType, targetId, visible: true } },
    { $group: { _id: null, avg: { $avg: "$note" }, count: { $sum: 1 } } },
  ]);

  if (aggs.length > 0) {
    await Model.findByIdAndUpdate(targetId, {
      noteMoyenne: Math.round(aggs[0].avg * 10) / 10,
      nombreAvis: aggs[0].count,
    });
  }
});

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
export default Review;
