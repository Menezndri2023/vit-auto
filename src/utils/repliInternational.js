// ── Repli international du catalogue ───────────────────────────────────────
// Règle de l'exploitant : chaque section du catalogue montre le contenu du PAYS
// du visiteur ; s'il n'y a rien dans son pays, elle montre l'offre
// internationale entière plutôt qu'une page vide (incident du 2026-09-11 : un
// visiteur ivoirien voyait un site entièrement blanc).
//
// Extrait de Catalogue.jsx le 2026-09-24 pour être testable : la règle était
// enfouie dans un `useMemo` de composant, et le défaut ci-dessous y est resté
// invisible jusqu'à ce qu'on la simule à la main contre les données réelles.

/**
 * Faut-il basculer cette section sur l'offre internationale ?
 *
 * Une annonce SANS pays n'appartient à aucun pays : elle ne prouve pas qu'il y
 * a de l'offre chez le visiteur, et ne doit donc pas empêcher le repli. Le
 * test précédent (`!x.country || x.country === pays`) en faisait le contraire :
 * une seule annonce sans pays — il s'en crée dès qu'un partenaire n'a pas de
 * pays sur sa fiche — suffisait à annuler le repli pour la section entière. Le
 * visiteur ne voyait plus QUE cette annonce-là, sans le bandeau qui explique
 * pourquoi.
 *
 * @param {Array<{country?: string|null}>} jeu  annonces chargées pour la section
 * @param {string|null} paysVisiteur            code pays ISO 2 lettres
 * @returns {boolean}
 */
export function repliInternational(jeu, paysVisiteur) {
  // Rien n'est encore chargé : se taire plutôt qu'annoncer un repli qui n'a pas
  // lieu d'être.
  if (!Array.isArray(jeu) || !jeu.length) return false;
  return !jeu.some((x) => x.country === paysVisiteur);
}

/**
 * Cette annonce est-elle visible pour ce visiteur ?
 *
 * En repli international, tout passe. Sinon, seules l'annonce du pays du
 * visiteur et celle qui n'a pas de pays (publiée avant que le champ existe —
 * jamais de régression de visibilité sur l'existant).
 *
 * @returns {boolean}
 */
export function annonceVisible(paysAnnonce, paysVisiteur, repli) {
  return !!repli || !paysAnnonce || paysAnnonce === paysVisiteur;
}
