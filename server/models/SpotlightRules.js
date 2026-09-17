import mongoose from "mongoose";

// ── Règles de mise en avant par pays (2026-09-17, demande de l'exploitant) ──
//
// Un seul document (« regles »). Chaque vitrine (carrousel, véhicules en
// vedette, activités & loisirs) ne montre que le contenu du PAYS du visiteur ;
// un partenaire y occupe au plus `maxParPartenaire` places dès que le pays
// compte `seuilPartenaires` partenaires actifs — en dessous, le plafond
// s'assouplit pour que la vitrine se remplisse quand même ; sans aucun
// partenaire dans le pays, la vitrine devient internationale. « Partenaires à
// la une » reste internationale pour tous (décision de l'exploitant).
//
// `parPays` surcharge les valeurs par défaut pour un pays donné (ISO-2).
const regleSchema = {
  maxParPartenaire: { type: Number, min: 1, max: 20, default: 2 },
  seuilPartenaires: { type: Number, min: 1, max: 1000, default: 5 },
};

const spotlightRulesSchema = new mongoose.Schema({
  _id:    { type: String, default: "regles" },
  defaut: regleSchema,
  parPays: [{
    _id: false,
    country: { type: String, uppercase: true, trim: true, required: true },
    ...regleSchema,
  }],
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

export default mongoose.models.SpotlightRules || mongoose.model("SpotlightRules", spotlightRulesSchema);
