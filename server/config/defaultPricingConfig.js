// Valeurs de départ de PricingConfig — source unique partagée entre le script
// de seed (scripts/migrate-currency-config.mjs) et le repli utilisé par
// pricingEngine.getConfig() quand aucun document n'existe encore en base
// (environnement fraîchement déployé sans migration, ou test qui ne seed pas
// explicitement — voir server/tests/setup.js, base réinitialisée après chaque
// test). Un repli en mémoire est préférable à un crash : les vraies valeurs,
// éditables sans redéploiement, restent dans la collection PricingConfig dès
// que la migration a tourné une fois.
export const DEFAULT_PRICING_CONFIG = {
  key: "global",
  commissions: {
    standard: { vente: 0.03, location: 0.15, chauffeur: 0.10, import_export: 0.03, leasing: 0.05 },
    premium:  { vente: 0.02, location: 0.12, chauffeur: 0.08, import_export: 0.02, leasing: 0.04 },
  },
  foundingPartner: {
    durationMonths: 12,
    entreprise:  { location: 0.10, vente: 0.015, import_export: 0.015 },
    particulier: { location: 0.10, vente: 0.02, import_export: null },
  },
  serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
  importEstimateFee: { percent: 0.03, minUSD: 333, maxUSD: 1666 },
  boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
  // Repli des anciens PRIX_OPTIONS FCFA (bookingController.js) convertis au
  // taux ~600 XOF/USD en vigueur à la migration : 10000→16.67, 7000→11.67,
  // 15000→25, 50000→83.33.
  rentalOptions: { gps: 16.67, babySeat: 11.67, insurance: 25, driver: 83.33 },
  subscriptions: {
    individuel_plus: { priceUSD: 9.99 },
    business:         { priceUSD: 19.99 },
    exportateur:      { priceUSD: 49.99 },
  },
  services: {
    inspection:      { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    assurance:        { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    transport:        { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    transit:          { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    douanes:          { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    immatriculation:  { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    garantie:         { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    financement:      { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    sequestre:        { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
    change_devises:   { enabled: true, commissionRate: 0, fixedFeeUSD: 0 },
  },
  ads: {
    banner:            { priceUSD: 10, durationDays: 7 },
    homepage_feature:  { priceUSD: 20, durationDays: 7 },
    category_promo:    { priceUSD: 15, durationDays: 7 },
    seo:               { priceUSD: 25, durationDays: 30 },
  },
};
