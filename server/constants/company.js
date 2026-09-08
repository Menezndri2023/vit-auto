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

  // Numéros du service client, en forme internationale E.164 pour les liens
  // `tel:`. Le numéro marocain portait « +212 0 6… » : le 0 est le préfixe
  // NATIONAL marocain, à supprimer en composition internationale — avec lui,
  // l'appel échoue depuis l'étranger, c'est-à-dire pour l'essentiel des
  // destinataires d'un e-mail sur une plateforme internationale. Corrigé côté
  // interface le 2026-09-08 ; cette copie serveur, qui alimente le pied de page
  // de TOUS les e-mails, avait été oubliée au premier passage.
  // La Côte d'Ivoire n'a pas de préfixe national depuis la renumérotation :
  // ses 10 chiffres suivent directement l'indicatif.
  phoneMA:        "+212607742672",
  phoneMADisplay: "+212 6 07 74 26 72",
  phoneCI:        "+2250748124635",
  phoneCIDisplay: "+225 07 48 12 46 35",
};

// « Boulevard Lalla Yacout & Rue El Arrar, Résidence Galis, Casablanca, Maroc »
export const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}`;

// Version anglaise, pour les documents contractuels internationaux
// (LOI et Founding Partner Agreement).
export const COMPANY_ADDRESS_EN = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.countryEn}`;
