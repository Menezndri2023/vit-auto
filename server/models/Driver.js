import mongoose from "mongoose";

const driverSchema = new mongoose.Schema({
  // ── Propriétaire du profil (partenaire) ───────────────────
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // ── Identité du chauffeur ─────────────────────────────────
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  phone:       { type: String, trim: true },
  profilePhoto:{ type: String, default: null },
  // CV obligatoire à la publication (PDF ou image, voir driverController.js) —
  // consultable par l'employeur potentiel avant une proposition d'embauche
  // CDD/CDI (voir DriverEmployment.js), distinct des documents KYC (identité/
  // permis) qui restent, eux, privés côté User.
  cv:          { type: String, default: null },

  // ── Titre de l'annonce ────────────────────────────────────
  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },

  // ── Tarification (USD — voir server/scripts/migrate-vehicle-booking-to-usd.mjs
  // pour la migration des profils créés avant ce champ, implicitement en FCFA/XOF) ──
  // Facultative : le chauffeur fixe librement ses tarifs, aucun n'est obligatoire
  // (contrairement à Vehicle.pricePerDay/priceForSale) — voir driverController.js.
  currency:         { type: String, default: "USD" },
  tarif:            { type: Number }, // par jour
  tarifDemiJournee: { type: Number }, // demi-journée
  tarifHeure:       { type: Number }, // à l'heure — pertinent surtout avec véhicule (vehiculePersonnel)

  // ── Disponibilité & zone ──────────────────────────────────
  disponibilite: {
    type: String,
    enum: ["Temps plein", "Weekends", "Soirées", "Sur demande", "En semaine"],
    required: true,
  },
  zone:        { type: String, required: true, trim: true },
  ville:       { type: String, trim: true },
  // Hérité du pays du partenaire propriétaire (jamais depuis le body) — même
  // usage que Vehicle.country pour le filtrage international du catalogue.
  country:     { type: String, uppercase: true, trim: true, default: null },

  // ── Entreprise du partenaire (facultatif) — même principe que Vehicle.business :
  // simple étiquette d'organisation, jamais source de vérité de ville/pays.
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PartnerBusiness",
    default: null,
  },

  // ── Expérience & compétences ──────────────────────────────
  experience:     { type: String, required: true }, // ex: "5 ans"
  langues:        { type: [String], default: ["Français"] },
  permisCategorie:{ type: String, default: "B" },   // B, C, D...
  // Avec véhicule (true) : le chauffeur propose aussi son propre véhicule —
  // exige alors des photos du véhicule (`images`) en plus de `profilePhoto`.
  // Sans véhicule (false) : seule `profilePhoto` est exigée, `images` reste vide
  // (rien à photographier — le chauffeur conduit le véhicule du client).
  vehiculePersonnel: { type: Boolean, default: false },
  typeVehicule:   { type: String },                  // si véhicule perso

  // ── Médias ────────────────────────────────────────────────
  // Photos du véhicule uniquement si vehiculePersonnel=true (voir driverController.js
  // pour la validation). profilePhoto (photo du conducteur) est distincte et toujours
  // exigée, que le chauffeur ait un véhicule ou non.
  images: { type: [String], default: [] },

  // ── Statistiques ──────────────────────────────────────────
  noteMoyenne:  { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis:   { type: Number, default: 0 },
  missionsTotal:{ type: Number, default: 0 },

  // ── Congés / indisponibilité bloquée manuellement ─────────────────────────
  // `disponibilite` (ci-dessus) est un simple libellé fixé une fois à la
  // création ("Temps plein"/"Weekends"...) — le partenaire n'avait jusqu'ici
  // aucun moyen de bloquer proactivement des dates précises (congés, arrêt
  // maladie) : seul l'historique des réservations existantes était visible
  // (calendrier en lecture seule). Manque réel trouvé en audit.
  blackoutDates: {
    type: [{
      start:  { type: Date, required: true },
      end:    { type: Date, required: true },
      reason: { type: String, default: "" },
    }],
    default: [],
  },

  // ── Modération ────────────────────────────────────────────
  // "archived" : profil retiré du catalogue public sans le supprimer — utilisé
  // quand le compte propriétaire est supprimé par un admin (voir
  // usersController.deleteUser), pour ne jamais laisser un profil chauffeur
  // "fantôme" (owner inexistant) visible publiquement. Distinct de "rejected"
  // (refus qualité/vétting), qui reste un jugement sur le profil lui-même.
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "archived"],
    default: "pending",
  },
  rejectionReason: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

driverSchema.index({ owner: 1 });
driverSchema.index({ status: 1 });
driverSchema.index({ zone: 1 });
driverSchema.index({ country: 1 });
// Couvre le filtre + tri du catalogue public (status:"approved", pays précis,
// trié par récence) — même logique que Vehicle.
driverSchema.index({ status: 1, country: 1, createdAt: -1 });

driverSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Driver = mongoose.models.Driver || mongoose.model("Driver", driverSchema);
export default Driver;
