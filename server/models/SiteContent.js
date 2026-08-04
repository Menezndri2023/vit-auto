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
  // Sélection par défaut (visiteur sans correspondance pays ci-dessous, ou
  // pays dont l'admin n'a pas configuré de carrousel dédié).
  heroSpotlights: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" }],
  // Carrousels dédiés par pays — demande explicite : un visiteur au Maroc doit
  // pouvoir voir une sélection différente d'un visiteur en Côte d'Ivoire. Un
  // tableau de sous-documents (plutôt qu'une Map Mongoose) pour rester
  // populate-able simplement (`heroSpotlightsByCountry.vehicles`). Un pays
  // absent de ce tableau, ou présent avec `vehicles` vide, retombe sur
  // `heroSpotlights` ci-dessus (voir getHero/HeroSection.jsx).
  heroSpotlightsByCountry: [{
    _id:      false,
    country:  { type: String, uppercase: true, trim: true, required: true }, // ISO-2
    vehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" }],
  }],
  updatedAt:      { type: Date, default: Date.now },
  updatedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

export default mongoose.model("SiteContent", siteContentSchema);
