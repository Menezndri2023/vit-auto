import { describe, it, expect, beforeEach } from "vitest";
import ImportCostConfig from "../models/ImportCostConfig.js";
import ExchangeRate from "../models/ExchangeRate.js";
import { seedImportCostConfigs, stalledImportCostConfigs } from "../scripts/seedImportCostConfigs.js";
import { computeImportCost } from "../services/importCostEngine.js";

// Amorçage des barèmes douaniers.
//
// Aucun n'était configuré : le moteur de coût — le différenciateur de la
// plateforme — répondait « Aucun barème d'importation configuré » et l'acheteur
// ne voyait aucun prix rendu.
//
// Le point le plus important de ce fichier est ce que l'amorçage NE fait PAS :
// il ne crée un barème que pour les pays dont les taux ont été vérifiés à la
// source. Inventer les autres serait pire que de n'en avoir aucun — un
// acheteur engagerait un achat international sur un chiffre faux.

const ANNEE = new Date().getFullYear();

describe("Amorçage des barèmes d'importation", () => {
  beforeEach(async () => {
    await ImportCostConfig.deleteMany({});
    await ExchangeRate.deleteMany({});
  });

  it("crée les barèmes vérifiés, et eux seuls", async () => {
    const r = await seedImportCostConfigs();
    expect(r.created).toBe(3);

    const pays = (await ImportCostConfig.find({}).lean()).map((c) => c.country).sort();
    expect(pays).toEqual(["Côte d'Ivoire", "Maroc", "Sénégal"]);
  });

  it("n'invente AUCUN barème pour les pays non vérifiés", async () => {
    await seedImportCostConfigs();
    // Ces marchés sont desservis, mais leurs taux n'ont pas été vérifiés à la
    // source : le moteur doit refuser de chiffrer plutôt que de deviner.
    for (const pays of ["Mali", "Bénin", "Togo", "Ghana", "Nigeria", "Guinée"]) {
      const r = await computeImportCost({
        vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
        destCountry: pays, vehicleYear: ANNEE,
      });
      expect(r.available, `${pays} ne doit pas être chiffré`).toBe(false);
      expect(r.grandTotal).toBeUndefined();
    }
  });

  it("le barème marocain reproduit le cumul officiel de 41,30 %", async () => {
    await seedImportCostConfigs();
    const maroc = await ImportCostConfig.findOne({ country: "Maroc" }).lean();

    expect(maroc.customsDutyPercent).toBe(17.5);
    expect(maroc.parafiscalPercent).toBe(0.25);
    expect(maroc.vatPercent).toBe(20);
    expect(maroc.maxVehicleAgeYears, "limite légale : 5 ans").toBe(5);
    expect(maroc.preferentialDuty[0].percent, "accord d'association UE").toBe(2.5);
    expect(maroc.source, "un taux sans source ne peut pas être revérifié").toBeTruthy();
  });

  it("le barème ivoirien porte la TVA à 18 % et la limite de 5 ans", async () => {
    await seedImportCostConfigs();
    const ci = await ImportCostConfig.findOne({ country: "Côte d'Ivoire" }).lean();

    expect(ci.vatPercent).toBe(18);
    expect(ci.customsDutyPercent).toBe(20);
    expect(ci.maxVehicleAgeYears).toBe(5);
    expect(ci.source).toBeTruthy();
  });

  it("le barème sénégalais reproduit le cumul officiel de 48,963 % du CIF", async () => {
    // La douane sénégalaise publie des taux DÉJÀ rapportés au CIF. Les
    // recalculer en les empilant, comme au Maroc, donnerait un autre chiffre
    // que celui de l'administration — d'où le mode « effective_cif ».
    await seedImportCostConfigs();
    const r = await computeImportCost({
      vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
      destCountry: "Sénégal", vehicleYear: ANNEE,
    });

    expect(r.available).toBe(true);
    expect(r.rates.rateBasis).toBe("effective_cif");

    // Le barème sénégalais ne neutralise ni le fret ni l'assurance : on
    // vérifie donc les TAUX et leur rapport au CIF réel, jamais des montants
    // absolus qui dépendraient des frais annexes par défaut.
    expect(r.rates.customsDutyPercent).toBe(22.9);
    expect(r.rates.vatPercent).toBe(21.78);
    expect(r.rates.registrationPercent).toBe(4.283);
    expect(22.9 + 21.78 + 4.283, "cumul publié par douanes.sn").toBeCloseTo(48.963, 3);

    // Chaque poste est bien un pourcentage DIRECT du CIF, non empilé.
    const cifReel = r.breakdown.vehiclePrice + r.breakdown.seaFreight + r.breakdown.insurance;
    expect(r.breakdown.customsDuty / cifReel).toBeCloseTo(0.229, 4);
    expect(r.breakdown.vat / cifReel).toBeCloseTo(0.2178, 4);
    expect(r.breakdown.registration / cifReel).toBeCloseTo(0.04283, 4);
  });

  it("ne réécrit JAMAIS un barème ajusté par l'admin", async () => {
    await seedImportCostConfigs();
    await ImportCostConfig.updateOne({ country: "Maroc" }, { $set: { customsDutyPercent: 12 } });

    const r = await seedImportCostConfigs();
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(3);

    const maroc = await ImportCostConfig.findOne({ country: "Maroc" }).lean();
    expect(maroc.customsDutyPercent, "l'ajustement de l'admin doit survivre").toBe(12);
  });

  it("signale les barèmes périmés — un taux daté vaut mieux qu'un taux supposé", async () => {
    // Aucune administration ne publie ses taux via une interface machine : la
    // mise à jour ne peut pas être automatique. La parade est de dater, puis
    // d'alerter quand le barème vieillit.
    await seedImportCostConfigs();
    expect(await stalledImportCostConfigs()).toHaveLength(0);

    const dansDeuxAns = new Date();
    dansDeuxAns.setFullYear(dansDeuxAns.getFullYear() + 2);
    const perimes = await stalledImportCostConfigs(dansDeuxAns);
    expect(perimes).toHaveLength(3);
    expect(perimes[0].country).toBeTruthy();
  });

  it("un barème jamais daté est signalé d'emblée", async () => {
    await ImportCostConfig.create({ country: "Mali", active: true });
    const perimes = await stalledImportCostConfigs();
    expect(perimes.map((c) => c.country)).toContain("Mali");
  });
});
