import { describe, it, expect, beforeEach } from "vitest";
import ImportCostConfig from "../models/ImportCostConfig.js";
import ShippingLaneRate from "../models/ShippingLaneRate.js";
import ExchangeRate from "../models/ExchangeRate.js";
import { computeImportCost } from "../services/importCostEngine.js";
import { EU_ORIGINS } from "../constants/importOrigins.js";

// Barème d'importation marocain — valeurs réelles, pas des ordres de grandeur.
//
// Le moteur produisait auparavant un taux unique par pays de destination, sans
// taxe parafiscale et sans limite d'âge. Trois écarts avec la réglementation
// marocaine, chacun suffisant à rendre le devis faux :
//
//  1. Le droit d'importation dépend de l'ORIGINE. Un véhicule d'origine UE
//     relève de l'accord d'association (taux très réduit) quand un véhicule
//     chinois paie le taux plein — 17,5 % contre 2,5 % sur la même voiture.
//  2. La taxe parafiscale (0,25 % du CIF) entre DANS l'assiette de la TVA.
//     L'omettre sous-évaluait la TVA elle-même, pas seulement son montant.
//  3. Un véhicule particulier de plus de 5 ans ne peut PAS être importé. Ce
//     n'est pas une surtaxe : il est refusé. Chiffrer une importation
//     impossible est la pire des réponses possibles.
//
// Référence du cumul hors UE : 17,5 + 0,25 + 20 % × (100 + 17,5 + 0,25) = 41,30 %
// de la valeur CIF.

const MAROC = {
  country: "Maroc",
  customsDutyPercent: 17.5,      // origine sans accord (Chine, Japon, Émirats…)
  parafiscalPercent: 0.25,
  vatPercent: 20,
  maxVehicleAgeYears: 5,
  preferentialDuty: [{ label: "Accord d'association UE", origins: EU_ORIGINS, percent: 2.5 }],
  // Neutralisés pour isoler la fiscalité dans ces tests.
  transitFixedFeeUSD: 0, redevancesFixedFeeUSD: 0, portFeesFixedUSD: 0,
  deliveryFixedFeeUSD: 0, insurancePercent: 0, defaultSeaFreightUSD: 0,
  ageSurchargePercent: 0,
};

const ANNEE_COURANTE = new Date().getFullYear();

describe("Barème marocain — droits, parafiscale, TVA", () => {
  beforeEach(async () => {
    await ImportCostConfig.deleteMany({});
    await ShippingLaneRate.deleteMany({});
    await ExchangeRate.deleteMany({});
    await ImportCostConfig.create(MAROC);
  });

  const calcul = (over = {}) => computeImportCost({
    vehiclePrice: 10000, currency: "USD",
    sourceCountry: "Chine", destCountry: "Maroc",
    vehicleYear: ANNEE_COURANTE, incoterm: null,
    ...over,
  });

  it("véhicule chinois : cumul de 41,30 % de la valeur CIF", async () => {
    const r = await calcul();
    expect(r.available).toBe(true);

    // Fret, assurance et frais annexes neutralisés : CIF = prix véhicule.
    // Le transport intérieur (150 $ par défaut) reste hors assiette douanière.
    const cif = 10000;
    const droits     = cif * 0.175;                   // 1750
    const parafiscal = cif * 0.0025;                  // 25
    const tva        = (cif + droits + parafiscal) * 0.20;  // 2355

    expect(r.breakdown.customsDuty).toBeCloseTo(droits, 2);
    expect(r.breakdown.parafiscal).toBeCloseTo(parafiscal, 2);
    expect(r.breakdown.vat).toBeCloseTo(tva, 2);
    expect(r.breakdown.customs).toBeCloseTo(droits + parafiscal + tva, 2);

    // 41,30 % — le chiffre publié par les sources douanières marocaines.
    expect((droits + parafiscal + tva) / cif).toBeCloseTo(0.4130, 4);
  });

  it("véhicule d'origine UE : 2,5 % au lieu de 17,5 %, et l'accord est nommé", async () => {
    const r = await calcul({ sourceCountry: "France" });

    expect(r.rates.customsDutyPercent).toBe(2.5);
    expect(r.rates.preferentialRegime, "l'acheteur doit savoir POURQUOI le taux baisse")
      .toBe("Accord d'association UE");
    expect(r.breakdown.customsDuty).toBeCloseTo(250, 2);
  });

  it("l'origine est reconnue malgré les graphies libres de la base", async () => {
    // sourceCountry contient « CHINA », « china », « chi'na », « 中国 »…
    for (const graphie of ["Chine", "China", "china", "CHINA", "chi'na", "中国"]) {
      const r = await calcul({ sourceCountry: graphie });
      expect(r.rates.origin, `« ${graphie} » doit être reconnu comme CN`).toBe("CN");
      expect(r.rates.customsDutyPercent).toBe(17.5);
    }
  });

  it("une origine inconnue retombe sur le taux plein, jamais sur le préférentiel", async () => {
    // Se tromper dans ce sens coûte au client ; l'inverse coûterait à VIT AUTO
    // une taxe non provisionnée, découverte au port.
    const r = await calcul({ sourceCountry: "Ouganda" });
    expect(r.rates.origin).toBeNull();
    expect(r.rates.customsDutyPercent).toBe(17.5);
  });

  it("au-delà de 5 ans, l'importation est REFUSÉE — aucun prix n'est calculé", async () => {
    const r = await calcul({ vehicleYear: ANNEE_COURANTE - 8 });

    expect(r.available).toBe(false);
    expect(r.importAllowed).toBe(false);
    expect(r.reason).toBe("AGE_LIMIT");
    expect(r.maxVehicleAgeYears).toBe(5);
    expect(r.message).toMatch(/5 ans/);
    expect(r.grandTotal, "aucun total ne doit être annoncé pour un import impossible").toBeUndefined();
  });

  it("à exactement 5 ans, l'importation reste possible", async () => {
    const r = await calcul({ vehicleYear: ANNEE_COURANTE - 5 });
    expect(r.available).toBe(true);
    expect(r.importAllowed).toBe(true);
  });

  it("sans barème pour le pays, rien n'est inventé", async () => {
    const r = await computeImportCost({
      vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
      destCountry: "Sénégal", vehicleYear: ANNEE_COURANTE,
    });
    expect(r.available).toBe(false);
    expect(r.message).toMatch(/Aucun barème/i);
    expect(r.grandTotal).toBeUndefined();
  });
});
