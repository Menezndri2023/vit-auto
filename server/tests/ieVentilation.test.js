import { describe, it, expect } from "vitest";
import { ventilerDevis } from "../services/importCostEngine.js";

describe("ventilation d'un devis d'import", () => {
  const breakdown = { vehiclePrice: 20000, inlandTransport: 300, seaFreight: 1500, insurance: 200, portFees: 400, customs: 8000, delivery: 250, commission: 600 };

  it("annonce FOB : l'acheteur paie fret, assurance, port, douane, livraison", () => {
    const borneByBuyer = { inlandTransport: false, seaFreight: true, insurance: true, portFees: true, customs: true, delivery: true };
    const grandTotal = 20000 + 1500 + 200 + 400 + 8000 + 250 + 600;
    const v = ventilerDevis({ breakdown, borneByBuyer, grandTotal, currency: "USD" });
    expect(v).toEqual({ exportateur: 20000, logistique: 2350, droitsTaxes: 8000, fraisVitAuto: 600, currency: "USD" });
    expect(v.exportateur + v.logistique + v.droitsTaxes + v.fraisVitAuto).toBe(grandTotal);
  });

  it("annonce CIF : fret et assurance déjà dans le prix de l'exportateur, jamais refacturés", () => {
    const borneByBuyer = { inlandTransport: false, seaFreight: false, insurance: false, portFees: true, customs: true, delivery: true };
    const grandTotal = 20000 + 400 + 8000 + 250 + 600;
    const v = ventilerDevis({ breakdown, borneByBuyer, grandTotal, currency: "USD" });
    expect(v.logistique).toBe(650);
    expect(v.exportateur + v.logistique + v.droitsTaxes + v.fraisVitAuto).toBe(grandTotal);
  });
});
