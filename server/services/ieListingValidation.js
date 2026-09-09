import ImportCostConfig from "../models/ImportCostConfig.js";
import { resolveOriginCode } from "../constants/importOrigins.js";
import { isIncotermCompatible } from "../constants/incoterms.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONTRÔLE D'UNE ANNONCE D'EXPORT AVANT PUBLICATION
// ═══════════════════════════════════════════════════════════════════════════
// La validation se résumait à « Champs obligatoires manquants » — sans dire
// lesquels. Le partenaire corrigeait au hasard, ou renonçait.
//
// Deux niveaux, et la distinction est l'essentiel :
//
//   ERREURS      — l'annonce ne peut pas être publiée. Donnée absente ou
//                  incohérente, sans laquelle rien ne fonctionne.
//   AVERTISSEMENTS — l'annonce part, mais quelque chose la rendra moins
//                  efficace, ou est vrai aujourd'hui et faux demain. Le
//                  partenaire doit le savoir AVANT de publier, pas le
//                  découvrir par l'absence d'acheteurs.
//
// Le cas le plus utile est le dernier : une annonce dont le véhicule dépasse la
// limite d'âge d'un pays de destination. Elle est parfaitement valide, mais ce
// pays refusera le véhicule au port. Le partenaire l'ignore, l'acheteur aussi,
// et le désaccord se découvre après paiement.

const CHAMPS_REQUIS = [
  ["title", "le titre de l'annonce"],
  ["make", "la marque"],
  ["model", "le modèle"],
  ["year", "l'année du modèle"],
  ["sourceCountry", "le pays d'origine"],
  ["price", "le prix"],
];

export async function validateListingForPublication(donnees = {}) {
  const errors = [];
  const warnings = [];

  // ── Erreurs bloquantes ───────────────────────────────────────────────────
  for (const [champ, libelle] of CHAMPS_REQUIS) {
    const v = donnees[champ];
    if (v === undefined || v === null || v === "" || (champ === "price" && Number(v) <= 0)) {
      errors.push({ field: champ, message: `Indiquez ${libelle}.` });
    }
  }

  const destinations = Array.isArray(donnees.availableIn) ? donnees.availableIn.filter(Boolean) : [];
  if (!destinations.length) {
    errors.push({
      field: "availableIn",
      message: "Indiquez au moins un pays de destination : sans lui, aucun acheteur ne peut voir votre annonce dans son pays.",
    });
  }

  if (donnees.incoterm && !isIncotermCompatible(donnees.incoterm, donnees.shippingType)) {
    errors.push({
      field: "incoterm",
      message: "Cet Incoterm est réservé au transport maritime — choisissez FAS, FOB, CFR ou CIF, ou changez de mode de transport.",
    });
  }

  const annee = Number(donnees.year);
  const anneeMax = new Date().getFullYear() + 1;
  if (donnees.year && (!Number.isFinite(annee) || annee < 1980 || annee > anneeMax)) {
    errors.push({ field: "year", message: `L'année doit être comprise entre 1980 et ${anneeMax}.` });
  }

  // ── Avertissements ───────────────────────────────────────────────────────
  if (!donnees.incoterm) {
    warnings.push({
      field: "incoterm",
      message: "Aucune règle de vente (Incoterm) : l'acheteur ne saura pas ce que votre prix comprend, et le coût rendu affiché sera surestimé par prudence.",
    });
  }

  if (!resolveOriginCode(donnees.sourceCountry)) {
    warnings.push({
      field: "sourceCountry",
      message: `« ${donnees.sourceCountry} » n'est pas un pays d'origine reconnu : les accords commerciaux ne pourront pas s'appliquer, et l'acheteur paiera le taux de droits le plus élevé.`,
    });
  }

  const photos = Array.isArray(donnees.photos) ? donnees.photos.filter(Boolean) : [];
  if (photos.length < 3) {
    warnings.push({
      field: "photos",
      message: `${photos.length} photo(s) : une annonce automobile se vend sur ses photos — intérieur, tableau de bord, coffre, pneus.`,
    });
  }

  // ── Destinations : barème et légalité ────────────────────────────────────
  if (destinations.length && Number.isFinite(annee)) {
    const configs = await ImportCostConfig.find({ active: true })
      .select("country maxVehicleAgeYears").lean();
    const parPays = new Map(configs.map((c) => [c.country.toLowerCase(), c]));
    const age = new Date().getFullYear() - annee;

    const sansBareme = [];
    const interdits = [];

    for (const pays of destinations) {
      const cfg = parPays.get(String(pays).toLowerCase());
      if (!cfg) { sansBareme.push(pays); continue; }
      if (cfg.maxVehicleAgeYears != null && age > cfg.maxVehicleAgeYears) {
        interdits.push(`${pays} (${cfg.maxVehicleAgeYears} ans maximum)`);
      }
    }

    if (interdits.length) {
      warnings.push({
        field: "availableIn",
        message: `Ce véhicule a ${age} ans : son importation est INTERDITE vers ${interdits.join(", ")}. L'annonce y restera visible, mais le véhicule serait refusé au port.`,
      });
    }

    if (sansBareme.length) {
      warnings.push({
        field: "availableIn",
        message: `Aucun barème douanier n'est encore configuré pour ${sansBareme.join(", ")} : l'acheteur n'y verra pas de coût rendu, seulement votre prix.`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
