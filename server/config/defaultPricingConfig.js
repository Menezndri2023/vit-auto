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
  // GRILLE UNIQUE (exploitant, 2026-10-27) — remplace la grille à deux
  // colonnes du 2026-09-12 (standard 15/5/5/15/15, fondateur 10/3/3/10/10) :
  //   location 10 % · vente (essai, demande d'essai) 2 % · vente de véhicule à
  //   l'export 3 % · pièces détachées 5 % en vente locale, 7 % à l'export
  //   (importée à la commande ou livrée hors du pays du vendeur) · chauffeur
  //   10 % · activités et loisirs 10 %.
  // Une seule clé par transaction, jamais additionnées : une pièce importée
  // paie 7 % (`piece_import`), pas 7 % + 3 % ; une vente export paie 3 %
  // (`import_export`), pas 2 % + 3 %. La logistique (`services.transport`,
  // `services.transit`) reste sans commission tant que son modèle n'est pas
  // décidé. `leasing` est hors du barème du 2026-10-27 : inchangé.
  //
  // `premium` est VOLONTAIREMENT identique à `standard` : l'abonnement ne
  // change rien aux commissions (voir subscription.test.js).
  commissions: {
    standard: { vente: 0.02, location: 0.10, chauffeur: 0.10, import_export: 0.03, leasing: 0.05, activite: 0.10, piece: 0.05, piece_import: 0.07 },
    premium:  { vente: 0.02, location: 0.10, chauffeur: 0.10, import_export: 0.03, leasing: 0.05, activite: 0.10, piece: 0.05, piece_import: 0.07 },
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
    entreprise:  { location: 0.10, vente: 0.02, import_export: 0.03, chauffeur: 0.10, activite: 0.10, piece: 0.05, piece_import: 0.07 },
    particulier: { location: 0.10, vente: 0.02, import_export: 0.03, chauffeur: 0.10, activite: 0.10, piece: 0.05, piece_import: 0.07 },
  },
  serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
  importEstimateFee: { percent: 0.03, minUSD: 333, maxUSD: 1666 },
  boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
  // Repli des anciens PRIX_OPTIONS FCFA (bookingController.js) convertis au
  // taux ~600 XOF/USD en vigueur à la migration : 10000→16.67, 7000→11.67,
  // 15000→25, 50000→83.33.
  rentalOptions: { gps: 16.67, babySeat: 11.67, insurance: 25, driver: 83.33, additionalDriver: 0, unlimitedMileage: 0, airportDelivery: 0 },
  // Fournisseur de chaque option (2026-10-27) : seules les options "vitauto"
  // entrent dans l'assiette de la commission. Toutes sont fournies par le
  // partenaire aujourd'hui (voir models/PricingConfig.js).
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
