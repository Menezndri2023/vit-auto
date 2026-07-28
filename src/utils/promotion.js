// Mirroir client de server/utils/promotion.js — affichage uniquement, le
// serveur reste seul autoritaire pour le prix réellement facturé
// (bookingController.createBooking recalcule tout depuis Vehicle.promotions).

// Règle la plus avantageuse parmi `promotions` pour une location de `days`
// jours à `baseTotal` (prix total avant remise). `null` si aucune règle
// éligible (durée insuffisante, hors fenêtre de dates, inactive...).
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

// Prix/jour effectif affiché pour une location de `days` jours.
export function effectivePricePerDay(pricePerDay, days, promotions) {
  const perDay  = Number(pricePerDay) || 0;
  const nbJours = Math.max(Number(days) || 1, 1);
  const baseTotal = perDay * nbJours;
  const rule = selectBestPromotionRule(promotions, nbJours, baseTotal);
  if (!rule) return perDay;
  const discountedTotal = rule.type === "percent"
    ? baseTotal * (1 - Math.min(Number(rule.value), 90) / 100)
    : Math.max(baseTotal - Number(rule.value), 0);
  return discountedTotal / nbJours;
}

// Règle "active maintenant" (fenêtre de dates valide) indépendamment de toute
// durée précise — pour le badge catalogue (aucune durée sélectionnée) : on
// retient celle avec le `minDays` le plus bas (la plus facilement atteignable).
export function getDisplayRule(promotions) {
  if (!Array.isArray(promotions) || promotions.length === 0) return null;
  const now = new Date();
  const valid = promotions.filter((r) => {
    if (!r?.active || !(Number(r.value) > 0)) return false;
    if (r.startDate && now < new Date(r.startDate)) return false;
    if (r.endDate && now > new Date(r.endDate)) return false;
    return true;
  });
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => ((a.minDays || 1) <= (b.minDays || 1) ? a : b));
}

// Libellé court pour un badge ("-25% dès 5j", "-5000 dès 3j").
export function formatRuleBadge(rule, fmtAmount) {
  if (!rule) return "";
  const discount = rule.type === "percent" ? `-${rule.value}%` : `-${fmtAmount ? fmtAmount(rule.value) : rule.value}`;
  const suffix = rule.minDays > 1 ? ` dès ${rule.minDays}j` : "";
  return `${discount}${suffix}${rule.label ? ` ${rule.label}` : ""}`;
}
