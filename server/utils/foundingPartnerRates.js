// Taux de commission Founding Partner — deux paliers dans le temps, décomptés
// depuis la signature de l'Accord (commissions.lockedAt) : "12 mois depuis
// l'activation" annoncé dans la LOI/l'Agreement (voir partnerOnboardingController.js
// generateLOI/generateAgreement). Palier 1 tant que l'Accord n'est pas encore signé
// (lockedAt null) — c'est le tarif affiché avant signature.
export const FOUNDING_YEAR1_RATES = { location: 0.05, vente: 0.01 };
export const FOUNDING_YEAR2_RATES = { location: 0.07, vente: 0.02 };

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// `field` = "location" | "vente"
export function foundingRateFor(lockedAt, field) {
  if (!lockedAt) return FOUNDING_YEAR1_RATES[field];
  const elapsed = Date.now() - new Date(lockedAt).getTime();
  return elapsed < YEAR_MS ? FOUNDING_YEAR1_RATES[field] : FOUNDING_YEAR2_RATES[field];
}
