import { describe, it, expect, beforeEach } from "vitest";
import {
  getPricingConfig, updatePricingSection,
  getExchangeRates, upsertExchangeRate, deleteExchangeRate,
  getCountryConfigs, upsertCountryConfig, deleteCountryConfig,
  getDiscountCampaigns, upsertDiscountCampaign, deleteDiscountCampaign,
} from "../controllers/businessConfigController.js";
import { getCurrencies, getCountries, getPublicConfig } from "../controllers/pricingController.js";
import { applyDiscountCode, redeemDiscountCode } from "../services/pricingEngine.js";
import PricingConfig from "../models/PricingConfig.js";
import ExchangeRate from "../models/ExchangeRate.js";
import CountryConfig from "../models/CountryConfig.js";
import DiscountCampaign from "../models/DiscountCampaign.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

beforeEach(async () => {
  await PricingConfig.create({
    key: "global",
    commissions: { standard: { vente: 0.03, location: 0.15, chauffeur: 0.10, import_export: 0.03, leasing: 0.05 }, premium: { vente: 0.02, location: 0.12, chauffeur: 0.08, import_export: 0.02, leasing: 0.04 } },
    foundingPartner: { durationMonths: 12, entreprise: { location: 0.10, vente: 0.015, import_export: 0.015 }, particulier: { location: 0.10, vente: 0.02, import_export: null } },
    serviceFee: { minUSD: 1, percent: 0.005, maxUSD: 25 },
    boosts: { "24h": 2, "7d": 5, "30d": 12, international: 20 },
    subscriptions: { individuel_plus: { priceUSD: 9.99 }, business: { priceUSD: 19.99 }, exportateur: { priceUSD: 49.99 } },
    services: { inspection: { enabled: true, commissionRate: 0, fixedFeeUSD: 0 } },
    ads: { banner: { priceUSD: 10, durationDays: 7 } },
  });
  await ExchangeRate.create({ code: "USD", name: "Dollar US", symbol: "$", rateFromUSD: 1 });
  await ExchangeRate.create({ code: "MAD", name: "Dirham marocain", symbol: "DH", rateFromUSD: 9.9174 });
  await CountryConfig.create({ code: "MA", name: "Maroc", flag: "🇲🇦", defaultCurrency: "MAD", locale: "fr-MA" });
});

