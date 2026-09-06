// Paliers du programme de fidélité — basés sur User.loyaltyLifetimePoints
// (cumul à vie, jamais décrémenté), jamais sur User.loyaltyPoints (solde
// dépensable) pour qu'une dépense de points ne fasse jamais rétrograder un
// client de palier. 1 point ≈ 1 USD dépensé (voir bookingController —
// awardLoyaltyPoints). Seuils ajustables sans redéploiement de logique
// métier : uniquement des constantes nommées, lues par le contrôleur.

export const LOYALTY_TIERS = [
  {
    key: "bronze",
    label: "Bronze",
    minLifetimePoints: 0,
    multiplier: 1,
    perks: ["Points sur chaque commande complétée"],
  },
  {
    key: "argent",
    label: "Argent",
    minLifetimePoints: 5000,
    multiplier: 1.25,
    perks: ["+25% de points sur chaque commande", "Support prioritaire"],
  },
  {
    key: "or",
    label: "Or",
    minLifetimePoints: 20000,
    multiplier: 1.5,
    perks: ["+50% de points sur chaque commande", "Support prioritaire", "Avantages exclusifs Founding"],
  },
];

// Dernier palier dont le seuil est atteint ou dépassé.
export function resolveTier(lifetimePoints) {
  const points = Number(lifetimePoints) || 0;
  let current = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) {
    if (points >= tier.minLifetimePoints) current = tier;
  }
  return current;
}

// Palier suivant (null si déjà au dernier palier) + points restants pour l'atteindre.
export function resolveNextTier(lifetimePoints) {
  const points = Number(lifetimePoints) || 0;
  const next = LOYALTY_TIERS.find((tier) => tier.minLifetimePoints > points);
  if (!next) return { nextTier: null, pointsToNextTier: 0 };
  return { nextTier: next, pointsToNextTier: next.minLifetimePoints - points };
}
