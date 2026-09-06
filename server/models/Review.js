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
  // vehicle/driver : le client note la ressource louée (historique).
  // partner : le client note l'agence (targetId = owner du véhicule/chauffeur).
  // platform : le client note son expérience VIT AUTO (targetId = booking._id,
  //   pas d'entité dédiée à cibler).
  // client : le partenaire note le client (targetId = booking.client).
  targetType: {
    type: String,
    enum: ["vehicle", "driver", "partner", "platform", "client"],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Référence dynamique selon targetType (Vehicle/Driver/User/Booking)
  },

  // ── Contenu ───────────────────────────────────────────────
  note:       { type: Number, required: true, min: 1, max: 5 },
  commentaire:{ type: String, trim: true, maxlength: 1000 },
  // Uniquement pour targetType "platform" — réponse explicite à "la
  // transaction s'est-elle bien déroulée ?", distincte de la note en étoiles.
  wentWell:   { type: Boolean, default: null },

  // ── Modération ────────────────────────────────────────────
  visible: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

// Un auteur peut laisser un avis par commande ET par cible (véhicule/chauffeur
// + agence + plateforme pour le client ; client pour le partenaire) — mais
// jamais deux fois la même cible sur la même commande.
reviewSchema.index({ booking: 1, reviewer: 1, targetType: 1 }, { unique: true });
reviewSchema.index({ targetType: 1, targetId: 1 });

// Recalcule noteMoyenne/nombreAvis d'un véhicule ou chauffeur à partir des avis
// visibles — factorisé pour être appelé à la fois à la création d'un avis
// (hook ci-dessous) et lors d'une modération admin (hideReview), qui ne
// déclenche pas ce hook puisqu'elle passe par findByIdAndUpdate.
reviewSchema.statics.recalcTargetStats = async function (targetType, targetId) {
  // "platform" n'a pas d'entité propre à mettre à jour — ses stats se
  // consultent via reviewController.adminListReviews (agrégation à la volée).
  if (targetType === "platform") return;

  const Model =
    targetType === "vehicle" ? mongoose.model("Vehicle") :
    targetType === "driver"  ? mongoose.model("Driver")  :
    mongoose.model("User"); // "partner" et "client" ciblent tous deux un User

  const aggs = await this.aggregate([
    { $match: { targetType, targetId, visible: true } },
    { $group: { _id: null, avg: { $avg: "$note" }, count: { $sum: 1 } } },
  ]);

  const noteMoyenne = aggs.length ? Math.round(aggs[0].avg * 10) / 10 : 0;
  const nombreAvis  = aggs.length ? aggs[0].count : 0;

  if (targetType === "partner") {
    await Model.findByIdAndUpdate(targetId, { partnerRating: { noteMoyenne, nombreAvis } });
  } else if (targetType === "client") {
    await Model.findByIdAndUpdate(targetId, { clientReliability: { noteMoyenne, nombreAvis } });
  } else {
    await Model.findByIdAndUpdate(targetId, { noteMoyenne, nombreAvis });
  }
};

// Après création d'un avis, mettre à jour noteMoyenne + nombreAvis
reviewSchema.post("save", async function () {
  await this.constructor.recalcTargetStats(this.targetType, this.targetId);
});

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
export default Review;
