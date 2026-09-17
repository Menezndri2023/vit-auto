import { describe, it, expect } from "vitest";
import { computeLocationTotal, moisFactures, tranchesFacturees, JOURS_PAR_MOIS } from "../utils/seasonalPricing.js";

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

// Tarif semaine (2026-09-17, loueurs) : tranches de 7 jours après les mois
// entiers, reliquat journalier plafonné à une semaine, jamais plus cher que
// le journalier.
describe("Tarif semaine — computeLocationTotal", () => {
  const base = { pricePerDay: 50 };

  it("sous 7 jours : ignoré ; 7 jours = une semaine", () => {
    expect(computeLocationTotal({ ...base, pricePerWeek: 280 }, "2026-10-01", 6)).toBe(300);
    expect(computeLocationTotal({ ...base, pricePerWeek: 280 }, "2026-10-01", 7)).toBe(280);
    expect(tranchesFacturees({ ...base, pricePerWeek: 280 }, 7)).toEqual({ mois: 0, semaines: 1 });
  });

  it("10 jours = une semaine + 3 jours au journalier", () => {
    expect(computeLocationTotal({ ...base, pricePerWeek: 280 }, "2026-10-01", 10)).toBe(280 + 150);
  });

  it("le reliquat ne coûte jamais plus qu'une semaine de plus", () => {
    // 6 jours à 50 = 300 > 280 : plafonné.
    expect(computeLocationTotal({ ...base, pricePerWeek: 280 }, "2026-10-01", 13)).toBe(280 + 280);
  });

  it("mois puis semaines puis jours, dans cet ordre", () => {
    const v = { ...base, pricePerMonth: 900, pricePerWeek: 280 };
    // 45 jours = 1 mois (30) + 2 semaines (14) + 1 jour
    expect(computeLocationTotal(v, "2026-10-01", 45)).toBe(900 + 2 * 280 + 50);
    expect(tranchesFacturees(v, 45)).toEqual({ mois: 1, semaines: 2 });
  });

  it("un tarif semaine plus cher que 7 jours ne pénalise jamais le client", () => {
    expect(computeLocationTotal({ ...base, pricePerWeek: 500 }, "2026-10-01", 7)).toBe(350);
  });

  it("sans tarif semaine, le calcul mensuel est strictement inchangé", () => {
    expect(computeLocationTotal({ ...base, pricePerMonth: 900 }, "2026-10-01", 45)).toBe(900 + 15 * 50);
  });
});
