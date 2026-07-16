import { describe, it, expect } from "vitest";
import { getDeliveryFee, getMyCountry, getCountries } from "../controllers/geoController.js";
import { createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

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
});

describe("getCountries", () => {
  it("renvoie la liste des pays avec uniquement les champs whitelist", () => {
    const { req, res } = mockReqRes({});
    getCountries(req, res);
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
