import { describe, it, expect } from "vitest";
import { computeLocationTotal, moisFactures, JOURS_PAR_MOIS } from "../utils/seasonalPricing.js";

// Tarif mensuel facultatif (2026-09-16) : demande de l'exploitant pour les
// loueurs (et les chauffeurs, voir bookingController UNITES.mois). Les règles
// à protéger : rien ne change sans tarif mois ou sous 30 jours ; chaque
// tranche de 30 jours est au tarif mois ; le reste est journalier mais jamais
// plus cher qu'un mois ; le total ne dépasse jamais le calcul journalier.
describe("Tarif mensuel — computeLocationTotal", () => {
  const base = { pricePerDay: 50 };

  it("sans tarif mois : calcul journalier strictement inchangé", () => {
    expect(computeLocationTotal(base, "2026-10-01", 45)).toBe(50 * 45);
    expect(computeLocationTotal({ ...base, pricePerMonth: null }, "2026-10-01", 45)).toBe(50 * 45);
  });

  it("sous 30 jours : le tarif mois est ignoré", () => {
    expect(computeLocationTotal({ ...base, pricePerMonth: 900 }, "2026-10-01", 29)).toBe(50 * 29);
    expect(moisFactures({ ...base, pricePerMonth: 900 }, 29)).toBe(0);
  });

  it("30 jours = un mois au tarif mois", () => {
    expect(computeLocationTotal({ ...base, pricePerMonth: 900 }, "2026-10-01", JOURS_PAR_MOIS)).toBe(900);
    expect(moisFactures({ ...base, pricePerMonth: 900 }, 30)).toBe(1);
  });

  it("45 jours = un mois + 15 jours au tarif journalier", () => {
    expect(computeLocationTotal({ ...base, pricePerMonth: 900 }, "2026-10-01", 45)).toBe(900 + 15 * 50);
  });

  it("le reste ne coûte jamais plus qu'un mois supplémentaire", () => {
    // 29 jours restants à 50 = 1 450 > 900 : plafonné à un mois.
    expect(computeLocationTotal({ ...base, pricePerMonth: 900 }, "2026-10-01", 59)).toBe(900 + 900);
  });

  it("un tarif mois plus cher que 30 jours ne pénalise jamais le client", () => {
    expect(computeLocationTotal({ ...base, pricePerMonth: 2000 }, "2026-10-01", 30)).toBe(1500);
  });

  it("la promotion partenaire s'applique au reste journalier, pas au mois", () => {
    const v = { ...base, pricePerMonth: 900, promotions: [{ type: "percent", value: 10, minDays: 1, active: true }] };
    // reste 10 jours à 50 −10 % = 450
    expect(computeLocationTotal(v, "2026-10-01", 40)).toBe(900 + 450);
  });
});
