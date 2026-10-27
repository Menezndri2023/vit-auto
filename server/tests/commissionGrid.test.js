import { describe, it, expect, beforeEach } from "vitest";
import { resolveCommissionRate, getServiceConfig } from "../services/pricingEngine.js";
import PricingConfig from "../models/PricingConfig.js";
import Subscription from "../models/Subscription.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser } from "./helpers/fixtures.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { appliquerGrilleUnique } from "../scripts/setCommissionRates.mjs";

// Grille UNIQUE (exploitant, 2026-10-27) : location 10 %, vente et essai 2 %,
// vente de véhicule à l'export 3 %, pièces détachées 5 % en local et 7 % à
// l'export, chauffeur 10 %, activités et loisirs 10 %. Fondateur = standard,
// abonné = standard. La logistique n'a pas de taux décidé : aucune commission.

const GRILLE = {
  location: 0.10, vente: 0.02, essai: 0.02, import_export: 0.03,
  piece: 0.05, piece_import: 0.07, chauffeur: 0.10, activite: 0.10,
};

const abonnePremium = async () => {
  const partenaire = await createUser({ role: "partenaire" });
  await Subscription.create({
    vendor: partenaire._id, plan: "business",
    planDetails: {
      startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000),
      isActive: true, priceUSD: 19.99,
    },
  });
  return partenaire;
};

describe("Grille de commissions", () => {
  beforeEach(async () => {
    await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global" });
  });

  it("applique la grille décidée, une ligne par activité", async () => {
    const p = await createUser({ role: "partenaire" });
    for (const [type, taux] of Object.entries(GRILLE)) {
      expect(await resolveCommissionRate(type, p._id), type).toBe(taux);
    }
  });

  it("le même barème s'applique sans document en base (repli par défaut)", async () => {
    await PricingConfig.deleteMany({});
    const p = await createUser({ role: "partenaire" });
    for (const [type, taux] of Object.entries(GRILLE)) {
      expect(await resolveCommissionRate(type, p._id), type).toBe(taux);
    }
  });

  it("aucun cumul : une transaction ne porte qu'un seul taux", async () => {
    // Une pièce exportée paie 7 %, pas 7 % + 3 % ; une vente à l'export paie
    // 3 %, pas 2 % + 3 %. Le moteur renvoie UN taux par clé, et la clé est
    // choisie une fois par transaction (cleCommission, ieTransactionController).
    const p = await createUser({ role: "partenaire" });
    expect(await resolveCommissionRate("piece_import", p._id)).toBe(0.07);
    expect(await resolveCommissionRate("import_export", p._id)).toBe(0.03);
    expect(await resolveCommissionRate("import_export", p._id))
      .toBeLessThan(GRILLE.vente + GRILLE.import_export);
  });

  it("la logistique n'a aucune commission automatique", async () => {
    // Taux logistique non décidé : transport et transit restent à zéro, sans
    // forfait — le prix du transport reste celui du prestataire.
    for (const service of ["transport", "transit", "douanes"]) {
      const cfg = await getServiceConfig(service);
      expect(cfg.commissionRate, service).toBe(0);
      expect(cfg.fixedFeeUSD, service).toBe(0);
    }
  });

  it("un abonné payant ne bénéficie d'AUCUNE réduction supplémentaire", async () => {
    const abonne = await abonnePremium();
    const gratuit = await createUser({ role: "partenaire" });
    for (const type of Object.keys(GRILLE)) {
      expect(
        await resolveCommissionRate(type, abonne._id),
        `${type} : l'abonné doit payer le même taux que le compte gratuit`
      ).toBe(await resolveCommissionRate(type, gratuit._id));
    }
  });

  it("un Founding Partner paie la même grille, et jamais plus", async () => {
    const p = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: p._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: new Date() },
    });
    for (const [type, taux] of Object.entries(GRILLE)) {
      expect(await resolveCommissionRate(type, p._id), type).toBe(taux);
    }
  });

  it("la fenêtre fondateur expirée ne change rien non plus", async () => {
    const p = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: p._id, isFoundingPartner: true, legalEntityType: "particulier",
      commissions: { lockedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
    });
    for (const [type, taux] of Object.entries(GRILLE)) {
      expect(await resolveCommissionRate(type, p._id), type).toBe(taux);
    }
  });
});

