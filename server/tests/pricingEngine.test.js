import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveCommissionRate, computeServiceFee, getBoostPrice, getSubscriptionPrice, getServiceConfig,
} from "../services/pricingEngine.js";
import PricingConfig from "../models/PricingConfig.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import Subscription from "../models/Subscription.js";
import { createUser } from "./helpers/fixtures.js";

const seedPricingConfig = () => PricingConfig.create({
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
  boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
  subscriptions: {
    individuel_plus: { priceUSD: 9.99 },
    business:         { priceUSD: 19.99 },
    exportateur:      { priceUSD: 49.99 },
  },
  services: { inspection: { enabled: true, commissionRate: 0.05, fixedFeeUSD: 0 } },
  ads: { banner: { priceUSD: 10, durationDays: 7 } },
});

beforeEach(async () => {
  await seedPricingConfig();
});

describe("resolveCommissionRate", () => {
  it("renvoie le taux standard pour un partenaire sans abonnement ni statut fondateur", async () => {
    const owner = await createUser({ role: "partenaire" });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.15);
    expect(await resolveCommissionRate("essai", owner._id)).toBe(0.03); // "essai" → vente
    expect(await resolveCommissionRate("chauffeur", owner._id)).toBe(0.10);
    expect(await resolveCommissionRate("leasing", owner._id)).toBe(0.05);
  });

  it("renvoie le taux premium si le partenaire a un abonnement payant actif", async () => {
    const owner = await createUser({ role: "partenaire" });
    await Subscription.create({ vendor: owner._id, plan: "business" });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.12);
    expect(await resolveCommissionRate("essai", owner._id)).toBe(0.02);
  });

  it("un abonnement 'free' n'active PAS le taux premium", async () => {
    const owner = await createUser({ role: "partenaire" });
    await Subscription.create({ vendor: owner._id, plan: "free" });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.15);
  });

  it("applique le taux Founding Partner actif (profil entreprise) sur location/vente", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true });
    await PartnerOnboarding.create({
      userId: owner._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: new Date() },
    });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.10);
    expect(await resolveCommissionRate("essai", owner._id)).toBe(0.015);
  });

  it("applique le taux Founding Partner (profil particulier), différent de entreprise", async () => {
    const owner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: owner._id, isFoundingPartner: true, legalEntityType: "particulier",
      commissions: { lockedAt: new Date() },
    });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.10);
    expect(await resolveCommissionRate("essai", owner._id)).toBe(0.02);
  });

  it("ne s'applique jamais à chauffeur/leasing même si Founding Partner actif", async () => {
    const owner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: owner._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: new Date() },
    });
    expect(await resolveCommissionRate("chauffeur", owner._id)).toBe(0.10); // taux standard
    expect(await resolveCommissionRate("leasing", owner._id)).toBe(0.05);   // taux standard
  });

  it("retombe au taux standard après expiration de la fenêtre Founding Partner", async () => {
    const owner = await createUser({ role: "partenaire" });
    const thirteenMonthsAgo = new Date(Date.now() - 13 * 30.4375 * 24 * 60 * 60 * 1000);
    await PartnerOnboarding.create({
      userId: owner._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: thirteenMonthsAgo },
    });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.15); // standard, pas 0.10
    expect(await resolveCommissionRate("essai", owner._id)).toBe(0.03);
  });

  it("lockedAt absent (Accord pas encore signé) est traité comme fenêtre active", async () => {
    const owner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: owner._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: null },
    });
    expect(await resolveCommissionRate("location", owner._id)).toBe(0.10);
  });

  it("import_export : Founding Partner entreprise a un taux dédié, particulier retombe au standard/premium", async () => {
    const entrepriseOwner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: entrepriseOwner._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: new Date() },
    });
    expect(await resolveCommissionRate("import_export", entrepriseOwner._id)).toBe(0.015);

    const particulierOwner = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: particulierOwner._id, isFoundingPartner: true, legalEntityType: "particulier",
      commissions: { lockedAt: new Date() },
    });
    expect(await resolveCommissionRate("import_export", particulierOwner._id)).toBe(0.03); // standard, pas de taux fondateur particulier pour import_export
  });
});

describe("computeServiceFee", () => {
  it("applique le plancher minUSD pour un petit montant", async () => {
    expect(await computeServiceFee(50)).toBe(1); // 0.5% de 50 = 0.25 < 1
  });

  it("applique le pourcentage pour un montant intermédiaire", async () => {
    expect(await computeServiceFee(2000)).toBe(10); // 0.5% de 2000 = 10
  });

  it("applique le plafond maxUSD pour un gros montant", async () => {
    expect(await computeServiceFee(100000)).toBe(25); // 0.5% de 100000 = 500 > 25
  });
});

describe("getters de configuration", () => {
  it("getBoostPrice/getSubscriptionPrice/getServiceConfig renvoient les valeurs seedées", async () => {
    expect(await getBoostPrice("24h")).toBe(2);
    expect(await getBoostPrice("international")).toBe(20);
    expect(await getSubscriptionPrice("business")).toBe(19.99);
    expect(await getServiceConfig("inspection")).toEqual({ enabled: true, commissionRate: 0.05, fixedFeeUSD: 0 });
    expect(await getBoostPrice("inexistant")).toBeNull();
  });
});
