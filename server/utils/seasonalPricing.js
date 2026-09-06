// Tarification saisonnière (Vehicle.seasonalRates) — périodes récurrentes
// chaque année (mois/jour) où un prix/jour de remplacement s'applique (ex.
// "haute saison" du 15/06 au 05/09). Distinct de server/utils/promotion.js
// (toujours une REMISE) : ici c'est un prix de remplacement complet, calculé
// jour par jour sur la durée réservée pour gérer correctement un séjour à
// cheval entre deux saisons.
import { selectBestPromotionRule } from "./promotion.js";

// Une règle est "en cours" pour `date` si le jour/mois de `date` tombe dans
// [début, fin] — comparaison par clé mois*100+jour, sans tenir compte de
// l'année. Gère le cas où la période traverse le nouvel an (ex. 01/12 →
// 28/02 : `start > end` numériquement, on teste alors "après le début OU
// avant la fin" au lieu de "entre les deux").
function isDateInSeasonalRange(date, rule) {
  const key   = (date.getMonth() + 1) * 100 + date.getDate();
  const start = rule.startMonth * 100 + rule.startDay;
  const end   = rule.endMonth   * 100 + rule.endDay;
  if (start <= end) return key >= start && key <= end;
  return key >= start || key <= end;
}

// Prix/jour applicable à `date` : le tarif de base, sauf si une règle
// saisonnière active couvre cette date. Si plusieurs règles actives se
// chevauchent le même jour, on retient la plus chère — jamais un tarif
// ambigu plus bas qu'une des règles que le partenaire a explicitement
// configurées pour cette période.
export function getSeasonalPriceForDate(pricePerDay, seasonalRates, date) {
  const base = Number(pricePerDay) || 0;
  if (!Array.isArray(seasonalRates) || seasonalRates.length === 0) return base;
  const active = seasonalRates.filter((r) => r?.active && isDateInSeasonalRange(date, r));
  if (active.length === 0) return base;
  return Math.max(...active.map((r) => Number(r.pricePerDay) || 0));
}

// Total (avant promotion) d'une location de `days` jours démarrant à
// `startDate`, en sommant le tarif applicable à chaque jour (haute saison ou
// tarif de base selon la date). Sans `startDate` ou sans règle configurée,
// retombe sur le calcul plat pricePerDay × days.
export function computeSeasonalTotal(pricePerDay, seasonalRates, startDate, days) {
  const perDay  = Number(pricePerDay) || 0;
  const nbJours = Math.max(Number(days) || 1, 1);
  if (!startDate || !Array.isArray(seasonalRates) || seasonalRates.length === 0) {
    return Math.round(perDay * nbJours * 100) / 100;
  }
  let total = 0;
  const cursor = new Date(startDate);
  for (let i = 0; i < nbJours; i++) {
    total += getSeasonalPriceForDate(perDay, seasonalRates, cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(total * 100) / 100;
}

// Montant total d'une location (Booking.montantBase), tarification
// saisonnière puis promotion appliquées dans cet ordre. Tant qu'aucune règle
// saisonnière n'est configurée sur le véhicule (l'immense majorité du parc,
// hérité d'avant cette fonctionnalité), le résultat est BYTE-POUR-BYTE
// identique à l'ancien calcul (applyPromotion(pricePerDay, days, promotions)
// * days, sans arrondi supplémentaire) — jamais de changement de comportement
// pour un véhicule qui n'utilise pas la fonctionnalité.
export function computeLocationTotal(vehicle, startDate, days) {
  const nbJours = Math.max(Number(days) || 1, 1);
  if (!Array.isArray(vehicle?.seasonalRates) || vehicle.seasonalRates.length === 0 || !startDate) {
    // Import différé pour éviter une dépendance circulaire avec promotion.js
    // au chargement du module (les deux fichiers s'importent mutuellement).
    return applyPromotionFlat(vehicle?.pricePerDay || 0, nbJours, vehicle?.promotions) * nbJours;
  }
  const seasonalTotal = computeSeasonalTotal(vehicle.pricePerDay, vehicle.seasonalRates, startDate, nbJours);
  const rule = selectBestPromotionRule(vehicle.promotions, nbJours, seasonalTotal);
  if (!rule) return seasonalTotal;
  const discounted = rule.type === "percent"
    ? seasonalTotal * (1 - Math.min(Number(rule.value), 90) / 100)
    : Math.max(seasonalTotal - Number(rule.value), 0);
  return Math.round(discounted * 100) / 100;
}

// Reprend exactement server/utils/promotion.js applyPromotion (prix/jour
// remisé) — dupliqué ici (pas de dépendance circulaire) pour la branche
// "comportement inchangé" ci-dessus.
function applyPromotionFlat(pricePerDay, days, promotions) {
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

// Règle saisonnière "en cours aujourd'hui" — pour un badge catalogue (aucune
// date de séjour connue à ce stade).
export function getCurrentSeasonalRule(seasonalRates) {
  if (!Array.isArray(seasonalRates) || seasonalRates.length === 0) return null;
  const now = new Date();
  const active = seasonalRates.filter((r) => r?.active && isDateInSeasonalRange(now, r));
  if (active.length === 0) return null;
  return active.reduce((a, b) => (Number(a.pricePerDay) >= Number(b.pricePerDay) ? a : b));
}
