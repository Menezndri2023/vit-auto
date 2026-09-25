// ── Repli mondial des catalogues publics ───────────────────────────────────
// Règle de l'exploitant : chaque catalogue montre le contenu du PAYS du
// visiteur ; si son pays n'a rien, l'offre internationale ENTIÈRE plutôt qu'une
// page vide (incident du 2026-09-11 : un visiteur ivoirien voyait un site
// entièrement blanc, « aucune image » — le catalogue était simplement vide).
//
// `vehicleController.getVehicles` portait cette logique en propre depuis le
// 11/09 ; activités, chauffeurs et pièces ne l'avaient pas. Elle vit ici pour
// que les quatre catalogues répondent exactement de la même façon, et qu'un
// cinquième secteur n'ait pas à la redécouvrir.

/**
 * Joue `requete(filtre)` ; si le résultat est VIDE alors qu'une clause pays a
 * été posée, rejoue la même requête sans cette clause.
 *
 * Le repli est TOUT OU RIEN : on ne complète jamais un résultat local avec de
 * l'international, ce qui mêlerait dans une même page des annonces à côté de
 * chez le visiteur et des annonces à l'autre bout du monde, sans qu'il puisse
 * faire la différence.
 *
 * @param {object} filtre    filtre Mongo complet, clause pays comprise
 * @param {string|null} clePays  clé de PREMIER niveau qui porte la clause pays
 *                               (`"$or"` pour activités/chauffeurs, `"$and"`
 *                               pour les pièces dont le `$or` sert déjà à la
 *                               recherche) ; `null` si aucune clause pays n'a
 *                               été posée — le repli n'a alors pas lieu d'être.
 * @param {(filtre: object) => Promise<Array>} requete
 * @param {(doc: object) => boolean} estDuPays  une annonce compte-t-elle comme
 *   offre DU PAYS du visiteur ? La clause pays laisse aussi passer les annonces
 *   sans pays (`country: null`, créées avant que le champ existe) : elles
 *   doivent rester VISIBLES, mais elles n'appartiennent à aucun pays et ne
 *   prouvent donc rien sur l'offre locale. Sans ce prédicat, une seule d'entre
 *   elles — il s'en crée dès qu'un partenaire n'a pas de pays sur sa fiche —
 *   suffisait à annuler le repli : le visiteur ivoirien ne voyait QU'ELLE, au
 *   lieu de l'offre internationale entière.
 * @returns {Promise<{resultat: Array, repliMondial: boolean}>}
 */
// Combien d'annonces DU PAYS faut-il pour qu'un catalogue local ait un sens ?
//
// Zéro ne suffisait pas comme seuil. Constaté le 2026-09-25 : les deux annonces
// de démonstration Apple, seules annonces ivoiriennes, ont fait passer la Côte
// d'Ivoire pour un pays « pourvu » — le repli s'est éteint et les 403 autres
// annonces sont devenues invisibles depuis le marché principal. Un visiteur y
// voyait un catalogue de deux lignes.
//
// Trois est le premier nombre qui ressemble à un choix. En dessous, montrer le
// monde sert mieux le visiteur ET le partenaire local, qui reste visible dans
// la sélection internationale au lieu d'être noyé dans une page désolée.
export const SEUIL_CONTENU_PAYS = 3;

export async function avecRepliMondial(filtre, clePays, requete, estDuPays) {
  const resultat = await requete(filtre);
  const nLocal = estDuPays ? resultat.filter(estDuPays).length : resultat.length;
  const offreLocale = nLocal >= SEUIL_CONTENU_PAYS;
  if (offreLocale || !clePays || !(clePays in filtre)) {
    return { resultat, repliMondial: false };
  }

  // On retire la clause pays du filtre, et rien d'autre.
  const { [clePays]: _clausePays, ...filtreMondial } = filtre;
  const mondial = await requete(filtreMondial);
  return mondial.length
    ? { resultat: mondial, repliMondial: true }
    // Rien nulle part : on rend le résultat local (vide), pas un repli qui
    // n'apporte rien — l'interface doit dire « aucune annonce », pas « voici
    // l'international » devant une page vide.
    : { resultat, repliMondial: false };
}
