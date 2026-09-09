import { describe, it, expect, beforeEach } from "vitest";
import { resolveCommissionRate } from "../services/pricingEngine.js";
import PricingConfig from "../models/PricingConfig.js";
import Subscription from "../models/Subscription.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser } from "./helpers/fixtures.js";

// Grille de commissions : location 15 %, essai et vente 3 %, export 3 %,
// chauffeur 15 %.
//
// Le point qui compte : ces taux SONT déjà les taux réduits consentis aux
// partenaires. Un abonnement ne doit donc plus retrancher quoi que ce soit
// par-dessus — il se justifie par ce qu'il apporte, pas par une remise.

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
    expect(await resolveCommissionRate("chauffeur", p._id)).toBe(0.15);
    expect(await resolveCommissionRate("vente", p._id)).toBe(0.03);
    expect(await resolveCommissionRate("import_export", p._id)).toBe(0.03);
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
});
