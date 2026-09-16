import { getRentalOptionPrice } from "./pricingEngine.js";

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONS SUPPLÉMENTAIRES DE LOCATION — accordées aux conditions du partenaire
// ═══════════════════════════════════════════════════════════════════════════
// Les options étaient une liste figée, identique pour tous les partenaires, au
// tarif global de PricingConfig.rentalOptions. Un client pouvait donc cocher
// « chauffeur privé » chez un partenaire qui n'en propose pas : la réservation
// partait, et le désaccord se découvrait à la remise des clés. À l'inverse, un
// partenaire dont le chauffeur coûte réellement plus cher n'avait aucun moyen
// de le dire.
//
// Ce module est la SEULE autorité sur « quelles options sont proposées, et à
// quel prix » : le parcours client l'interroge pour n'afficher que le
// possible, et la création de réservation le réinterroge pour tarifer et pour
// refuser une option non proposée. Un prix envoyé par le client n'est jamais
// lu — même règle que les frais de livraison et les codes promo.

// Identifiants figés par le schéma Booking.location.options : ajouter une
// option ici suppose d'ajouter le champ correspondant au modèle.
//
// Les trois derniers (2026-09-16) sont les suppléments qu'une agence facture
// couramment en plus du tarif journalier — relevés chez RENT À CAR CÔTE
// D'AZUR, mais règle commune à tous les loueurs : conducteur additionnel,
// kilométrage illimité, remise ou restitution en gare/aéroport. Ils n'ont
// pas de tarif plateforme (0 dans PricingConfig) : ils n'apparaissent au
// client que chez un partenaire qui les propose à son prix.
export const RENTAL_OPTION_IDS = ["driver", "babySeat", "insurance", "gps", "additionalDriver", "unlimitedMileage", "airportDelivery"];

// Libellés de repli, employés côté serveur (e-mails, contrats, messages
// d'erreur). L'interface, elle, passe par ses propres traductions.
export const RENTAL_OPTION_LABELS = {
  driver:           "Chauffeur privé",
  babySeat:         "Siège bébé",
  insurance:        "Assurance complémentaire",
  gps:              "GPS",
  additionalDriver: "Conducteur additionnel",
  unlimitedMileage: "Kilométrage illimité",
  airportDelivery:  "Remise / restitution en gare ou aéroport",
};

// Unité de facturation : « day » = le prix est multiplié par la durée, « rental »
// = forfait par location, compté une fois. Le partenaire peut la changer par
// option (un siège enfant à 30 € la location, pas par jour) ; sans choix de sa
// part, l'unité ci-dessous s'applique.
export const RENTAL_OPTION_UNITS = ["day", "rental"];
export const RENTAL_OPTION_DEFAULT_UNIT = {
  driver: "day", babySeat: "day", insurance: "day", gps: "day",
  additionalDriver: "day", unlimitedMileage: "day", airportDelivery: "rental",
};

/**
 * Résout les options réellement proposées pour une politique de location
 * partenaire donnée.
 *
 * @param {object|null} rentalPolicy  PartnerBusiness.rentalPolicy, ou null
 *                                    lorsque l'annonce n'est rattachée à
 *                                    aucune entité partenaire.
 * @returns {Promise<Array<{id, label, offered, pricePerDay, unit, source}>>}
 *
 * `offered: null` dans la politique = aucune règle partenaire : on retombe
 * intégralement sur le catalogue global, c'est-à-dire le comportement
 * antérieur. Un partenaire qui ne configure rien ne voit donc rien changer.
 */
export async function resolveRentalOptions(rentalPolicy = null) {
  const reglages = rentalPolicy?.rentalOptions || {};

  return Promise.all(RENTAL_OPTION_IDS.map(async (id) => {
    const regle = reglages?.[id] || {};
    const prixGlobal = await getRentalOptionPrice(id);

    // Refus explicite du partenaire : l'option disparaît du parcours.
    const unit = RENTAL_OPTION_UNITS.includes(regle.unit) ? regle.unit : RENTAL_OPTION_DEFAULT_UNIT[id];
    if (regle.offered === false) {
      return { id, label: RENTAL_OPTION_LABELS[id], offered: false, pricePerDay: 0, unit, source: "partenaire" };
    }

    // Prix partenaire : accepté seulement s'il est fini et positif. Un 0 ou un
    // négatif enregistré par erreur donnerait une option gratuite — on préfère
    // retomber sur le tarif global, jamais offrir un service par accident.
    const prixPartenaire = Number(regle.pricePerDay);
    const prixPartenaireValide = Number.isFinite(prixPartenaire) && prixPartenaire > 0;

    const pricePerDay = prixPartenaireValide ? prixPartenaire : prixGlobal;
    return {
      id,
      label:       RENTAL_OPTION_LABELS[id],
      // Ni prix partenaire ni tarif plateforme : l'option n'existe pas ici.
      // Sans cette règle, les suppléments sans tarif global apparaîtraient
      // gratuits chez tous les loueurs qui ne les ont jamais configurés.
      offered:     pricePerDay > 0,
      pricePerDay,
      unit,
      source:      prixPartenaireValide ? "partenaire" : "global",
    };
  }));
}

/**
 * Tarifie les options d'une réservation et refuse celles que le partenaire ne
 * propose pas.
 *
 * @returns {Promise<{ montant:number, refusees:string[] }>}
 *   `montant` : total pour toute la durée, dans la devise de PricingConfig
 *   (les options au forfait « rental » comptent une fois, quelle que soit la durée).
 *   `refusees` : libellés des options demandées mais non proposées — la
 *   réservation doit être rejetée, jamais silencieusement allégée : le client
 *   a choisi ces options, il ne doit pas découvrir leur absence sur place.
 */
export async function priceRentalOptions(optionsDemandees, rentalPolicy, jours = 1) {
  const disponibles = await resolveRentalOptions(rentalPolicy);
  const parId = Object.fromEntries(disponibles.map((o) => [o.id, o]));

  const duree = Number.isFinite(Number(jours)) && Number(jours) > 0 ? Number(jours) : 1;
  let montant = 0;
  const refusees = [];

  for (const [id, active] of Object.entries(optionsDemandees || {})) {
    if (!active) continue;
    const option = parId[id];
    if (!option) continue;               // identifiant inconnu : ignoré, comme avant
    if (!option.offered) { refusees.push(option.label); continue; }
    montant += option.unit === "rental" ? option.pricePerDay : option.pricePerDay * duree;
  }

  return { montant, refusees };
}
