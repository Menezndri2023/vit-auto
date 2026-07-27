import mongoose from "mongoose";

// Contenu éditorial de la page d'accueil (hero) piloté par l'admin — bug réel
// corrigé (audit) : jusqu'ici stocké en localStorage côté navigateur admin
// uniquement, jamais transmis au backend ni même lu par HeroSection.jsx
// (titre/sous-titre hardcodés en JSX) — aucun visiteur réel ne voyait jamais
// les changements. Document singleton (un seul, toujours le même _id fixe).
const siteContentSchema = new mongoose.Schema({
  _id:            { type: String, default: "hero" },
  heroTitle:      { type: String, default: "" },
  heroSubtitle:   { type: String, default: "" },
  heroSpotlights: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" }],
  updatedAt:      { type: Date, default: Date.now },
  updatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

export default mongoose.model("SiteContent", siteContentSchema);
