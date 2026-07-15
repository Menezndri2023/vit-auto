import mongoose from "mongoose";

// Favoris — couvre les deux catalogues du site (véhicules location/vente et
// annonces Import/Export) via itemType, plutôt que deux modèles séparés.
const favoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  itemType: {
    type: String,
    enum: ["vehicle", "ie_listing"],
    required: true,
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

// Un utilisateur ne peut pas mettre deux fois le même item en favori.
favoriteSchema.index({ user: 1, itemType: 1, itemId: 1 }, { unique: true });
favoriteSchema.index({ user: 1, createdAt: -1 });

const Favorite = mongoose.models.Favorite || mongoose.model("Favorite", favoriteSchema);

export default Favorite;
