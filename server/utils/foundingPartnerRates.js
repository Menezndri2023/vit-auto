// Taux de commission Founding Partner — deux paliers dans le temps, décomptés
// depuis la signature de l'Accord (commissions.lockedAt) : "12 mois depuis
// l'activation" annoncé dans la LOI/l'Agreement (voir partnerOnboardingController.js
// generateLOI/generateAgreement). Palier 1 tant que l'Accord n'est pas encore signé
// (lockedAt null) — c'est le tarif affiché avant signature.
//
// Deux profils distincts selon PartnerOnboarding.legalEntityType : un
// partenaire "particulier" n'a pas la même échelle qu'une entreprise/un
// professionnel/un exportateur — taux réduit dès le départ, mais permanent
// (jamais de retour au tarif standard) et plafonné en nombre d'annonces
// (voir INDIVIDUAL_FOUNDER_MAX_ACTIVE, vehicleController.js/
// importExportController.js). Le profil "default" couvre entreprise,
// professionnel ET exportateur (identiques) — son avantage réduit ne dure
// que les 12 premiers mois, puis retombe au tarif standard (15%/3%).
export const FOUNDING_YEAR1_RATES = {
  default:     { location: 0.10, vente: 0.02 },
  particulier: { location: 0.05, vente: 0.01 },
};
export const FOUNDING_YEAR2_RATES = {
  default:     { location: 0.15, vente: 0.03 }, // = tarif standard, l'avantage s'arrête à 12 mois
  particulier: { location: 0.07, vente: 0.02 }, // reste réduit en permanence
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// `field` = "location" | "vente" ; `legalEntityType` = PartnerOnboarding.legalEntityType
export function foundingRateFor(lockedAt, field, legalEntityType) {
  const tier = legalEntityType === "particulier" ? "particulier" : "default";
  if (!lockedAt) return FOUNDING_YEAR1_RATES[tier][field];
  const elapsed = Date.now() - new Date(lockedAt).getTime();
  return elapsed < YEAR_MS ? FOUNDING_YEAR1_RATES[tier][field] : FOUNDING_YEAR2_RATES[tier][field];
}
