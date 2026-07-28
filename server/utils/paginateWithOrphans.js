// Combine une requête principale paginée avec une liste "orphelins" (comptes
// partenaire sans aucun dossier) ajoutée en fin de liste virtuelle.
//
// Sans ça (bug réel trouvé en audit, présent dans 3 controllers admin —
// Founding Partner, Certification, Vérification), les orphelins étaient
// TOUJOURS chargés en entier et recopiés sur CHAQUE page demandée : la page 2
// réaffichait les mêmes orphelins que la page 1 au lieu des dossiers réels
// suivants, et `total` — bien que numériquement correct — ne reflétait pas
// une pagination cohérente (skip/limit ignoraient totalement les orphelins).
//
// primaryTotal/orphanTotal : comptes déjà connus (countDocuments), passés en
// entrée pour éviter de les recalculer ici. fetchPrimaryPage/fetchOrphanPage :
// fournisseurs paresseux (skip, limit) => Promise<rows>, appelés seulement si
// la page demandée en a réellement besoin (jamais les deux à limit plein).
export async function combinePaginated({ page, limit, primaryTotal, fetchPrimaryPage, orphanTotal = 0, fetchOrphanPage }) {
  const numPage  = Number(page)  || 1;
  const numLimit = Number(limit) || 20;
  const skip  = (numPage - 1) * numLimit;
  const total = primaryTotal + orphanTotal;

  if (skip >= total) return { items: [], total };

  const primaryItems = skip < primaryTotal
    ? await fetchPrimaryPage(skip, numLimit)
    : [];

  const remaining = numLimit - primaryItems.length;
  const orphanItems = remaining > 0 && orphanTotal > 0
    ? await fetchOrphanPage(Math.max(skip - primaryTotal, 0), remaining)
    : [];

  return { items: [...primaryItems, ...orphanItems], total };
}
