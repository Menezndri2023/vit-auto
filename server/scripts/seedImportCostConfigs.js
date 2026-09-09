import logger from "../utils/logger.js";
import ImportCostConfig from "../models/ImportCostConfig.js";
import { EU_ORIGINS } from "../constants/importOrigins.js";

// ═══════════════════════════════════════════════════════════════════════════
// AMORÇAGE DES BARÈMES DOUANIERS PAR PAYS DE DESTINATION
// ═══════════════════════════════════════════════════════════════════════════
// Aucun barème n'était configuré. Le moteur de coût — qui est le
// différenciateur de la plateforme, la seule chose qui distingue une annonce
// VIT AUTO d'une petite annonce — répondait donc « Aucun barème d'importation
// configuré », et l'acheteur ne voyait aucun prix rendu.
//
// N'AMORCE QUE LES PAYS DONT LES TAUX ONT ÉTÉ VÉRIFIÉS À LA SOURCE. Inventer
// un barème pour les autres serait pire que de n'en avoir aucun : un acheteur
// engagerait un achat international sur un chiffre faux. Pour eux, le moteur
// continue de répondre « barème non configuré » et l'annonce affiche un tiret
// — comportement voulu.
//
// Ne crée que les pays ABSENTS : un barème déjà ajusté par l'admin n'est
// jamais réécrit.
//
// PAYS NON AMORCÉS, faute de source fiable au 2026-09 : Mali, Bénin, Togo,
// Guinée, Ghana, Nigeria. Le tarif extérieur commun CEDEAO situe les voitures
// de tourisme entre 5 et 20 %, mais chaque État y ajoute ses propres
// prélèvements — l'écart entre deux pays voisins dépasse dix points. Les
// renseigner « au TEC » produirait un devis faux avec l'apparence de la
// précision. Ils restent donc non configurés : le moteur refuse de chiffrer,
// et l'annonce affiche un tiret.

const BAREMES = [
  {
    country: "Maroc",
    // douane.gov.ma / customsclearance.ma / autoactu.ma — vérifié 2026-09.
    // Droit d'importation 17,5 % hors accord ; 2,5 % pour une origine UE au
    // titre de l'accord d'association. Taxe parafiscale 0,25 % du CIF, comprise
    // dans l'assiette de la TVA à 20 %.
    // Cumul hors UE : 17,5 + 0,25 + 20 % × 117,75 = 41,30 % du CIF.
    // Limite légale : véhicule particulier de 5 ans maximum.
    customsDutyPercent: 17.5,
    parafiscalPercent:  0.25,
    vatPercent:         20,
    maxVehicleAgeYears: 5,
    preferentialDuty: [{ label: "Accord d'association Maroc–UE", origins: EU_ORIGINS, percent: 2.5 }],
    source: "douane.gov.ma — droit d'importation véhicules, TPI et TVA (2026)",
  },
  {
    country: "Côte d'Ivoire",
    // Ministère des Transports / voitures.ci — vérifié 2026-09.
    // Voitures particulières : droits de 20 à 30 % ; 20 % retenu comme borne
    // basse, à ajuster par l'admin selon la catégorie réelle. TVA 18 % sur la
    // valeur CAF augmentée des droits. Limite d'âge : 5 ans depuis la PREMIÈRE
    // IMMATRICULATION à l'étranger — et non l'année du modèle, nuance que le
    // moteur ne sait pas encore distinguer (voir plus bas).
    customsDutyPercent: 20,
    parafiscalPercent:  0,
    vatPercent:         18,
    maxVehicleAgeYears: 5,
    preferentialDuty: [],
    source: "transports.gouv.ci / voitures.ci — droits véhicules particuliers et limite d'âge (2026)",
  },
  {
    country: "Sénégal",
    // douanes.sn — tableau officiel des taux cumulés, vérifié 2026-09.
    // Véhicule de TOURISME USAGÉ (SH 87 03) par voie maritime :
    //   droits (DD + RS + PCS + PCC + COSEC) .... 22,900 % du CIF
    //   TVA ..................................... 21,780 % du CIF
    //   droit d'enregistrement .................. 4,283 % du CIF
    //                                             ─────────────────
    //                                             48,963 % du CIF
    // La douane publie ici des taux DÉJÀ rapportés au CIF : les 21,780 % ne
    // sont pas 18 % appliqués à une base élargie, c'est le résultat final.
    // Les recalculer en les empilant donnerait un autre chiffre que celui de
    // l'administration — d'où `rateBasis: "effective_cif"`.
    rateBasis: "effective_cif",
    customsDutyPercent:  22.9,
    vatPercent:          21.78,
    registrationPercent: 4.283,
    parafiscalPercent:   0,
    // Aucune limite d'âge officielle trouvée à une source fiable : on ne
    // déclare donc AUCUNE interdiction plutôt que d'en inventer une, qui
    // bloquerait à tort des ventes légitimes.
    maxVehicleAgeYears: null,
    preferentialDuty: [],
    source: "douanes.sn — tableau des taux cumulés, véhicules de tourisme usagés voie maritime (2026)",
  },
];

// ⚠️ LIMITE CONNUE, à ne pas oublier : la Côte d'Ivoire compte l'âge depuis la
// première immatriculation à l'étranger, pas depuis le millésime. Un véhicule
// de millésime 2022 immatriculé en 2021 est donc plus vieux qu'il n'y paraît.
// `ImportExportListing` ne stocke pas cette date : le moteur retient le
// millésime, ce qui peut se montrer OPTIMISTE d'un an. Un champ
// `firstRegistrationDate` lèverait l'ambiguïté — chantier distinct.

export async function seedImportCostConfigs() {
  let created = 0;
  let skipped = 0;

  for (const bareme of BAREMES) {
    const existant = await ImportCostConfig.findOne({
      country: new RegExp(`^${bareme.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    }).lean();

    if (existant) { skipped += 1; continue; }

    await ImportCostConfig.create({ ...bareme, lastVerifiedAt: new Date(), active: true });
    created += 1;
  }

  logger.info("[Seed] Barèmes d'importation", { created, skipped });
  return { created, skipped };
}

// Barèmes dont la dernière vérification remonte à plus de `reviewEveryMonths`.
// Un pays peut relever ses droits d'une loi de finances à l'autre, et aucune
// administration ne publie ces taux via une interface machine : la seule
// parade honnête est de dater, puis d'alerter.
export async function stalledImportCostConfigs(now = new Date()) {
  const configs = await ImportCostConfig.find({ active: true })
    .select("country lastVerifiedAt reviewEveryMonths source").lean();

  return configs.filter((c) => {
    if (!c.lastVerifiedAt) return true;   // jamais daté = à vérifier
    const mois = (now - new Date(c.lastVerifiedAt)) / (1000 * 60 * 60 * 24 * 30.44);
    return mois > (c.reviewEveryMonths ?? 12);
  });
}