describe("Migration vers la grille unique", () => {
  // Le document de production porte l'ancienne grille et l'emporte sur les
  // valeurs par défaut : c'est lui que la migration doit réécrire.
  const ANCIENNE = {
    ...DEFAULT_PRICING_CONFIG,
    key: "global",
    commissions: {
      standard: { vente: 0.05, location: 0.15, chauffeur: 0.15, import_export: 0.05, leasing: 0.06, activite: 0.15, piece: 0.10, piece_import: 0.07 },
      premium:  { vente: 0.05, location: 0.15, chauffeur: 0.15, import_export: 0.05, leasing: 0.06, activite: 0.15, piece: 0.10, piece_import: 0.07 },
    },
    foundingPartner: {
      durationMonths: 12,
      entreprise:  { location: 0.10, vente: 0.03, import_export: 0.03, chauffeur: 0.10, activite: 0.10, piece: 0.07, piece_import: 0.05 },
      particulier: { location: 0.10, vente: 0.03, import_export: 0.03, chauffeur: 0.10, activite: 0.10, piece: 0.07, piece_import: 0.05 },
    },
  };

  it("réécrit le barème en base, conserve le leasing et les dossiers personnalisés", async () => {
    await PricingConfig.create(ANCIENNE);
    const standardP = await createUser({ role: "partenaire" });
    const fondateur = await createUser({ role: "partenaire" });
    const negocie   = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({ userId: fondateur._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { location: 10, vente: 3, chauffeur: 10, lockedAt: new Date() } });
    await PartnerOnboarding.create({ userId: negocie._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { location: 8, vente: 1, chauffeur: 8, lockedAt: new Date() } });

    expect(await resolveCommissionRate("location", standardP._id)).toBe(0.15);

    await appliquerGrilleUnique();

    for (const [type, taux] of Object.entries(GRILLE)) {
      expect(await resolveCommissionRate(type, standardP._id), type).toBe(taux);
      expect(await resolveCommissionRate(type, fondateur._id), `fondateur ${type}`).toBe(taux);
    }
    const cfg = await PricingConfig.findOne({ key: "global" }).lean();
    expect(cfg.commissions.standard.leasing).toBe(0.06);
    expect(cfg.commissions.premium.leasing).toBe(0.06);
    expect(cfg.boosts).toEqual(DEFAULT_PRICING_CONFIG.boosts);

    const dFond = await PartnerOnboarding.findOne({ userId: fondateur._id }).lean();
    expect(dFond.commissions).toMatchObject({ location: 10, vente: 2, chauffeur: 10 });
    const dNeg = await PartnerOnboarding.findOne({ userId: negocie._id }).lean();
    expect(dNeg.commissions).toMatchObject({ location: 8, vente: 1, chauffeur: 8 });
  });

  it("est idempotente et sans effet sans document en base", async () => {
    await expect(appliquerGrilleUnique()).resolves.toEqual({ modifie: false });
    await PricingConfig.create(ANCIENNE);
    await appliquerGrilleUnique();
    const une = await PricingConfig.findOne({ key: "global" }).lean();
    await appliquerGrilleUnique();
    const deux = await PricingConfig.findOne({ key: "global" }).lean();
    expect(deux.commissions).toEqual(une.commissions);
    expect(deux.foundingPartner).toEqual(une.foundingPartner);
  });

  it("la simulation n'écrit rien", async () => {
    await PricingConfig.create(ANCIENNE);
    await appliquerGrilleUnique({ apply: false });
    const cfg = await PricingConfig.findOne({ key: "global" }).lean();
    expect(cfg.commissions.standard.location).toBe(0.15);
  });
});
