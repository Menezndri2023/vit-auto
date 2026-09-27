// ── Statut d'une échéance de mise à disposition — miroir du serveur ─────────
//
// La règle fait autorité dans `server/services/miseADisposition.js`
// (`statutEcheance`). Ce fichier en est le MIROIR d'affichage, sur le même
// principe que `src/constants/planFeatures.js` face à la matrice serveur : il
// n'autorise rien, il affiche.
//
// ⚠️ Pourquoi un miroir plutôt qu'un recalcul sur place : les deux tableaux de
// bord (partenaire et client) affichent le même échéancier. Écrire la
// comparaison de dates dans chacun faisait DEUX implémentations — et la
// première divergence était déjà là : ni l'une ni l'autre ne traitait la
// commande annulée, donc un contrat annulé affichait encore « à régler » sur
// des mois qui ne sont plus dus.

/** Statuts de commande qui éteignent ce qui restait dû (miroir de ANNULES). */
const COMMANDES_ANNULEES = new Set(["cancelled", "transaction_not_concluded", "client_absent"]);

/**
 * « reglee » | « annulee » | « due » | « a_venir »
 *
 * Seul le RÈGLEMENT est un fait stocké ; le reste se déduit, exactement comme
 * côté serveur — sinon il faudrait un planificateur pour faire basculer les
 * statuts chaque nuit, et penser à éteindre les échéances à venir à chaque
 * annulation.
 */
export function statutEcheance(echeance, statutCommande, maintenant = new Date()) {
  if (echeance?.regleeLe) return "reglee";
  if (COMMANDES_ANNULEES.has(statutCommande)) return "annulee";
  return new Date(echeance?.dateEcheance) <= maintenant ? "due" : "a_venir";
}

export const LIBELLE_ECHEANCE = {
  reglee:  "✓ réglée",
  annulee: "annulée",
  due:     "à régler",
  a_venir: "à venir",
};

export const COULEUR_ECHEANCE = {
  reglee:  "#059669",
  annulee: "#94a3b8",
  due:     "#b45309",
  a_venir: "#6d7a95",
};

/** Ce qu'il reste à encaisser — hors échéances annulées. */
export function resteAEncaisser(echeances = [], statutCommande, maintenant = new Date()) {
  const total = echeances
    .filter((e) => ["due", "a_venir"].includes(statutEcheance(e, statutCommande, maintenant)))
    .reduce((s, e) => s + (Number(e.montantUSD) || 0), 0);
  return Math.round(total * 100) / 100;
}
