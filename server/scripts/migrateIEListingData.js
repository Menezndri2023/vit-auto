import logger from "../utils/logger.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { resolveOriginCode, IMPORT_ORIGINS } from "../constants/importOrigins.js";

// ═══════════════════════════════════════════════════════════════════════════
// REMISE EN ORDRE DES ANNONCES IMPORT/EXPORT
// ═══════════════════════════════════════════════════════════════════════════
// Les annonces importées en masse portent trois défauts qui rendent tout
// calcul de coût faux, et deux d'entre eux passent inaperçus à l'œil nu.
//
// 1. ANNÉE FAUSSE. 134 des 142 annonces chinoises portent l'année du jour de
//    l'import (2026) alors que leur titre indique 2018 à 2024. Conséquence :
//    chaque véhicule paraît neuf, la surtaxe d'âge ne se déclenche jamais, et
//    la limite légale d'importation (5 ans au Maroc) ne s'applique pas — on
//    annonce donc un prix pour un véhicule qui sera refusé au port.
//
// 2. PAYS D'ORIGINE INCOHÉRENT. La base contient « CHINA », « China »,
//    « china », « chi'na » et « 中国 » pour un même pays. Tout filtre par
//    origine est faux, et surtout le taux de droit d'importation dépend de
//    l'origine : une graphie non reconnue fait perdre un accord commercial.
//
// 3. DESTINATION QUI N'EST PAS UN PAYS. `availableIn` contient la phrase
//    « Deliveries available worldwide ». Le barème douanier étant indexé par
//    pays de destination, aucun devis ne peut être calculé.
//
// Idempotente : relancée, elle ne touche plus rien.

// Marchés réellement desservis par VIT AUTO, retenus pour remplacer la phrase
// « Deliveries available worldwide ». Volontairement restreint aux pays où la
// plateforme opère : promettre une livraison mondiale qu'on ne sait pas
// organiser est précisément ce que cette migration corrige.
const DESTINATIONS_PAR_DEFAUT = [
  "Maroc", "Côte d'Ivoire", "Sénégal", "Mali",
  "Bénin", "Togo", "Guinée", "Ghana", "Nigeria",
];

// Une valeur d'`availableIn` qui ne ressemble à aucun pays : phrase marketing,
// mention « worldwide », texte de plus de quelques mots.
const estUnePhrase = (v) =>
  typeof v !== "string" || v.trim().split(/\s+/).length > 3 || /worldwide|available|deliver/i.test(v);

const NOM_CANONIQUE = Object.fromEntries(IMPORT_ORIGINS.map((o) => [o.code, o.name]));

// Année du modèle, lue dans le titre. On n'accepte qu'une année plausible pour
// un véhicule : un nombre à quatre chiffres dans un titre peut aussi être une
// cylindrée ou une autonomie (« 60kWh », « 4WD »), d'où la borne haute.
export function anneeDepuisTitre(titre) {
  const annees = String(titre || "").match(/\b(19[89]\d|20[0-2]\d)\b/g);
  if (!annees) return null;
  const max = new Date().getFullYear() + 1;
  const plausibles = annees.map(Number).filter((a) => a >= 1980 && a <= max);
  // La plus récente : un titre comme « Golf 2015 restylé 2018 » désigne le
  // millésime le plus récent.
  return plausibles.length ? Math.max(...plausibles) : null;
}

export async function migrateIEListingData() {
  const listings = await ImportExportListing.find({})
    .select("title year sourceCountry availableIn")
    .lean();

  let anneesCorrigees = 0;
  let originesNormalisees = 0;
  let destinationsCorrigees = 0;

  for (const l of listings) {
    const maj = {};

    // ── Année ──
    const anneeTitre = anneeDepuisTitre(l.title);
    if (anneeTitre && anneeTitre !== l.year) {
      maj.year = anneeTitre;
      anneesCorrigees += 1;
    }

    // ── Origine ──
    const code = resolveOriginCode(l.sourceCountry);
    if (code && NOM_CANONIQUE[code] && NOM_CANONIQUE[code] !== l.sourceCountry) {
      maj.sourceCountry = NOM_CANONIQUE[code];
      originesNormalisees += 1;
    }

    // ── Destinations ──
    const dest = Array.isArray(l.availableIn) ? l.availableIn : [];
    const propres = dest.filter((v) => !estUnePhrase(v));
    if (propres.length !== dest.length) {
      // Aucune destination exploitable ne subsiste : on retombe sur les marchés
      // desservis, plutôt que de laisser une annonce sans destination — elle
      // serait alors invisible de tout acheteur.
      maj.availableIn = propres.length ? propres : DESTINATIONS_PAR_DEFAUT;
      destinationsCorrigees += 1;
    }

    if (Object.keys(maj).length) {
      await ImportExportListing.updateOne({ _id: l._id }, { $set: maj });
    }
  }

  logger.info("[Migration IE] Annonces normalisées", {
    total: listings.length, anneesCorrigees, originesNormalisees, destinationsCorrigees,
  });
  return { total: listings.length, anneesCorrigees, originesNormalisees, destinationsCorrigees };
}
