// ═══════════════════════════════════════════════════════════════════════════
// IDENTITÉ DE L'ENTREPRISE — source unique de vérité (backend)
// ═══════════════════════════════════════════════════════════════════════════
// L'adresse du siège était recopiée à la main dans les e-mails, les contrats
// LOI/Founding Partner, le contact du service client et les pages légales du
// front : un déménagement obligeait à la retrouver partout, et une occurrence
// oubliée laissait une adresse fausse sur un document contractuel.
// Miroir côté interface : src/constants/company.js — les deux doivent rester
// identiques.

export const COMPANY = {
  name:    "VIT AUTO",
  street:  "Boulevard Lalla Yacout & Rue El Arrar, Résidence Galis",
  city:    "Casablanca",
  country: "Maroc",
  countryEn: "Morocco",
  email:   "contact@vit-auto.com",
  website: "www.vit-auto.com",
};

// « Boulevard Lalla Yacout & Rue El Arrar, Résidence Galis, Casablanca, Maroc »
export const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}`;

// Version anglaise, pour les documents contractuels internationaux
// (LOI et Founding Partner Agreement).
export const COMPANY_ADDRESS_EN = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.countryEn}`;
