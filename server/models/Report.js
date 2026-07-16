import mongoose from "mongoose";

// Signalement d'un contenu par un utilisateur — ajouté le 2026-07-16 pour
// remplacer le seul canal existant (contacter le support manuellement), voir
// la Politique de signalement (/politiques).
const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  targetType: {
    type: String,
    enum: ["vehicle", "ie_listing", "review", "driver", "user"],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  reason: {
    type: String,
    enum: ["fraude", "contenu_inapproprie", "annonce_fausse", "contenu_illicite", "harcelement", "autre"],
    required: true,
  },
  description: { type: String, trim: true, maxlength: 1000 },

  status: {
    type: String,
    enum: ["en_attente", "examine", "classe_sans_suite", "action_prise"],
    default: "en_attente",
  },
  reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewNote:  { type: String, default: null },
  reviewedAt:  { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });
// Un même utilisateur ne signale qu'une fois la même cible — évite le flood
// (ré-signaler après un premier signalement toujours en attente n'apporte rien).
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });

const Report = mongoose.models.Report || mongoose.model("Report", reportSchema);
export default Report;
