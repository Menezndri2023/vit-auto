// Mirroir client de server/utils/seasonalPricing.js — affichage uniquement,
// le serveur reste seul autoritaire pour le montant réellement facturé
// (bookingController recalcule tout depuis Vehicle.seasonalRates).
import { selectBestPromotionRule } from "./promotion";

function isDateInSeasonalRange(date, rule) {
  const key   = (date.getMonth() + 1) * 100 + date.getDate();
  const start = rule.startMonth * 100 + rule.startDay;
  const end   = rule.endMonth   * 100 + rule.endDay;
  if (start <= end) return key >= start && key <= end;
  return key >= start || key <= end;
}

export function getSeasonalPriceForDate(pricePerDay, seasonalRates, date) {
  const base = Number(pricePerDay) || 0;
  if (!Array.isArray(seasonalRates) || seasonalRates.length === 0) return base;
  const active = seasonalRates.filter((r) => r?.active && isDateInSeasonalRange(date, r));
  if (active.length === 0) return base;
  return Math.max(...active.map((r) => Number(r.pricePerDay) || 0));
}

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

// Même formule que server/utils/seasonalPricing.js computeLocationTotal —
// voir ce fichier pour le détail (rétrocompatibilité stricte sans règle
// saisonnière configurée).
// Tarif mensuel facultatif (2026-09-16) : dès 30 jours, chaque tranche de
// 30 jours est facturée au tarif mois du partenaire (Vehicle.pricePerMonth) ;
// les jours restants suivent le calcul journalier (saison + promotion),
// plafonné à un mois de plus. Jamais plus cher que le calcul journalier seul :
// un tarif mois mal saisi ne peut pas pénaliser le client. Sans tarif mois ou
// sous 30 jours, le résultat est strictement celui d'avant.
export const JOURS_PAR_MOIS = 30;

export function computeLocationTotal(vehicle, startDate, days) {
  const nbJours = Math.max(Number(days) || 1, 1);
  const journalier = computeDailyTotal(vehicle, startDate, nbJours);
  const mensuel = Number(vehicle?.pricePerMonth) || 0;
  if (!(mensuel > 0) || nbJours < JOURS_PAR_MOIS) return journalier;
  const mois  = Math.floor(nbJours / JOURS_PAR_MOIS);
  const reste = nbJours - mois * JOURS_PAR_MOIS;
  let montantReste = 0;
  if (reste > 0) {
    const debutReste = startDate ? new Date(new Date(startDate).getTime() + mois * JOURS_PAR_MOIS * 86400000) : null;
    montantReste = Math.min(computeDailyTotal(vehicle, debutReste, reste), mensuel);
  }
  const mensualise = Math.round((mois * mensuel + montantReste) * 100) / 100;
  return Math.min(journalier, mensualise);
}

// Nombre de mois entiers facturés au tarif mois pour une durée donnée (0 si
// le tarif mois ne s'applique pas) — pour l'affichage du détail au client.
export function moisFactures(vehicle, days) {
  const nbJours = Math.max(Number(days) || 1, 1);
  if (!(Number(vehicle?.pricePerMonth) > 0) || nbJours < JOURS_PAR_MOIS) return 0;
  return Math.floor(nbJours / JOURS_PAR_MOIS);
}

function computeDailyTotal(vehicle, startDate, days) {
  const nbJours = Math.max(Number(days) || 1, 1);
  if (!Array.isArray(vehicle?.seasonalRates) || vehicle.seasonalRates.length === 0 || !startDate) {
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

// Règle saisonnière "en cours aujourd'hui" — pour un badge catalogue.
export function getCurrentSeasonalRule(seasonalRates) {
  if (!Array.isArray(seasonalRates) || seasonalRates.length === 0) return null;
  const now = new Date();
  const active = seasonalRates.filter((r) => r?.active && isDateInSeasonalRange(now, r));
  if (active.length === 0) return null;
  return active.reduce((a, b) => (Number(a.pricePerDay) >= Number(b.pricePerDay) ? a : b));
}
