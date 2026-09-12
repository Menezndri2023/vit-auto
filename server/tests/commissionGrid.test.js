import { describe, it, expect, beforeEach } from "vitest";
import { resolveCommissionRate } from "../services/pricingEngine.js";
import PricingConfig from "../models/PricingConfig.js";
import Subscription from "../models/Subscription.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser } from "./helpers/fixtures.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";

// Deux grilles : FONDATEUR pendant douze mois (location 10 %, essai et vente
// 3 %, export 3 %, chauffeur 10 %), puis STANDARD (15 %, 3 %, 5 %, 10 %).
//
// Le point qui compte : la faveur commerciale est déjà portée par l'offre
// Founding Partner, ouverte aux partenaires actuels comme futurs pendant un an.
// Un abonnement ne doit donc pas retrancher 20 % de plus par-dessus — il se
// justifie par ce qu'il apporte, et le plan est accordé sur confirmation du
// support.

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

  it("applique la grille décidée", async () => {
    const p = await createUser({ role: "partenaire" });
    expect(await resolveCommissionRate("location", p._id)).toBe(0.15);
    // Chauffeur : 10 % pour tous (décision de l'exploitant, 2026-09-12).
    expect(await resolveCommissionRate("chauffeur", p._id)).toBe(0.10);
    // 3 % depuis le 2026-09-12 : même taux que la vente par demande d'essai (salesLead).
    expect(await resolveCommissionRate("vente", p._id)).toBe(0.03);
    expect(await resolveCommissionRate("import_export", p._id)).toBe(0.05);
  });

  it("facture un essai au taux de la vente", async () => {
    // `essai` n'a pas de taux propre : il est rattaché à `vente`
    // (pricingEngine.BOOKING_TYPE_TO_PRICING_TYPE). Un taux « essai » distinct
    // ne serait jamais lu.
    const p = await createUser({ role: "partenaire" });
    expect(await resolveCommissionRate("essai", p._id)).toBe(0.03);
  });

  it("un abonné payant ne bénéficie d'AUCUNE réduction supplémentaire", async () => {
    // C'est la décision : les taux sont déjà réduits, l'abonnement n'en
    // retranche plus. Si ce test échoue, c'est qu'une remise est réapparue et
    // que la page Tarifs ment à nouveau.
    const abonne = await abonnePremium();
    const gratuit = await createUser({ role: "partenaire" });

    for (const type of ["location", "chauffeur", "vente", "import_export"]) {
      expect(
        await resolveCommissionRate(type, abonne._id),
        `${type} : l'abonné doit payer le même taux que le compte gratuit`
      ).toBe(await resolveCommissionRate(type, gratuit._id));
    }
  });

  it("reste dans la fourchette 3-5 % pour la vente et l'export", async () => {
    const p = await createUser({ role: "partenaire" });
    for (const type of ["vente", "import_export"]) {
      const taux = await resolveCommissionRate(type, p._id);
      expect(taux, `${type} hors fourchette`).toBeGreaterThanOrEqual(0.03);
      expect(taux, `${type} hors fourchette`).toBeLessThanOrEqual(0.05);
    }
  });

  it("un Founding Partner paie la grille fondateur, chauffeur compris", async () => {
    // Le chauffeur était exclu de la faveur fondateur ; le barème arrêté le
    // couvre désormais.
    const p = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: p._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: new Date() },
    });

    expect(await resolveCommissionRate("location", p._id)).toBe(0.10);
    expect(await resolveCommissionRate("vente", p._id)).toBe(0.03);
    expect(await resolveCommissionRate("import_export", p._id)).toBe(0.03);
    expect(await resolveCommissionRate("chauffeur", p._id)).toBe(0.10);
  });

  it("retombe au standard une fois les douze mois écoulés", async () => {
    const p = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: p._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
    });

    expect(await resolveCommissionRate("location", p._id)).toBe(0.15);
    // Chauffeur : 10 % pour tous (décision de l'exploitant, 2026-09-12).
    expect(await resolveCommissionRate("chauffeur", p._id)).toBe(0.10);
  });

  it("un dossier fondateur SANS date de signature n'accorde aucune réduction", async () => {
    // `!lockedAt` valait auparavant « réduction éternelle » : un brouillon
    // jamais signé donnait le tarif réduit indéfiniment, sans qu'aucun accord
    // n'ait été conclu.
    const p = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({
      userId: p._id, isFoundingPartner: true, legalEntityType: "entreprise",
      commissions: { lockedAt: null },
    });

    expect(await resolveCommissionRate("location", p._id)).toBe(0.15);
  });
});
