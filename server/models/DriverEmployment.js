import mongoose from "mongoose";

// Demande d'embauche à temps plein (CDD/CDI) d'un chauffeur — distinct d'une
// simple mission ponctuelle (Booking type "chauffeur") : ici le client
// ("l'employeur") propose un contrat de travail durable au chauffeur, que le
// partenaire propriétaire du profil (voir Driver.owner) accepte ou refuse.
// Ne gère aucune paie/RH réelle (hors périmètre d'une marketplace) — capture
// la demande, les conditions proposées et la décision, comme point de départ
// d'une relation contractuelle négociée ensuite hors plateforme.
const driverEmploymentSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    required: true,
    index: true,
  },

  // Employeur (client) — l'embauche à temps plein exige un compte (contrairement
  // à une mission ponctuelle qui accepte un client non connecté).
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  employerInfo: {
    firstName: { type: String, trim: true },
    lastName:  { type: String, trim: true },
    email:     { type: String, trim: true },
    phone:     { type: String, trim: true },
  },

  contractType: {
    type: String,
    enum: ["cdd", "cdi"],
    required: true,
  },
  startDate: { type: Date, required: true },
  // Requis pour un CDD (durée déterminée), toujours null pour un CDI.
  endDate:   { type: Date, default: null },

  proposedSalary: { type: Number, required: true, min: 1 },
  currency:       { type: String, default: "USD" },
  workSchedule:   { type: String, trim: true, default: null }, // ex: "Temps plein, 6j/7, 8h-18h"
  missionDescription: { type: String, trim: true, maxlength: 2000 },

  location: {
    country: { type: String, uppercase: true, trim: true, default: null },
    ville:   { type: String, trim: true, default: null },
  },

  status: {
    type: String,
    enum: ["pending", "accepted", "declined", "cancelled"],
    default: "pending",
  },
  declineReason: { type: String, default: null },
  respondedAt:   { type: Date, default: null },

  // ── Traitement admin : formalisation du contrat ─────────────────────────
  // Distinct de la décision accepter/refuser du partenaire (ci-dessus) — un
  // admin peut, une fois la demande acceptée, personnaliser les clauses du
  // contrat généré (sinon le texte légal par défaut s'applique, voir
  // pdfGenerator.DEFAULT_EMPLOYMENT_CONDITIONS) puis le transmettre au
  // partenaire. Voir driverEmploymentController.processEmploymentRequest.
  contractConditions: { type: String, default: null },
  processedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  processedAt:    { type: Date, default: null },
  contractSentAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

driverEmploymentSchema.index({ driver: 1, status: 1 });
driverEmploymentSchema.index({ employer: 1, createdAt: -1 });

driverEmploymentSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const DriverEmployment =
  mongoose.models.DriverEmployment ||
  mongoose.model("DriverEmployment", driverEmploymentSchema);

export default DriverEmployment;
