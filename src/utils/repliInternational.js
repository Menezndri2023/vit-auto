// ── Repli international du catalogue ───────────────────────────────────────
// Règle de l'exploitant : chaque section du catalogue montre le contenu du PAYS
// du visiteur ; s'il n'y a rien dans son pays, elle montre l'offre
// internationale entière plutôt qu'une page vide (incident du 2026-09-11 : un
// visiteur ivoirien voyait un site entièrement blanc).
//
// Extrait de Catalogue.jsx le 2026-09-24 pour être testable : la règle était
// enfouie dans un `useMemo` de composant, et le défaut ci-dessous y est resté
// invisible jusqu'à ce qu'on la simule à la main contre les données réelles.

// ⚠️ Règle remplacée le 2026-10-09 (exploitant) : un visiteur ne voit QUE les
// offres de son pays, sauf s'il choisit un autre pays (ou « International »)
// avec le filtre. Plus aucun repli automatique : un pays sans offre affiche
// l'état vide du catalogue, qui dit « aucune annonce en <pays> » et propose
// le bouton « voir l'international » — la page n'est jamais blanche
// (l'incident du 2026-09-11 venait d'un catalogue vide SANS explication).

/** Plus de bascule automatique sur l'international. */
export function repliInternational() {
  return false;
}

/**
 * Cette annonce est-elle visible pour ce visiteur ? Seulement si elle est de
 * son pays — une annonce sans pays n'appartient à aucun et n'apparaît qu'en
 * vue « International ».
 *
 * @returns {boolean}
 */
export function annonceVisible(paysAnnonce, paysVisiteur, repli) {
  return !!repli || (!!paysAnnonce && paysAnnonce === paysVisiteur);
}
