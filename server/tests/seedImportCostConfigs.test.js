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
    expect(r.created).toBe(9);

    const pays = (await ImportCostConfig.find({}).lean()).map((c) => c.country).sort();
    expect(pays).toEqual([
      "Bénin", "Côte d'Ivoire", "Ghana", "Guinée", "Mali", "Maroc", "Nigeria", "Sénégal", "Togo",
    ]);
  });

  it("les barèmes PROVISOIRES se déclarent comme tels", async () => {
    // Décision du gérant : un barème provisoire assumé vaut mieux qu'un tiret
    // sur toutes les annonces. Encore faut-il qu'il ne passe jamais pour
    // définitif — d'où la mention dans `source` et une revue à 6 mois.
    await seedImportCostConfigs();
    for (const pays of ["Bénin", "Mali", "Togo", "Guinée"]) {
      const c = await ImportCostConfig.findOne({ country: pays }).lean();
      expect(c.source, `${pays} doit se déclarer provisoire`).toMatch(/^PROVISOIRE/);
      expect(c.reviewEveryMonths, "revue plus fréquente qu'un barème vérifié").toBe(6);
    }
  });

  it("les barèmes VÉRIFIÉS ne portent pas cette mention", async () => {
    await seedImportCostConfigs();
    for (const pays of ["Maroc", "Côte d'Ivoire", "Sénégal", "Ghana", "Nigeria"]) {
      const c = await ImportCostConfig.findOne({ country: pays }).lean();
      expect(c.source, `${pays}`).not.toMatch(/^PROVISOIRE/);
    }
  });

  it("le barème nigérian reproduit le cumul de 36,42 % du CIF", async () => {
    // Droit 20 %, NAC 5 %, ETLS 0,5 %, surtaxe de 7 % SUR LES DROITS (1,4 % du
    // CIF) — soit 6,9 % d'annexes — puis TVA 7,5 % sur l'ensemble.
    await seedImportCostConfigs();
    const r = await computeImportCost({
      vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
      destCountry: "Nigeria", vehicleYear: ANNEE,
    });
    expect(r.available).toBe(true);
    const cif = r.breakdown.vehiclePrice + r.breakdown.seaFreight + r.breakdown.insurance;
    const total = r.breakdown.customsDuty + r.breakdown.parafiscal + r.breakdown.vat;
    expect(total / cif).toBeCloseTo(0.36418, 4);
  });

  it("chaque destination desservie est désormais chiffrable", async () => {
    // Aucun barème n'existait : le moteur répondait « Aucun barème configuré »
    // pour TOUS les pays, et l'acheteur ne voyait jamais de coût rendu.
    await seedImportCostConfigs();
    for (const pays of ["Maroc", "Côte d'Ivoire", "Sénégal", "Mali", "Bénin", "Togo", "Ghana", "Nigeria", "Guinée"]) {
      const r = await computeImportCost({
        vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
        destCountry: pays, vehicleYear: ANNEE,
      });
      expect(r.available, `${pays} doit être chiffrable`).toBe(true);
      expect(r.grandTotal).toBeGreaterThan(0);
    }
  });

  it("un pays NON desservi reste non chiffrable — rien n'est deviné", async () => {
    await seedImportCostConfigs();
    const r = await computeImportCost({
      vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
      destCountry: "Ouganda", vehicleYear: ANNEE,
    });
    expect(r.available).toBe(false);
    expect(r.grandTotal).toBeUndefined();
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

  it("le barème ivoirien reproduit le cumul de 46,438 % du CAF", async () => {
    // Décomposition officielle : droit de douane 20 % (TEC, voitures
    // particulières), redevance statistique 1 %, prélèvement communautaire
    // CEDEAO 0,5 %, taxe additionnelle 2,6 % — soit 24,1 % de prélèvements —
    // puis TVA 18 % sur CAF + prélèvements.
    await seedImportCostConfigs();
    const ci = await ImportCostConfig.findOne({ country: "Côte d'Ivoire" }).lean();

    expect(ci.customsDutyPercent).toBe(20);
    expect(ci.parafiscalPercent, "RS 1 % + PC 0,5 % + taxe additionnelle 2,6 %").toBe(4.1);
    expect(ci.vatPercent).toBe(18);
    expect(ci.maxVehicleAgeYears).toBe(5);
    expect(ci.rateBasis ?? "nested", "les taux ivoiriens s'empilent, ils ne sont pas directs").toBe("nested");
    expect(ci.source).toBeTruthy();

    const r = await computeImportCost({
      vehiclePrice: 10000, currency: "USD", sourceCountry: "Chine",
      destCountry: "Côte d'Ivoire", vehicleYear: ANNEE,
    });
    expect(r.available).toBe(true);

    const caf = r.breakdown.vehiclePrice + r.breakdown.seaFreight + r.breakdown.insurance;
    const preleve = r.breakdown.customsDuty + r.breakdown.parafiscal;
    expect(preleve / caf, "24,1 % de prélèvements avant TVA").toBeCloseTo(0.241, 4);
    expect(r.breakdown.vat / caf, "TVA effective de 22,338 % du CAF").toBeCloseTo(0.22338, 4);
    expect((preleve + r.breakdown.vat) / caf, "cumul de 46,438 %").toBeCloseTo(0.46438, 4);
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
    expect(r.skipped).toBe(9);

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
    expect(perimes).toHaveLength(9);
    expect(perimes[0].country).toBeTruthy();
  });

  it("un barème jamais daté est signalé d'emblée", async () => {
    await ImportCostConfig.create({ country: "Ouganda", active: true });
    const perimes = await stalledImportCostConfigs();
    expect(perimes.map((c) => c.country)).toContain("Ouganda");
  });
});
