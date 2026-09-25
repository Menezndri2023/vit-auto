import translations from "./translations";

/**
 * Libellé d'un code métier (type d'activité, catégorie de pièce…) dans la
 * langue courante, avec repli sur la table française d'origine.
 *
 * Ces tables (ACTIVITY_TYPE_LABELS, PART_CATEGORY_LABELS) sont utilisées
 * partout, y compris dans des écrans internes qui n'ont pas besoin d'être
 * traduits. Plutôt que de les dupliquer en cinq langues à la source, on les
 * laisse en place et on traduit À L'AFFICHAGE, là où la page est publique.
 *
 * Le repli est silencieux et volontaire : un code ajouté demain s'affichera en
 * français plutôt que de faire apparaître « activity.KITESURF » à l'écran.
 */
export function libelleTraduit(t, prefixe, code, tableFr = {}) {
  if (!code) return "";
  const cle = `${prefixe}.${code}`;
  return translations[cle] ? t(cle) : (tableFr[code] || code);
}
