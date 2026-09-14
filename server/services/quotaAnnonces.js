// ── Quota d'annonces actives par secteur, selon le plan ────────────────────
//
// Point de passage unique pour « ce partenaire peut-il publier UNE annonce de
// plus dans ce secteur ». Trois exemptions, dans cet ordre : l'immunité de
// lancement (date), le statut Partenaire Fondateur en cours (douze mois depuis
// la signature), un plan sans limite. Sinon on compte les annonces ACTIVES du
// secteur et on compare au quota du plan effectif.
//
// Ne dépublie jamais : un partenaire au-dessus du quota (annonces importées
// avant la règle, ou plan rétrogradé) garde tout ; il ne peut simplement plus
// en ajouter tant qu'il n'en archive pas ou ne change pas de plan.
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import Activity from "../models/Activity.js";
import Driver from "../models/Driver.js";
import { planEffectif } from "./planAccess.js";
import { fondateurActif } from "./fondateur.js";
import { FIN_IMMUNITE_QUOTAS, quotaAnnoncesDuPlan } from "../constants/planFeatures.js";
import { SECTEUR_LABELS } from "../constants/partnerTaxonomy.js";

const STATUTS_ACTIFS = ["pending", "approved"];

// Compteurs fournis par d'autres modules, pour les secteurs dont le modèle ne
// vit pas ici (pièces détachées : models/SparePart.js). Le module du secteur
// appelle `enregistrerCompteur("pieces", (ownerId) => …)` à son chargement ;
// tant qu'il ne l'a pas fait, ce secteur compte zéro annonce — donc jamais de
// refus de quota par erreur, seulement un quota non appliqué.
const compteurs = new Map();
export function enregistrerCompteur(secteur, compter) {
  compteurs.set(secteur, compter);
}

// Une annonce « compte » quand elle occupe ou va occuper le catalogue.
export async function annoncesActives(ownerId, secteur) {
  if (compteurs.has(secteur)) return compteurs.get(secteur)(ownerId, STATUTS_ACTIFS);
  switch (secteur) {
    case "loueur":
    case "vendeur":
      return Vehicle.countDocuments({ owner: ownerId, type: secteur === "loueur" ? "location" : "vente", status: { $in: STATUTS_ACTIFS } });
    case "exportateur":
      return ImportExportListing.countDocuments({ partner: ownerId, status: { $in: STATUTS_ACTIFS } });
    case "loisirs":
      return Activity.countDocuments({ owner: ownerId, status: { $in: STATUTS_ACTIFS } });
    case "chauffeur":
      return Driver.countDocuments({ owner: ownerId, status: { $in: STATUTS_ACTIFS } });
    default:
      return 0;
  }
}

export { fondateurActif };

export async function refusDeQuota(user, secteur, now = new Date()) {
  if (!user || user.role === "admin") return null;
  if (now < FIN_IMMUNITE_QUOTAS) return null;
  // Un membre d'équipe publie pour le compte du titulaire : c'est le plan et
  // le quota du titulaire qui comptent (même règle que exigeFonctionnalite).
  const proprietaire = user.teamOf || user._id;
  if (await fondateurActif(proprietaire, now)) return null;
  const plan  = await planEffectif(proprietaire);
  const quota = quotaAnnoncesDuPlan(plan);
  if (quota === null) return null;
  const actives = await annoncesActives(proprietaire, secteur);
  if (actives < quota) return null;
  return {
    code:    "QUOTA_ANNONCES",
    secteur,
    quota,
    plan,
    message: `Votre plan permet ${quota} annonce${quota > 1 ? "s" : ""} active${quota > 1 ? "s" : ""} dans le secteur ${SECTEUR_LABELS[secteur] || secteur}. Archivez une annonce ou passez à un plan supérieur depuis la page Tarifs.`,
  };
}
