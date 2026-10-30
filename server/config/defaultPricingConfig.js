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
  // GRILLE OFFICIELLE (exploitant, 2026-10-30) — remplace celle du 27/10 :
  //   location 10 % · vente de véhicules 2 % (y compris importé ou exporté —
  //   Vehicle Trade) · pièces détachées 5 % (locale ou export — Parts Trade) ·
  //   chauffeur 10 % · loisirs 10 % · logistique 0 % au lancement.
  // `import_export` (3 %, « transactions générales éligibles ») reste
  // configuré mais ne s'applique à AUCUNE transaction actuelle : il ne
  // s'ajoute jamais aux catégories — une vente de véhicule importé paie 2 %,
  // pas 2 % + 3 % ni 3 %. `piece_import` est conservé comme clé, au taux des
  // pièces (5 %). Une seule clé par transaction. `leasing` hors grille : 5 %.
  //
  // `premium` est VOLONTAIREMENT identique à `standard` : l'abonnement ne
  // change rien aux commissions (voir subscription.test.js).
  commissions: {
    standard: { vente: 0.02, location: 0.10, chauffeur: 0.10, import_export: 0.03, leasing: 0.05, activite: 0.10, piece: 0.05, piece_import: 0.05 },
    premium:  { vente: 0.02, location: 0.10, chauffeur: 0.10, import_export: 0.03, leasing: 0.05, activite: 0.10, piece: 0.05, piece_import: 0.05 },
  },
  // Grille FONDATEUR — depuis le 2026-10-27, IDENTIQUE au standard : la
  // nouvelle grille est égale ou inférieure à l'ancienne grille fondateur sur
  // chaque ligne, donc aucun fondateur ne paie plus qu'avant. L'avantage
  // fondateur n'est plus tarifaire (accompagnement, badge, mise en avant).
  // Le mécanisme (douze mois à compter de PartnerOnboarding.commissions.lockedAt)
  // est conservé : un tarif fondateur futur, s'il est décidé, reste
  // configurable, limité dans le temps et traçable sans toucher au code.
  foundingPartner: {
    durationMonths: 12,
    // Grille officielle du 2026-10-30 : identique pour tous, fondateurs compris
    // (pièces 5 %, export compris).
    entreprise:  { location: 0.10, vente: 0.02, import_export: 0.03, chauffeur: 0.10, activite: 0.10, piece: 0.05, piece_import: 0.05 },
    particulier: { location: 0.10, vente: 0.02, import_export: 0.03, chauffeur: 0.10, activite: 0.10, piece: 0.05, piece_import: 0.05 },
  },
  // Frais de service SUSPENDUS (2026-10-30) — barèmes conservés, inactifs.
  // Ils se cumulaient avec la commission (achat direct export : 3 % de frais
  // acheteur + 3 % de commission exportateur) et leur payeur n'était pas
  // tranché (location : retirés au partenaire, affichés au client).
  serviceFee: { actif: false, minUSD: 1, percent: 0.005, maxUSD: 25 },
  importEstimateFee: { actif: false, percent: 0.03, minUSD: 333, maxUSD: 1666 },
  boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
  // Repli des anciens PRIX_OPTIONS FCFA (bookingController.js) convertis au
  // taux ~600 XOF/USD en vigueur à la migration : 10000→16.67, 7000→11.67,
  // 15000→25, 50000→83.33.
  rentalOptions: { gps: 16.67, babySeat: 11.67, insurance: 25, driver: 83.33, additionalDriver: 0, unlimitedMileage: 0, airportDelivery: 0 },
  // Fournisseur de chaque option (2026-10-27) : seules les options "vitauto"
  // entrent dans l'assiette de la commission. Toutes sont fournies par le
  // partenaire aujourd'hui (voir models/PricingConfig.js).
  // Logistique : mise en relation gratuite, verrouillée (models/PricingConfig.js).
  logistique: { modeEconomique: "FREE_REFERRAL", commissionActive: false, taux: null, fraisMiseEnRelationUSD: null },
  rentalOptionsFournisseur: { gps: "partenaire", babySeat: "partenaire", insurance: "partenaire", driver: "partenaire", additionalDriver: "partenaire", unlimitedMileage: "partenaire", airportDelivery: "partenaire" },
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
  // Vente par demande d'essai — commission = ligne `vente` de la grille
  // (2 %) ; ici seulement attribution 90 jours et délais
  // (voir docs/vente-demande-essai.md).
  salesLead: {
    attributionDays: 90,
    responseSlaMinutes: 120,
    escalationMinutes: 360,
    adminInterventionMinutes: 1440,
    mediumValueUSD: 15000,
    highValueUSD: 40000,
    directTransmission: true,
    level2AutoSendMinutes: 240,
    staleAfterDays: 14,
    contactDisclosureStage: "PARTNER_ACCEPTED",
  },
  ads: {
    banner:            { priceUSD: 10, durationDays: 7 },
    homepage_feature:  { priceUSD: 20, durationDays: 7 },
    category_promo:    { priceUSD: 15, durationDays: 7 },
    seo:               { priceUSD: 25, durationDays: 30 },
  },
};
