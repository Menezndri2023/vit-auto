// Détermine si une promotion véhicule est effectivement active MAINTENANT —
// utilisé à la fois pour l'affichage (badge catalogue) et pour le calcul
// serveur du prix de réservation (jamais confiance dans un prix déjà remisé
// envoyé par le client).
export function isPromotionActive(promotion) {
  if (!promotion?.active || !promotion.discountPercent) return false;
  const now = new Date();
  if (promotion.startDate && now < new Date(promotion.startDate)) return false;
  if (promotion.endDate && now > new Date(promotion.endDate)) return false;
  return true;
}

// Applique la remise active à un prix de base — renvoie le prix inchangé si
// aucune promotion active.
export function applyPromotion(basePrice, promotion) {
  if (!isPromotionActive(promotion)) return basePrice;
  const pct = Math.min(Math.max(Number(promotion.discountPercent) || 0, 0), 90);
  return Math.round(basePrice * (1 - pct / 100));
}
