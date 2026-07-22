import PricingConfig from "../models/PricingConfig.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import Subscription from "../models/Subscription.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";

// Moteur central de tarification — remplace les constantes en dur dispersées
// dans bookingController.js (COMMISSION_RATES), ieTransactionController.js et
// server/utils/foundingPartnerRates.js. Toute règle commerciale vit désormais
// dans PricingConfig (un seul document "global", éditable admin sans
// redéploiement — voir routes/businessConfig.js).

// Repli sur DEFAULT_PRICING_CONFIG si aucun document n'existe encore (avant la
// première exécution de scripts/migrate-currency-config.mjs, ou base de test
// qui ne le seed pas explicitement) — cohérent avec le reste du code (jamais
// de crash pour une fonctionnalité non encore configurée, voir
// smsConfigured.js/emailVerificationRequired.js).
export async function getConfig() {
  const config = await PricingConfig.findOne({ key: "global" }).lean();
  return config || DEFAULT_PRICING_CONFIG;
}

// "essai" (type de Booking pour une vente/essai véhicule) porte la commission
// de vente — convention héritée de l'ancien système, conservée à l'identique
// (voir Article 3 de l'Agreement Founding Partner, generateAgreement()).
const BOOKING_TYPE_TO_PRICING_TYPE = {
  location:  "location",
  essai:     "vente",
  chauffeur: "chauffeur",
  leasing:   "leasing",
};

async function isFoundingPartnerActive(userId) {
  if (!userId) return null;
  const fp = await PartnerOnboarding.findOne({ userId, isFoundingPartner: true })
    .select("commissions.lockedAt legalEntityType")
    .lean();
  if (!fp) return null;
  return fp;
}

async function hasPremiumSubscription(userId) {
  if (!userId) return false;
  const sub = await Subscription.findOne({ vendor: userId }).lean();
  return !!(sub && sub.plan && sub.plan !== "free");
}

// `type` : "location" | "essai" | "chauffeur" | "leasing" (types de Booking)
// OU directement "location"/"vente"/"import_export" pour les autres appelants
// (ieTransactionController). `ownerId` : propriétaire du véhicule/de l'annonce
// (celui dont dépend un éventuel statut Founding Partner), pas le client.
export async function resolveCommissionRate(type, ownerId) {
  const pricingType = BOOKING_TYPE_TO_PRICING_TYPE[type] || type;
  const config = await getConfig();

  // Founding Partner ne s'applique qu'à location/vente/import_export (jamais
  // chauffeur/leasing — voir Article 3 de l'Agreement).
  if (["location", "vente", "import_export"].includes(pricingType)) {
    const fp = await isFoundingPartnerActive(ownerId);
    if (fp) {
      const durationMs = config.foundingPartner.durationMonths * 30.4375 * 24 * 60 * 60 * 1000;
      const lockedAt = fp.commissions?.lockedAt;
      const stillActive = !lockedAt || (Date.now() - new Date(lockedAt).getTime()) < durationMs;
      if (stillActive) {
        const tier = fp.legalEntityType === "particulier" ? "particulier" : "entreprise";
        const rate = config.foundingPartner[tier]?.[pricingType];
        if (rate != null) return rate;
      }
      // Fenêtre expirée : retombe au tarif standard/premium ci-dessous (pas de
      // palier intermédiaire — "retour automatique aux commissions standard").
    }
  }

  if (await hasPremiumSubscription(ownerId)) {
    return config.commissions.premium[pricingType] ?? config.commissions.standard[pricingType] ?? 0.05;
  }
  return config.commissions.standard[pricingType] ?? 0.05;
}

export async function computeServiceFee(amountUSD) {
  const config = await getConfig();
  const { minUSD, percent, maxUSD } = config.serviceFee;
  return Math.min(Math.max(minUSD, amountUSD * percent), maxUSD);
}

export async function getBoostPrice(tier) {
  const config = await getConfig();
  return config.boosts[tier] ?? null;
}

export async function getSubscriptionPrice(tier) {
  const config = await getConfig();
  return config.subscriptions[tier]?.priceUSD ?? null;
}

export async function getServiceConfig(serviceKey) {
  const config = await getConfig();
  return config.services[serviceKey] ?? null;
}

export async function getAdConfig(adKey) {
  const config = await getConfig();
  return config.ads[adKey] ?? null;
}

// Options de location véhicule (gps/babySeat/insurance/driver) — remplace
// PRIX_OPTIONS en dur dans bookingController.js. `option` : une des 4 clés
// ci-dessus, prix fixe par jour de location en USD.
export async function getRentalOptionPrice(option) {
  const config = await getConfig();
  return config.rentalOptions?.[option] ?? 0;
}
