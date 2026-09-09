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

// Plafond du solde d'un client — miroir de MAX_LOYALTY_BALANCE_POINTS
// (server/constants/loyaltyTiers.js) : 10 000 points = 100 USD de récompense
// au total, écrêtés à l'attribution.
export const MAX_LOYALTY_BALANCE_POINTS = 10000;

// Part maximale d'une réservation payable en points — miroir de
// MAX_LOYALTY_DISCOUNT_RATE. Les 100 USD se déduisent donc en plusieurs fois,
// et le reliquat reste acquis pour les réservations suivantes.
export const MAX_LOYALTY_DISCOUNT_RATE = 0.2;

// Points réellement utilisables sur CETTE réservation : bornés par le solde du
// client ET par le plafond en pourcentage, exactement comme le serveur les
// recalcule (bookingController.createBooking). Sans cette borne côté client,
// l'aperçu annoncerait une remise que le serveur n'appliquerait pas.
export function maxRedeemablePoints(balance, baseTotalUSD) {
  const capUSD = (Number(baseTotalUSD) || 0) * MAX_LOYALTY_DISCOUNT_RATE;
  return Math.max(0, Math.min(Number(balance) || 0, Math.floor(capUSD * POINTS_PER_USD)));
}
