import { describe, it, expect, beforeEach } from "vitest";
import { getDeliveryFee, getMyCountry, getCountries } from "../controllers/geoController.js";
import { createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import ExchangeRate from "../models/ExchangeRate.js";
import CountryConfig from "../models/CountryConfig.js";

// getDeliveryFee/getCountries lisent désormais CountryConfig/ExchangeRate en
// base (voir server/services/currencyEngine.js) au lieu de server/config/countries.js
// (supprimé) — chaque test qui en dépend doit seeder ces référentiels.
beforeEach(async () => {
  await ExchangeRate.create({ code: "XOF", name: "Franc CFA", symbol: "FCFA", rateFromUSD: 600 });
  await CountryConfig.create({
    code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", defaultCurrency: "XOF", locale: "fr-CI",
    languages: ["fr"], paymentMethods: ["orange_money", "wave", "card", "cash"],
    deliveryRatePerKm: 200, deliveryBaseRate: 1000, deliveryMaxKm: 100,
  });
});

describe("getDeliveryFee", () => {
  it("400 si les coordonnées client sont manquantes", async () => {
    const { req, res } = mockReqRes({ query: {} });
    await getDeliveryFee(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 si les coordonnées client ne sont pas numériques", async () => {
    const { req, res } = mockReqRes({ query: { clientLat: "abc", clientLng: "5" } });
    await getDeliveryFee(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 si aucune coordonnée partenaire n'est déductible (ni partnerLat/Lng, ni vehicleId géocodé)", async () => {
    const vehicle = await createVehicleDoc({ coordonnees: undefined });
    const { req, res } = mockReqRes({ query: { clientLat: "5.34", clientLng: "-4.02", vehicleId: vehicle._id.toString() } });
    await getDeliveryFee(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("calcule les frais avec des coordonnées partenaire directes", async () => {
    const { req, res } = mockReqRes({
      query: { clientLat: "5.34", clientLng: "-4.02", partnerLat: "5.36", partnerLng: "-4.00", countryCode: "CI" },
    });
    await getDeliveryFee(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.countryCode).toBe("CI");
    expect(res.body.distanceKm).toBeGreaterThan(0);
    expect(typeof res.body.fee).toBe("number");
    expect(res.body.currency).toBe("XOF");
  });

  it("résout les coordonnées partenaire depuis un vehicleId géocodé", async () => {
    const vehicle = await createVehicleDoc({ coordonnees: { lat: 5.36, lng: -4.00 } });
    const { req, res } = mockReqRes({
      query: { clientLat: "5.34", clientLng: "-4.02", vehicleId: vehicle._id.toString() },
    });
    await getDeliveryFee(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("getMyCountry", () => {
  it("renvoie country: null pour une IP locale/inconnue, sans jamais planter", () => {
    const { req, res } = mockReqRes({});
    req.ip = "127.0.0.1";
    getMyCountry(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.country).toBeNull();
  });

  it("retire le préfixe IPv4-mapped IPv6 avant le lookup", () => {
    const { req, res } = mockReqRes({});
    req.ip = "::ffff:127.0.0.1";
    getMyCountry(req, res);
    expect(res.statusCode).toBe(200);
    // Ne doit pas planter et doit répondre un objet cohérent (country null ou un code réel).
    expect(res.body).toHaveProperty("country");
  });

  // Bug réel corrigé (audit) : `req.ip` seul dépend d'un réglage exact du
  // nombre de sauts "trust proxy" — un saut CDN/DNS de plus (probable sur un
  // domaine personnalisé comme vit-auto.com) et req.ip résout systématiquement
  // le proxy, jamais le vrai visiteur, pour TOUT LE MONDE. Le premier maillon
  // de X-Forwarded-For reste la vraie IP d'origine quel que soit ce réglage.
  it("préfère le premier maillon de X-Forwarded-For à req.ip s'il est présent", () => {
    const { req, res } = mockReqRes({});
    req.ip = "10.0.0.5"; // IP du proxy interne, jamais celle du visiteur
    req.headers["x-forwarded-for"] = "8.8.8.8, 10.0.0.5";
    getMyCountry(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.country).toBe("US"); // 8.8.8.8 (Google DNS, US) — pas 10.0.0.5
  });

  it("retombe sur req.ip si X-Forwarded-For est absent", () => {
    const { req, res } = mockReqRes({});
    req.ip = "127.0.0.1";
    getMyCountry(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.country).toBeNull();
  });
});

describe("getCountries", () => {
  it("renvoie la liste des pays avec uniquement les champs whitelist", async () => {
    const { req, res } = mockReqRes({});
    await getCountries(req, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const keys = Object.keys(res.body[0]).sort();
    expect(keys).toEqual([
      "code", "currency", "currencySymbol", "deliveryBaseRate",
      "deliveryMaxKm", "deliveryRatePerKm", "flag", "languages", "name", "paymentMethods",
    ]);
  });
});
