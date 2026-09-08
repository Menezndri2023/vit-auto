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

  // Numéros du service client, en forme internationale E.164 pour les liens
  // `tel:`. Le lien marocain contenait « +212 0 6… » : le 0 est le préfixe
  // NATIONAL marocain, qu'il faut supprimer en composition internationale —
  // avec lui, l'appel échoue depuis l'étranger, c'est-à-dire pour l'essentiel
  // des visiteurs d'une plateforme internationale. La Côte d'Ivoire, elle, n'a
  // pas de préfixe national depuis la renumérotation : ses 10 chiffres suivent
  // directement l'indicatif.
  phoneMA:        "+212607742672",
  phoneMADisplay: "+212 6 07 74 26 72",
  phoneCI:        "+2250748124635",
  phoneCIDisplay: "+225 07 48 12 46 35",
};

export const COMPANY_ADDRESS    = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}`;
export const COMPANY_ADDRESS_EN = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.countryEn}`;
