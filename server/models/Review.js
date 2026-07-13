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

// Recalcule noteMoyenne/nombreAvis d'un véhicule ou chauffeur à partir des avis
// visibles — factorisé pour être appelé à la fois à la création d'un avis
// (hook ci-dessous) et lors d'une modération admin (hideReview), qui ne
// déclenche pas ce hook puisqu'elle passe par findByIdAndUpdate.
reviewSchema.statics.recalcTargetStats = async function (targetType, targetId) {
  const Model = targetType === "vehicle"
    ? mongoose.model("Vehicle")
    : mongoose.model("Driver");

  const aggs = await this.aggregate([
    { $match: { targetType, targetId, visible: true } },
    { $group: { _id: null, avg: { $avg: "$note" }, count: { $sum: 1 } } },
  ]);

  await Model.findByIdAndUpdate(targetId, {
    noteMoyenne: aggs.length ? Math.round(aggs[0].avg * 10) / 10 : 0,
    nombreAvis:  aggs.length ? aggs[0].count : 0,
  });
};

// Après création d'un avis, mettre à jour noteMoyenne + nombreAvis
reviewSchema.post("save", async function () {
  await this.constructor.recalcTargetStats(this.targetType, this.targetId);
});

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
export default Review;
