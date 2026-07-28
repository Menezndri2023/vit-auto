// Sélectionne, parmi les règles de promotion d'un véhicule (Vehicle.promotions),
// celle qui minimise le prix final pour une réservation de `days` jours — un
// partenaire peut déclarer plusieurs paliers simultanés (ex. "-15% dès 3 jours"
// ET "-25% dès 7 jours") et seule la durée réellement réservée détermine
// lesquels sont éligibles. Utilisé à la fois pour l'affichage (badge
// catalogue) et pour le calcul serveur du prix de réservation (jamais
// confiance dans un prix déjà remisé envoyé par le client).
export function selectBestPromotionRule(promotions, days, baseTotal) {
  if (!Array.isArray(promotions) || promotions.length === 0) return null;
  const now = new Date();
  let best = null;
  let bestTotal = baseTotal;
  for (const rule of promotions) {
    if (!rule?.active) continue;
    if (rule.type !== "percent" && rule.type !== "fixed") continue;
    if (!(Number(rule.value) > 0)) continue;
    if ((rule.minDays || 1) > (days || 1)) continue;
    if (rule.startDate && now < new Date(rule.startDate)) continue;
    if (rule.endDate && now > new Date(rule.endDate)) continue;

    const total = rule.type === "percent"
      ? baseTotal * (1 - Math.min(Number(rule.value), 90) / 100)
      : Math.max(baseTotal - Number(rule.value), 0);

    if (total < bestTotal) {
      bestTotal = total;
      best = rule;
    }
  }
  return best;
}

// Calcule le prix/jour effectif d'une location de `days` jours à
// `pricePerDay` avant remise, en appliquant la meilleure règle éligible parmi
// `promotions`. Renvoie toujours un prix/jour (jamais un total) pour rester
// compatible avec les appelants existants (`effectivePricePerDay * days`) —
// une remise "montant fixe" est donc répartie uniformément sur chaque jour.
export function applyPromotion(pricePerDay, days, promotions) {
  const perDay   = Number(pricePerDay) || 0;
  const nbJours  = Math.max(Number(days) || 1, 1);
  const baseTotal = Math.round(perDay * nbJours * 100) / 100;

  const rule = selectBestPromotionRule(promotions, nbJours, baseTotal);
  if (!rule) return perDay;

  const discountedTotal = rule.type === "percent"
    ? baseTotal * (1 - Math.min(Number(rule.value), 90) / 100)
    : Math.max(baseTotal - Number(rule.value), 0);

  return Math.round((discountedTotal / nbJours) * 100) / 100;
}

// Une règle est "affichable maintenant" (fenêtre de dates valide, active)
// indépendamment de toute durée de location précise — utilisé pour le badge
// catalogue (aucune durée sélectionnée à ce stade) et le résumé partenaire.
export function isRuleCurrentlyDisplayable(rule) {
  if (!rule?.active || !(Number(rule.value) > 0)) return false;
  const now = new Date();
  if (rule.startDate && now < new Date(rule.startDate)) return false;
  if (rule.endDate && now > new Date(rule.endDate)) return false;
  return true;
}
