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
export const RENTAL_OPTION_IDS = ["driver", "babySeat", "insurance", "gps"];

// Libellés de repli, employés côté serveur (e-mails, contrats, messages
// d'erreur). L'interface, elle, passe par ses propres traductions.
export const RENTAL_OPTION_LABELS = {
  driver:    "Chauffeur privé",
  babySeat:  "Siège bébé",
  insurance: "Assurance complémentaire",
  gps:       "GPS",
};

/**
 * Résout les options réellement proposées pour une politique de location
 * partenaire donnée.
 *
 * @param {object|null} rentalPolicy  PartnerBusiness.rentalPolicy, ou null
 *                                    lorsque l'annonce n'est rattachée à
 *                                    aucune entité partenaire.
 * @returns {Promise<Array<{id, label, offered, pricePerDay, source}>>}
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
    if (regle.offered === false) {
      return { id, label: RENTAL_OPTION_LABELS[id], offered: false, pricePerDay: 0, source: "partenaire" };
    }

    // Prix partenaire : accepté seulement s'il est fini et positif. Un 0 ou un
    // négatif enregistré par erreur donnerait une option gratuite — on préfère
    // retomber sur le tarif global, jamais offrir un service par accident.
    const prixPartenaire = Number(regle.pricePerDay);
    const prixPartenaireValide = Number.isFinite(prixPartenaire) && prixPartenaire > 0;

    return {
      id,
      label:       RENTAL_OPTION_LABELS[id],
      offered:     true,
      pricePerDay: prixPartenaireValide ? prixPartenaire : prixGlobal,
      source:      prixPartenaireValide ? "partenaire" : "global",
    };
  }));
}

/**
 * Tarifie les options d'une réservation et refuse celles que le partenaire ne
 * propose pas.
 *
 * @returns {Promise<{ montant:number, refusees:string[] }>}
 *   `montant` : total pour toute la durée, dans la devise de PricingConfig.
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
    montant += option.pricePerDay * duree;
  }

  return { montant, refusees };
}