describe("Admin — PricingConfig", () => {
  it("getPricingConfig renvoie le document global", async () => {
    const { req, res } = mockReqRes({});
    await getPricingConfig(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.config.commissions.standard.location).toBe(0.15);
  });

  it("updatePricingSection met à jour uniquement la section ciblée", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: { _id: admin._id },
      params: { section: "boosts" },
      body: { "24h": 3, "7d": 6, "30d": 15, international: 25 },
    });
    await updatePricingSection(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.config.boosts["24h"]).toBe(3);
    // Les autres sections restent intactes
    expect(res.body.config.commissions.standard.location).toBe(0.15);
  });

  it("refuse une section inconnue", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: { _id: admin._id }, params: { section: "n_importe_quoi" }, body: {} });
    await updatePricingSection(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("Admin — ExchangeRate CRUD", () => {
  it("liste, crée/met à jour (upsert) et supprime une devise", async () => {
    const admin = await createUser({ role: "admin" });

    const { req: reqList, res: resList } = mockReqRes({});
    await getExchangeRates(reqList, resList);
    expect(resList.body.rates.length).toBe(2);

    const { req: reqUpsert, res: resUpsert } = mockReqRes({
      user: { _id: admin._id },
      body: { code: "eur", name: "Euro", symbol: "€", rateFromUSD: 0.9147 },
    });
    await upsertExchangeRate(reqUpsert, resUpsert);
    expect(resUpsert.statusCode).toBe(200);
    expect(resUpsert.body.rate.code).toBe("EUR"); // uppercase forcé par le schéma

    const { req: reqDel, res: resDel } = mockReqRes({ params: { id: resUpsert.body.rate._id.toString() } });
    await deleteExchangeRate(reqDel, resDel);
    expect(resDel.statusCode).toBe(200);

    const remaining = await ExchangeRate.countDocuments();
    expect(remaining).toBe(2); // USD + MAD restants (EUR supprimé)
  });

  it("refuse un upsert sans code", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: { _id: admin._id }, body: { name: "Sans code" } });
    await upsertExchangeRate(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("Admin — CountryConfig CRUD", () => {
  it("liste, crée/met à jour (upsert) et supprime un pays", async () => {
    const admin = await createUser({ role: "admin" });

    const { req: reqUpsert, res: resUpsert } = mockReqRes({
      user: { _id: admin._id },
      body: { code: "ci", name: "Côte d'Ivoire", flag: "🇨🇮", defaultCurrency: "XOF", taxPercent: 18 },
    });
    await upsertCountryConfig(reqUpsert, resUpsert);
    expect(resUpsert.statusCode).toBe(200);
    expect(resUpsert.body.country.code).toBe("CI");
    expect(resUpsert.body.country.taxPercent).toBe(18);

    const { req: reqList, res: resList } = mockReqRes({});
    await getCountryConfigs(reqList, resList);
    expect(resList.body.countries.length).toBe(2);

    const { req: reqDel, res: resDel } = mockReqRes({ params: { id: resUpsert.body.country._id.toString() } });
    await deleteCountryConfig(reqDel, resDel);
    const remaining = await CountryConfig.countDocuments();
    expect(remaining).toBe(1);
  });
});

describe("Admin — DiscountCampaign CRUD", () => {
  it("liste, crée/met à jour (upsert) et supprime une campagne", async () => {
    const admin = await createUser({ role: "admin" });

    const { req: reqUpsert, res: resUpsert } = mockReqRes({
      user: { _id: admin._id },
      body: { code: "launch50", discountPercent: 50, appliesTo: ["subscriptions"] },
    });
    await upsertDiscountCampaign(reqUpsert, resUpsert);
    expect(resUpsert.statusCode).toBe(200);
    expect(resUpsert.body.campaign.code).toBe("LAUNCH50"); // uppercase forcé

    const { req: reqList, res: resList } = mockReqRes({});
    await getDiscountCampaigns(reqList, resList);
    expect(resList.body.campaigns.length).toBe(1);

    const { req: reqDel, res: resDel } = mockReqRes({ params: { id: resUpsert.body.campaign._id.toString() } });
    await deleteDiscountCampaign(reqDel, resDel);
    expect(resDel.statusCode).toBe(200);
    expect(await DiscountCampaign.countDocuments()).toBe(0);
  });

  it("refuse un upsert sans code", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: { _id: admin._id }, body: { discountPercent: 10 } });
    await upsertDiscountCampaign(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse un pourcentage hors bornes", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: { _id: admin._id }, body: { code: "BAD", discountPercent: 150, appliesTo: ["boosts"] } });
    await upsertDiscountCampaign(req, res);
    expect(res.statusCode).toBe(500); // erreur de validation Mongoose remontée
  });
});

describe("pricingEngine — applyDiscountCode / redeemDiscountCode", () => {
  it("renvoie le prix inchangé si aucun code fourni", async () => {
    const { priceUSD, campaign } = await applyDiscountCode(null, "subscriptions", 19.99);
    expect(priceUSD).toBe(19.99);
    expect(campaign).toBeNull();
  });

  it("applique la réduction pour un code valide et applicable", async () => {
    const c = await DiscountCampaign.create({ code: "LAUNCH50", discountPercent: 50, appliesTo: ["subscriptions"] });
    const { priceUSD, campaign } = await applyDiscountCode("launch50", "subscriptions", 20);
    expect(priceUSD).toBe(10);
    expect(campaign._id.toString()).toBe(c._id.toString());
  });

  it("rejette un code inexistant", async () => {
    await expect(applyDiscountCode("NOPE", "subscriptions", 19.99)).rejects.toThrow();
  });

  it("rejette un code qui ne s'applique pas à ce produit", async () => {
    await DiscountCampaign.create({ code: "BOOSTONLY", discountPercent: 20, appliesTo: ["boosts"] });
    await expect(applyDiscountCode("BOOSTONLY", "subscriptions", 19.99)).rejects.toThrow();
  });

  it("rejette un code expiré", async () => {
    await DiscountCampaign.create({
      code: "OLD", discountPercent: 20, appliesTo: ["subscriptions"],
      endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await expect(applyDiscountCode("OLD", "subscriptions", 19.99)).rejects.toThrow();
  });

  it("rejette un code ayant atteint sa limite d'utilisation", async () => {
    await DiscountCampaign.create({
      code: "LIMITED", discountPercent: 20, appliesTo: ["subscriptions"],
      maxRedemptions: 1, redemptionCount: 1,
    });
    await expect(applyDiscountCode("LIMITED", "subscriptions", 19.99)).rejects.toThrow();
  });

  it("redeemDiscountCode incrémente le compteur d'utilisation", async () => {
    const c = await DiscountCampaign.create({ code: "COUNT", discountPercent: 10, appliesTo: ["subscriptions"] });
    await redeemDiscountCode(c._id);
    const updated = await DiscountCampaign.findById(c._id);
    expect(updated.redemptionCount).toBe(1);
  });
});

describe("Public — /api/pricing", () => {
  it("getCurrencies expose les devises actives sans champs internes", async () => {
    const { req, res } = mockReqRes({});
    await getCurrencies(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.currencies.some((c) => c.code === "USD")).toBe(true);
    expect(res.body.currencies[0].updatedBy).toBeUndefined();
  });

  it("getCountries expose les pays actifs", async () => {
    const { req, res } = mockReqRes({});
    await getCountries(req, res);
    expect(res.body.countries.some((c) => c.code === "MA")).toBe(true);
  });

  it("getPublicConfig expose commissions/abonnements/boosts sans champs internes", async () => {
    const { req, res } = mockReqRes({});
    await getPublicConfig(req, res);
    expect(res.body.commissions.standard.location).toBe(0.15);
    expect(res.body.subscriptions.business.priceUSD).toBe(19.99);
    expect(res.body.updatedBy).toBeUndefined();
    expect(res.body._id).toBeUndefined();
  });
});
