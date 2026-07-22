import ImportCostConfig from "../models/ImportCostConfig.js";
import ShippingLaneRate from "../models/ShippingLaneRate.js";
import { getRateFromUSD } from "./currencyEngine.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Frais de service VIT AUTO (Import) — hybride avec plancher/plafond ───────
// Décision produit (2026-07-16) : 3 % du prix du véhicule, plancher 300 €,
// plafond 1 500 €. Distinct de la commission existante prélevée sur le
// partenaire à la libération des fonds (foundingPartnerRates.js) — celle-ci
// est un frais de service facturé à l'ACHETEUR, visible dans son devis.
const COMMISSION_PERCENT = 0.03;
const COMMISSION_MIN_EUR = 300;
const COMMISSION_MAX_EUR = 1500;

export async function computeImportServiceFeeUSD(vehiclePriceUSD) {
  const raw = vehiclePriceUSD * COMMISSION_PERCENT;
  const eurRateFromUSD = await getRateFromUSD("EUR"); // unités EUR pour 1 USD
  const minUSD = COMMISSION_MIN_EUR / eurRateFromUSD;
  const maxUSD = COMMISSION_MAX_EUR / eurRateFromUSD;
  return Math.min(Math.max(raw, minUSD), maxUSD);
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
export async function computeImportCost({ vehiclePrice, currency, sourceCountry, destCountry, destCity, vehicleYear }) {
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
  const effectiveDutyPercent = config.customsDutyPercent + (ageSurchargeApplies ? config.ageSurchargePercent : 0);

  // CIF = Cost + Insurance + Freight, base standard des droits de douane.
  const cifBaseUSD      = vehiclePriceUSD + seaFreightUSD + insuranceUSD;
  const customsDutyUSD  = cifBaseUSD * (effectiveDutyPercent / 100);
  const vatUSD           = (cifBaseUSD + customsDutyUSD) * (config.vatPercent / 100);
  const customsTotalUSD = customsDutyUSD + vatUSD + config.transitFixedFeeUSD + config.redevancesFixedFeeUSD;

  const deliveryUSD   = config.deliveryFixedFeeUSD;
  const commissionUSD = await computeImportServiceFeeUSD(vehiclePriceUSD);

  const totalServicesUSD = inlandTransportUSD + seaFreightUSD + insuranceUSD + portFeesUSD + customsTotalUSD + deliveryUSD;
  const grandTotalUSD    = vehiclePriceUSD + totalServicesUSD + commissionUSD;

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
    },
    totalServices: toCcy(totalServicesUSD),
    grandTotal:    toCcy(grandTotalUSD),
    computedAt: new Date(),
  };
}
