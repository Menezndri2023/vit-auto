import mongoose from "mongoose";
import { LICENSE_CATEGORIES } from "../constants/licenseCategories.js";

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

  // ── Tarification (stockage toujours en USD — voir
  // server/scripts/migrate-vehicle-booking-to-usd.mjs pour la migration des
  // profils créés avant ce champ, implicitement en FCFA/XOF) ────────────────
  // Facultative : le chauffeur fixe librement ses tarifs, aucun n'est obligatoire
  // (contrairement à Vehicle.pricePerDay/priceForSale) — voir driverController.js.
  //
  // Devise D'AFFICHAGE choisie par le partenaire/admin pour CE profil — même
  // principe que Vehicle.currency (voir son commentaire pour l'explication
  // complète) : `null` = pas de préférence, chaque visiteur voit le tarif
  // converti dans SA PROPRE devise détectée ; une valeur explicite fige
  // l'affichage dans cette devise pour tous les visiteurs. Bug réel corrigé
  // (audit) : ce champ existait déjà mais restait à "USD" par défaut sans
  // jamais être lu nulle part — aucun moyen pour un chauffeur de choisir sa
  // devise d'affichage, contrairement aux véhicules. Voir migration
  // "driver-currency-reset-2026-08-04" (server.js) pour la remise à null des
  // profils déjà en base (l'ancien défaut "USD" n'était jamais un choix réel).
  currency: { type: String, default: null },

  tarif:            { type: Number }, // par jour
  tarifDemiJournee: { type: Number }, // demi-journée
  tarifHeure:       { type: Number }, // à l'heure — pertinent surtout avec véhicule (vehiculePersonnel)

  // Montant EXACT tel que tapé par le partenaire (dans `priceEntryCurrency`),
  // conservé à côté de tarif/tarifDemiJournee/tarifHeure (toujours en USD) —
  // même principe que Vehicle.pricePerDayEntered : sans ça, l'aller-retour de
  // conversion (saisie → USD arrondi → reconversion pour l'affichage) perd de
  // la précision (ex: 350 MAD saisis deviennent 349,99 MAD ré-affichés).
  tarifEntered:            { type: Number, default: null },
  tarifDemiJourneeEntered: { type: Number, default: null },
  tarifHeureEntered:       { type: Number, default: null },
  priceEntryCurrency:      { type: String, default: null },

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
  // Un chauffeur détient couramment plusieurs catégories à la fois (ex: B+D
  // pour VTC ET transport en commun) — tableau plutôt qu'une seule valeur.
  // Bug réel corrigé (audit) : le sélecteur ne proposait avant que 5 valeurs
  // ("B","C","D","E","B+C", "E" seul n'étant même pas une catégorie réelle),
  // ne couvrant ni la gamme complète (AM/A1/A2/A/B1/BE/C1/C1E/CE/D1/D1E/DE)
  // ni la possibilité d'en cumuler plusieurs. Voir constants/licenseCategories.js
  // pour la liste de référence (dupliquée côté src/) et
  // utils/runOnceMigration.js pour la conversion des anciennes valeurs texte
  // ("B", "B+C"...) déjà en base.
  permisCategorie: {
    type: [{ type: String, enum: LICENSE_CATEGORIES }],
    default: ["B"],
  },
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

  // ── Documents chauffeur (restructuration 2026-09) ──────────
  // Remplace l'ancien mur bloquant (missingDriverDocs exigeait un
  // User.identity/driverLicenseOcr déjà VÉRIFIÉ par un admin via /kyc avant
  // même de pouvoir créer le profil — allers-retours réels documentés dans
  // VendorSubmit.jsx). Le chauffeur joint désormais sa pièce d'identité et son
  // permis directement à LA CRÉATION de son profil (comme un client joint son
  // document à une réservation) : aucun OCR, aucune revue manuelle bloquante —
  // le profil part en modération standard (`status: "pending"`, voir plus
  // bas), l'admin voit ces documents au moment d'approuver la fiche publique.
  identityDocument: {
    type:       { type: String, enum: ["cni", "passport", "permis", "carte_sejour", null], default: null },
    frontImage: { type: String, default: null },
    backImage:  { type: String, default: null },
  },
  licenseDocument: {
    frontImage: { type: String, default: null },
    backImage:  { type: String, default: null },
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
