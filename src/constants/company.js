// ═══════════════════════════════════════════════════════════════════════════
// IDENTITÉ DE L'ENTREPRISE — source unique de vérité (interface)
// ═══════════════════════════════════════════════════════════════════════════
// Miroir de server/constants/company.js. L'adresse du siège était recopiée à
// la main dans le pied de page, les mentions légales, la politique de
// confidentialité et le contrat Founding Partner : un déménagement en laissait
// forcément une périmée quelque part.

export const COMPANY = {
  name:      "VIT AUTO",
  street:    "Boulevard Lalla Yacout & Rue El Arrar, Résidence Galis",
  city:      "Casablanca",
  country:   "Maroc",
  countryEn: "Morocco",
  email:     "contact@vit-auto.com",
  website:   "www.vit-auto.com",
};

export const COMPANY_ADDRESS    = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}`;
export const COMPANY_ADDRESS_EN = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.countryEn}`;
