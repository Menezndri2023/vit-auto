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
  // Grille STANDARD, applicable une fois la fenêtre fondateur écoulée :
  // location 15 %, essai et vente 5 %, export 5 %, chauffeur 15 %. `essai` est
  // facturé au taux `vente` (voir pricingEngine) — il n'a pas de taux propre.
  //
  // `premium` est VOLONTAIREMENT identique à `standard`. La faveur commerciale
  // est déjà portée par l'offre Founding Partner — ouverte aux partenaires
  // actuels comme futurs, pendant un an (foundingPartner.durationMonths). Un
  // abonnement n'a donc pas à retrancher 20 % de plus par-dessus : il se
  // justifie par ce qu'il APPORTE, et le plan choisi est accordé dès que le
  // support l'a confirmé. Le mécanisme premium reste en place et pourra
  // reprendre du sens si une remise d'abonnement est décidée un jour.
  commissions: {
    standard: { vente: 0.05, location: 0.15, chauffeur: 0.15, import_export: 0.05, leasing: 0.05 },
    premium:  { vente: 0.05, location: 0.15, chauffeur: 0.15, import_export: 0.05, leasing: 0.05 },
  },
  // Grille FONDATEUR — la faveur commerciale, pendant douze mois à compter de
  // la SIGNATURE de l'accord (PartnerOnboarding.commissions.lockedAt). Au-delà,
  // retour automatique au standard ci-dessus, sans palier intermédiaire.
  //
  // Même grille pour les deux types d'entité : le barème arrêté ne distingue
  // pas. Le chauffeur y figure désormais — il en était exclu — et l'export d'un
  // particulier, auparavant absent (retour au standard), y est explicite.
  foundingPartner: {
    durationMonths: 12,
    entreprise:  { location: 0.10, vente: 0.03, import_export: 0.03, chauffeur: 0.10 },
    particulier: { location: 0.10, vente: 0.03, import_export: 0.03, chauffeur: 0.10 },
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
  // Vente par demande d'essai — 3 % du prix final, attribution 90 jours,
  // réponse partenaire attendue sous 2 h (voir docs/vente-demande-essai.md).
  salesLead: {
    commissionRate: 0.03,
    attributionDays: 90,
    responseSlaMinutes: 120,
    escalationMinutes: 360,
    adminInterventionMinutes: 1440,
    mediumValueUSD: 15000,
    highValueUSD: 40000,
    level2AutoSendMinutes: 240,
    contactDisclosureStage: "PARTNER_ACCEPTED",
  },
  ads: {
    banner:            { priceUSD: 10, durationDays: 7 },
    homepage_feature:  { priceUSD: 20, durationDays: 7 },
    category_promo:    { priceUSD: 15, durationDays: 7 },
    seo:               { priceUSD: 25, durationDays: 30 },
  },
};
