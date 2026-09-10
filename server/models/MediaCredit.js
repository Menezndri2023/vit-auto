import mongoose from "mongoose";

// ══════════════════════════════════════════════════════════════════════════════
// CRÉDIT D'UNE IMAGE RÉHÉBERGÉE
// ══════════════════════════════════════════════════════════════════════════════
// Plus de 370 annonces sont illustrées par des photos de référence issues de
// Wikimedia Commons, faute de photos réelles du partenaire. Tant qu'elles
// étaient appelées directement chez Wikimedia, la page du fichier — donc son
// auteur et sa licence — restait à un clic. En les rapatriant sur notre propre
// CDN, nous devenons l'hébergeur : l'attribution n'est plus portée par personne.
//
// 171 des 192 fichiers concernés sont sous licence CC BY ou CC BY-SA, qui
// EXIGENT le nom de l'auteur et la licence à côté de l'œuvre. Réhéberger sans
// créditer est une infraction plus nette que le lien direct qu'on cherchait à
// supprimer. Ce modèle porte le crédit, indexé par l'URL hébergée : n'importe
// quelle surface qui affiche une image peut retrouver à qui elle est due.
//
// Volontairement générique (pas rattaché à Vehicle) : une même photo sert
// plusieurs annonces — 206 URL pour 192 fichiers — et le crédit appartient au
// fichier, pas à l'annonce qui l'emploie.

const mediaCreditSchema = new mongoose.Schema({
  // URL telle qu'elle est stockée dans le document qui affiche l'image.
  // C'est la clé de recherche : on part de ce qu'on affiche.
  hostedUrl: { type: String, required: true, unique: true, index: true },

  // Provenance, conservée pour pouvoir remonter à la page du fichier d'origine
  // (obligation de « lien vers la source » de plusieurs licences CC).
  sourceUrl:  { type: String, default: null },
  sourceName: { type: String, default: "Wikimedia Commons" },
  filePage:   { type: String, default: null },

  author:      { type: String, default: null },
  licence:     { type: String, default: null },
  licenceUrl:  { type: String, default: null },

  // Faux uniquement pour le domaine public et CC0. Permet à l'affichage de
  // n'encombrer la page que lorsque le crédit est réellement dû.
  attributionRequired: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.MediaCredit || mongoose.model("MediaCredit", mediaCreditSchema);
