// Valeur monétaire des points de fidélité — dupliqué à l'identique dans
// server/constants/loyaltyTiers.js (pas de dossier partagé entre server/ et
// src/ dans ce dépôt — même convention que src/constants/partnerTaxonomy.js).
//
// 100 points = 1 USD de remise sur la réservation suivante. Le montant obtenu
// est TOUJOURS en USD : c'est le pivot de toute la tarification du site. La
// conversion vers la devise réellement affichée au client se fait ensuite avec
// fmtUSD() (CurrencyContext), qui applique le taux du jour — un solde de points
// n'est jamais figé dans une devise locale.
export const POINTS_PER_USD = 100;

export function pointsToUSD(points) {
  const p = Number(points) || 0;
  return Math.round((p / POINTS_PER_USD) * 100) / 100;
}

// Nombre maximum de points réellement utilisables sur une réservation : limité
// par le solde du client ET par le plafond de remise (20% du montant de base),
// exactement comme le serveur le recalcule (bookingController.createBooking).
// Sans ce plafond côté client, l'aperçu annonçait une remise que le serveur
// refusait ensuite d'appliquer en totalité.
export const MAX_LOYALTY_DISCOUNT_RATE = 0.2;

export function maxRedeemablePoints(balance, baseTotalUSD) {
  const capUSD = (Number(baseTotalUSD) || 0) * MAX_LOYALTY_DISCOUNT_RATE;
  return Math.max(0, Math.min(Number(balance) || 0, Math.floor(capUSD * POINTS_PER_USD)));
}
