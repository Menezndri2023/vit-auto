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
// DEUX NIVEAUX DE FIABILITÉ, et la distinction est portée par `source` :
//
//   VÉRIFIÉ    — Maroc, Côte d'Ivoire, Sénégal, Ghana, Nigeria : taux relevés
//                sur une source douanière ou sectorielle identifiée.
//   PROVISOIRE — Bénin, Mali, Togo, Guinée : seule la base du tarif extérieur
//                commun CEDEAO a pu être établie ; chaque État y ajoute des
//                prélèvements nationaux introuvables à une source fiable. Leur
//                `source` commence par « PROVISOIRE » et leur revue est fixée à
//                6 mois au lieu de 12.
//
// Décision du gérant : un barème provisoire assumé vaut mieux qu'un tiret sur
// toutes les annonces, dès lors qu'il est ajustable depuis l'administration —
// ce que les transitaires locaux permettront de faire.

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
    // douanes.ci (TEC CEDEAO) / transports.gouv.ci / automag.ci — vérifié 2026-09.
    // Décomposition, tous les taux rapportés à la valeur CAF :
    //   droit de douane (TEC, voitures particulières) ... 20,0 %
    //   redevance statistique .......................... 1,0 %
    //   prélèvement communautaire CEDEAO ............... 0,5 %
    //   taxe additionnelle ............................. 2,6 %
    //                                                    ────────
    //   prélèvements avant TVA ......................... 24,1 %
    //   TVA 18 % sur CAF + prélèvements (124,1) ........ 22,338 %
    //                                                    ────────
    //   CUMUL .......................................... 46,438 % du CAF
    //
    // `parafiscalPercent` agrège ici redevance statistique, prélèvement CEDEAO
    // et taxe additionnelle : trois prélèvements assis sur le CAF et compris
    // dans l'assiette de la TVA — exactement le rôle de ce champ.
    //
    // Le TEC va de 20 à 30 % selon la catégorie : 20 % correspond aux voitures
    // particulières. Un utilitaire ou un véhicule de forte cylindrée relève
    // d'un taux supérieur, à ajuster par l'admin.
    customsDutyPercent: 20,
    parafiscalPercent:  4.1,
    vatPercent:         18,
    maxVehicleAgeYears: 5,
    preferentialDuty: [],
    source: "douanes.ci (TEC CEDEAO) + transports.gouv.ci — droits, RS 1 %, PC 0,5 %, taxe additionnelle 2,6 %, TVA 18 %, limite 5 ans (2026)",
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
  // ── CEDEAO / UEMOA — barèmes PROVISOIRES ────────────────────────────────
  // Ces quatre pays appliquent le tarif extérieur commun CEDEAO, mais chacun y
  // ajoute ses prélèvements nationaux, que je n'ai pas trouvés à une source
  // officielle. La base retenue est donc celle du TEC : droit de 20 % pour les
  // voitures particulières, redevance statistique 1 % et prélèvement
  // communautaire 0,5 % (les deux seuls prélèvements communs à toute la zone),
  // TVA au taux UEMOA de 18 %.
  //
  // MARQUÉS PROVISOIRES et revus tous les 6 mois : ils donnent un ordre de
  // grandeur défendable en attendant les tableaux des transitaires locaux, que
  // l'admin saisira. Un barème provisoire assumé vaut mieux qu'un tiret sur
  // toutes les annonces — mais il ne doit jamais passer pour définitif.
  {
    country: "Bénin",
    customsDutyPercent: 20, parafiscalPercent: 1.5, vatPercent: 18,
    maxVehicleAgeYears: null,   // aucune limite trouvée à une source fiable
    preferentialDuty: [],
    reviewEveryMonths: 6,
    source: "PROVISOIRE — TEC CEDEAO (droit 20 %, RS 1 %, PC 0,5 %) + TVA 18 % (finances.bj, automag.bj 2026). À confirmer avec le transitaire.",
  },
  {
    country: "Mali",
    customsDutyPercent: 20, parafiscalPercent: 1.5, vatPercent: 18,
    maxVehicleAgeYears: null,
    preferentialDuty: [],
    reviewEveryMonths: 6,
    source: "PROVISOIRE — TEC CEDEAO (droit 20 %, RS 1 %, PC 0,5 %) + TVA 18 % (douanes.gouv.ml, TEC 2022). À confirmer avec le transitaire.",
  },
  {
    country: "Togo",
    customsDutyPercent: 20, parafiscalPercent: 1.5, vatPercent: 18,
    maxVehicleAgeYears: null,
    preferentialDuty: [],
    reviewEveryMonths: 6,
    source: "PROVISOIRE — TEC CEDEAO (droit 20 %, RS 1 %, PC 0,5 %) + TVA 18 %. À confirmer avec le transitaire.",
  },
  {
    country: "Guinée",
    customsDutyPercent: 20, parafiscalPercent: 1.5, vatPercent: 18,
    maxVehicleAgeYears: null,
    preferentialDuty: [],
    reviewEveryMonths: 6,
    source: "PROVISOIRE — TEC CEDEAO (droit 20 %, RS 1 %, PC 0,5 %) + TVA 18 %. À confirmer avec le transitaire.",
  },
  {
    country: "Ghana",
    // guazi.com / kitannex.com — vérifié 2026-09.
    // Droit de 5 à 20 % selon le type ; 20 % retenu pour les voitures
    // particulières. La fiscalité indirecte cumule TVA 15 %, NHIL 2,5 % et
    // GETFund 2,5 %, soit 20 % appliqués sur CIF + droits.
    // Âge : au-delà de 10 ans une PÉNALITÉ de surâge s'ajoute (ce n'est pas une
    // interdiction) ; l'interdiction, elle, frappe les véhicules de plus de
    // 15 ans à compter d'octobre 2026 — c'est cette limite qui est déclarée.
    customsDutyPercent: 20, parafiscalPercent: 0, vatPercent: 20,
    maxVehicleAgeYears: 15,
    preferentialDuty: [],
    reviewEveryMonths: 6,
    source: "guazi.com / kitannex.com — droit 20 %, TVA 15 % + NHIL 2,5 % + GETFund 2,5 %, interdiction au-delà de 15 ans (oct. 2026). Surâge >10 ans non modélisé.",
  },
  {
    country: "Nigeria",
    // guazi.com / carawon.com — vérifié 2026-09.
    // Droit 20 % ; prélèvements annexes : NAC 5 % (ramené de 15 % au
    // 1er juillet 2026), ETLS 0,5 %, et une surtaxe de 7 % SUR LES DROITS —
    // soit 1,4 % du CIF, d'où 6,9 % au total. TVA 7,5 % sur l'ensemble.
    // Cumul : 36,42 % du CIF. Limite d'âge : 12 ans depuis 2022.
    customsDutyPercent: 20, parafiscalPercent: 6.9, vatPercent: 7.5,
    maxVehicleAgeYears: 12,
    preferentialDuty: [],
    reviewEveryMonths: 6,
    source: "guazi.com / carawon.com — droit 20 %, NAC 5 %, ETLS 0,5 %, surtaxe 7 % des droits, TVA 7,5 %, limite 12 ans (2026).",
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
