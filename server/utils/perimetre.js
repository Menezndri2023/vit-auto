// ── Périmètre d'un partenaire : ce qu'il a le droit de publier ─────────────
//
// Jusqu'ici l'activité choisie à l'inscription n'était relue nulle part : un
// centre de plongée pouvait publier une voiture, un chauffeur une annonce
// d'export. Le dashboard masque désormais les modules hors secteur
// (estUniquementLoisirs & co.), et ce module en est le pendant serveur — le
// masquage côté interface ne protège rien, une requête directe passait.
//
// Même forme que refusDePublication (publishingGate.js) : `null` quand c'est
// permis, sinon `{ code, message }` prêt à renvoyer.
import { secteursDuPartenaire, SECTEUR_LABELS } from "../constants/partnerTaxonomy.js";

export function refusDePerimetre(user, secteur, action = "publier cette annonce") {
  if (!user || user.role === "admin") return null;
  const secteurs = secteursDuPartenaire(user);
  // Compte historique sans secteur déclaré : rien n'est refusé (voir
  // secteursDuPartenaire) — les comptes créés avant la taxonomie continuent
  // de fonctionner ; ils déclarent leur secteur à la première demande d'ajout.
  if (secteurs.length === 0) return null;
  if (secteurs.includes(secteur)) return null;
  return {
    code:    "SECTEUR_REQUIS",
    secteur,
    message: `Votre compte partenaire ne couvre pas le secteur ${SECTEUR_LABELS[secteur] || secteur}. Demandez son ajout depuis votre espace partenaire pour ${action}.`,
  };
}
