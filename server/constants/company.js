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
  // Adresse telle qu'inscrite au RC et dans les statuts (art. 4). L'ancienne
  // écrivait « El Arrar » et omettait immeuble, étage et appartement.
  street:  "Boulevard Lalla Yacout et Rue El Araar, Immeuble 9, 4ème étage, Appartement 17, Résidence Galis",
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

  // ── Gérant et directeur de publication ────────────────────────────────────
  // Le nom figurait déjà, écrit EN DUR et en double, dans la LOI et l'Accord
  // Founding Partner (partnerOnboardingController.js) — mais restait absent
  // des mentions légales, qui donnaient « VIT AUTO » là où la loi attend une
  // personne physique nommée. Une seule source désormais.
  //
  // UNE SEULE graphie, partout : patronyme d'abord, en capitales.
  //
  // Deux formes ont brièvement coexisté — celle-ci, et une variante prénom
  // d'abord héritée des contrats Founding Partner — au motif de ne pas toucher
  // aux documents déjà signés. C'était une mauvaise raison : deux écritures
  // d'un même nom sur des pièces contractuelles, c'est exactement ce qu'un
  // litige vient contester. Décision du gérant : cette forme, et elle seule.
  //
  // Le test companyContact interdit toute graphie concurrente dans le dépôt —
  // y compris dans un commentaire, une orthographe écrite quelque part
  // finissant toujours par être recopiée. D'où l'absence de la variante ici.
  manager:      "N'DRI N'GUESSAN MANASSE",
  managerTitle: "Fondateur & Gérant",

  // ── Société éditrice ──────────────────────────────────────────────────────
  // « VIT AUTO » est une marque, sans personnalité juridique : la personne
  // morale qui l'exploite est la SARLAU ci-dessous. Valeurs relevées sur les
  // pièces officielles (modèle J du RC du 07/08/2026, bulletin d'IF, attestation
  // de TP, notification CNSS, certificat ICE) — toutes concordantes. L'art. 50
  // de la loi 5-96 impose dénomination + forme + capital + siège + RC sur tout
  // document destiné aux tiers ; l'IF et l'ICE sont obligatoires sur les
  // factures (CGI art. 145).
  legalName:     "VIT GLOBAL TECHNOLOGIES GROUP",
  legalForm:     "SARLAU",
  legalFormLong: "Société à responsabilité limitée à associé unique",
  capital:       "20 000,00 MAD",
  rc:            "742851",
  rcCourt:       "Tribunal de commerce de Casablanca",
  ice:           "004013219000041",
  taxId:         "73292932",
  tp:            "33304467",
  cnss:          "7097530",
};

export const COMPANY_LEGAL = `${COMPANY.legalName} ${COMPANY.legalForm}`;

// « … Résidence Galis, Casablanca, Maroc »
export const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}`;

// Version anglaise, pour les documents contractuels internationaux
// (LOI et Founding Partner Agreement).
export const COMPANY_ADDRESS_EN = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.countryEn}`;
