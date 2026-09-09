import ImportCostConfig from "../models/ImportCostConfig.js";
import ShippingLaneRate from "../models/ShippingLaneRate.js";
import { getRateFromUSD } from "./currencyEngine.js";
import { computeImportEstimateFee } from "./pricingEngine.js";
import { getIncoterm } from "../constants/incoterms.js";
import { resolveOriginCode } from "../constants/importOrigins.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Frais de service VIT AUTO (Import) — hybride avec plancher/plafond ───────
// Barème éditable depuis l'admin (PricingConfig.importEstimateFee — voir
// pricingEngine.computeImportEstimateFee()). Distinct de la commission
// import_export prélevée sur le partenaire à la libération des fonds —
// celle-ci est un frais de service facturé à l'ACHETEUR, visible dans son devis.
export async function computeImportServiceFeeUSD(vehiclePriceUSD) {
  return computeImportEstimateFee(vehiclePriceUSD);
}

// ── Moteur de calcul du coût total d'importation ─────────────────────────────
// Simplification volontaire (v1 "Estimation" — voir la demande utilisateur
// pour les 3 niveaux prévus : Estimation / Devis partenaire / Prix garanti,
// seule l'Estimation est construite ici) : douane à taux fixe par pays,
// indépendant de l'âge/la cylindrée du véhicule — un raffinement possible,
// pas un objectif de cette version.
//
// Tout le calcul est fait en USD (devise de référence du moteur, cohérente
// avec les barèmes ImportCostConfig/ShippingLaneRate) pour éviter d'accumuler
// des erreurs d'arrondi ligne par ligne — seul le résultat final est converti
// dans la devise de l'annonce/transaction.
// `incoterm` : règle de vente déclarée par l'exportateur. Elle détermine ce qui
// est DÉJÀ inclus dans son prix, donc ce que l'acheteur doit encore payer.
// Sans elle, le moteur ajoutait systématiquement fret, assurance et frais de
// chargement — y compris sur une annonce en CIF, où l'exportateur les a déjà
// facturés : le total était alors surestimé de plusieurs centaines de dollars,
// et l'acheteur renonçait sur un chiffre faux.
//
// La matrice de responsabilités par étape vit dans constants/incoterms.js —
// une seule source, partagée avec l'affichage.
export async function computeImportCost({ vehiclePrice, currency, sourceCountry, destCountry, destCity, vehicleYear, incoterm = null }) {
  if (!destCountry) {
    return { available: false, message: "Pays de destination requis." };
  }
  const destRe = new RegExp(`^${escapeRegex(destCountry)}$`, "i");
  const config = await ImportCostConfig.findOne({ country: destRe, active: true }).lean();
  if (!config) {
    return { available: false, message: `Aucun barème d'importation configuré pour "${destCountry}" pour le moment.` };
  }

  let lane = null;
  if (sourceCountry) {
    const sourceRe = new RegExp(`^${escapeRegex(sourceCountry)}$`, "i");
    lane = await ShippingLaneRate.findOne({ sourceCountry: sourceRe, destCountry: destRe, active: true }).lean();
  }

  const rateFromUSD = await getRateFromUSD(currency);
  if (rateFromUSD == null) {
    return { available: false, message: `Devise "${currency}" non supportée pour le moment.` };
  }
  const vehiclePriceUSD = vehiclePrice / rateFromUSD;

  // Qui paie quoi, selon l'Incoterm. Sans Incoterm déclaré, on retient
  // l'hypothèse la plus prudente pour l'acheteur — tout à sa charge — qui est
  // aussi le comportement antérieur : mieux vaut annoncer un coût trop élevé
  // qu'une bonne surprise qui n'arrivera pas.
  const regle = incoterm ? getIncoterm(incoterm) : null;
  const aLaChargeDeLAcheteur = (etape) =>
    !regle || regle.responsibilities?.[etape] !== "vendeur";

  const inlandTransportUSD = lane?.inlandTransportUSD ?? 150;
  const seaFreightUSD      = lane?.seaFreightUSD ?? config.defaultSeaFreightUSD;
  const insuranceUSD       = vehiclePriceUSD * (config.insurancePercent / 100);
  const portFeesUSD        = config.portFeesFixedUSD;

  // Surtaxe véhicule d'occasion au-delà du seuil d'âge (désactivée par défaut,
  // voir ImportCostConfig.ageSurchargePercent) — approximation simple, pas un
  // barème progressif par tranche d'âge réel.
  const vehicleAgeYears = vehicleYear ? new Date().getFullYear() - vehicleYear : null;
  const ageSurchargeApplies = vehicleAgeYears != null
    && config.ageSurchargePercent > 0
    && vehicleAgeYears > config.ageSurchargeThresholdYears;
  // ── Limite d'âge : interdiction, pas surtaxe ────────────────────────────
  // Au Maroc, un véhicule particulier de plus de 5 ans ne peut PAS être
  // importé. Ce n'est pas une pénalité tarifaire : le véhicule est refusé.
  // Chiffrer une importation impossible serait la pire des réponses.
  if (config.maxVehicleAgeYears != null && vehicleAgeYears != null
      && vehicleAgeYears > config.maxVehicleAgeYears) {
    return {
      available: false,
      importAllowed: false,
      reason: "AGE_LIMIT",
      maxVehicleAgeYears: config.maxVehicleAgeYears,
      vehicleAgeYears,
      message: `Ce véhicule a ${vehicleAgeYears} ans. « ${destCountry} » n'autorise l'importation que jusqu'à ${config.maxVehicleAgeYears} ans.`,
    };
  }

  // ── Droit d'importation : dépend aussi de l'ORIGINE ─────────────────────
  // Un accord commercial entre le pays de destination et le pays d'origine
  // change le taux du tout au tout — 2,5 % pour un véhicule d'origine UE
  // entrant au Maroc contre 17,5 % pour un véhicule chinois. Retenir un taux
  // unique revenait à se tromper pour la moitié du catalogue.
  const origine = resolveOriginCode(sourceCountry);
  const regimePreferentiel = origine
    ? (config.preferentialDuty || []).find((r) => (r.origins || []).includes(origine))
    : null;
  const baseDutyPercent = regimePreferentiel ? regimePreferentiel.percent : config.customsDutyPercent;
  const effectiveDutyPercent = baseDutyPercent + (ageSurchargeApplies ? config.ageSurchargePercent : 0);

  // CIF = Cost + Insurance + Freight, base standard des droits de douane.
  const cifBaseUSD      = vehiclePriceUSD + seaFreightUSD + insuranceUSD;
  const customsDutyUSD  = cifBaseUSD * (effectiveDutyPercent / 100);
  // Taxe parafiscale : pourcentage du CIF, et elle entre DANS l'assiette de la
  // TVA — au Maroc, l'assiette est CIF + droits + parafiscale, pas CIF +
  // droits. L'omettre sous-évaluait la TVA. 0 % par défaut : sans effet sur les
  // barèmes qui ne la déclarent pas.
  const parafiscalUSD   = cifBaseUSD * ((config.parafiscalPercent || 0) / 100);
  const vatUSD          = (cifBaseUSD + customsDutyUSD + parafiscalUSD) * (config.vatPercent / 100);
  const customsTotalUSD = customsDutyUSD + parafiscalUSD + vatUSD
                        + config.transitFixedFeeUSD + config.redevancesFixedFeeUSD;

  const deliveryUSD   = config.deliveryFixedFeeUSD;
  const commissionUSD = await computeImportServiceFeeUSD(vehiclePriceUSD);

  // Ce que l'ACHETEUR paie encore, en plus du prix de l'exportateur.
  //
  // La base CIF ci-dessus reste entière, quel que soit le payeur : la douane
  // valorise la marchandise rendue frontière, elle ne s'intéresse pas à qui a
  // réglé le fret. Ce sont les postes RESTANT À CHARGE qui varient — sur une
  // annonce CIF, l'exportateur a déjà facturé fret et assurance, les rajouter
  // au devis de l'acheteur revenait à les compter deux fois.
  //
  // La commission VIT AUTO est toujours due par l'acheteur : elle ne relève
  // d'aucun Incoterm, c'est le prix du service de la plateforme.
  const aCharge = {
    inlandTransport: aLaChargeDeLAcheteur("loadingAtOrigin"),
    seaFreight:      aLaChargeDeLAcheteur("mainCarriage"),
    insurance:       aLaChargeDeLAcheteur("insurance"),
    portFees:        aLaChargeDeLAcheteur("deliveryAtDestination"),
    customs:         aLaChargeDeLAcheteur("importCustoms"),
    delivery:        aLaChargeDeLAcheteur("deliveryAtDestination"),
  };

  const totalServicesUSD =
      (aCharge.inlandTransport ? inlandTransportUSD : 0)
    + (aCharge.seaFreight      ? seaFreightUSD      : 0)
    + (aCharge.insurance       ? insuranceUSD       : 0)
    + (aCharge.portFees        ? portFeesUSD        : 0)
    + (aCharge.customs         ? customsTotalUSD    : 0)
    + (aCharge.delivery        ? deliveryUSD        : 0);
  const grandTotalUSD = vehiclePriceUSD + totalServicesUSD + commissionUSD;

  const toCcy = (amountUSD) => Math.round(amountUSD * rateFromUSD * 100) / 100;

  return {
    available: true,
    currency,
    sourceCountry: sourceCountry || null,
    destCountry,
    destCity: destCity || null,
    laneConfigured: !!lane,
    ageSurchargeApplied: ageSurchargeApplies,
    breakdown: {
      vehiclePrice:    toCcy(vehiclePriceUSD),
      inlandTransport: toCcy(inlandTransportUSD),
      seaFreight:      toCcy(seaFreightUSD),
      insurance:       toCcy(insuranceUSD),
      portFees:        toCcy(portFeesUSD),
      customs:         toCcy(customsTotalUSD),
      delivery:        toCcy(deliveryUSD),
      commission:      toCcy(commissionUSD),

      // Détail du poste « customs », ajouté sans le modifier : les écrans qui
      // affichent déjà le total agrégé restent justes. `customs` mélangeait
      // droits de douane, TVA, transit et redevances en un seul montant — le
      // poste le plus lourd et le plus opaque de l'opération, celui qu'un
      // acheteur veut précisément décomposer avant de s'engager.
      customsDuty: toCcy(customsDutyUSD),
      parafiscal:  toCcy(parafiscalUSD),
      vat:         toCcy(vatUSD),
      transit:     toCcy(config.transitFixedFeeUSD + config.redevancesFixedFeeUSD),
    },

    // Incoterm retenu et postes déjà couverts par le vendeur — l'acheteur doit
    // voir POURQUOI une ligne ne lui est pas facturée, sinon il croit à un
    // oubli et redemande un devis.
    incoterm: incoterm || null,
    borneByBuyer: aCharge,

    // Taux appliqués, pour que l'acheteur puisse recouper le calcul avec le
    // barème officiel de son pays plutôt que de faire confiance à un total.
    importAllowed: true,
    rates: {
      customsDutyPercent: effectiveDutyPercent,
      parafiscalPercent:  config.parafiscalPercent || 0,
      vatPercent:         config.vatPercent,
      insurancePercent:   config.insurancePercent,
      // Nommer l'accord appliqué : un acheteur qui voit 2,5 % au lieu de 17,5 %
      // doit savoir pourquoi, sinon il croit à une erreur.
      preferentialRegime: regimePreferentiel?.label || null,
      origin: origine,
    },
    totalServices: toCcy(totalServicesUSD),
    grandTotal:    toCcy(grandTotalUSD),
    computedAt: new Date(),
  };
}
