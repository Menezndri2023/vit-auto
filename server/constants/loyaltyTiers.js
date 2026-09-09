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

// ── Valeur monétaire des points ─────────────────────────────────────────────
// Taux de conversion unique : 100 points = 1 USD de remise sur la réservation
// suivante (voir bookingController.createBooking, pointsToRedeem — la remise
// reste par ailleurs plafonnée à 20% du montant de base). Ce nombre était
// jusqu'ici écrit en dur à quatre endroits (deux fois dans bookingController,
// le texte de la notification, et l'affichage de la page fidélité) : le
// modifier en aurait laissé au moins un en arrière, et le client aurait vu
// une valeur de points différente de celle réellement déduite au paiement.
//
// Le pivot est l'USD, comme tout le reste de la tarification : la conversion
// vers la devise du client est faite à l'affichage (fmtUSD, CurrencyContext),
// jamais au stockage — un solde de points ne vaut pas un montant figé dans
// une devise, il vaut ce que le taux du jour en donne.
export const POINTS_PER_USD = 100;

// Valeur en USD d'un solde de points, arrondie au centime.
export function pointsToUSD(points) {
  const p = Number(points) || 0;
  return Math.round((p / POINTS_PER_USD) * 100) / 100;
}
