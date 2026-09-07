import { describe, it, expect } from "vitest";
import { resolveDeliveryFee, haversineKm } from "../services/deliveryFee.js";
import CountryConfig from "../models/CountryConfig.js";

// Restructuration frais de livraison (2026-09) : un partenaire peut désormais
// fixer un tarif fixe "même ville" (PartnerBusiness.rentalPolicy) qui
// remplace le barème pays au km tant que la distance reste sous le rayon
// configuré — au-delà, le barème pays existant s'applique tel quel, jamais
// de second montant à inventer pour "hors ville".
describe("deliveryFee.resolveDeliveryFee — tarif fixe partenaire vs barème pays", () => {
  const abidjan = { lat: 5.3600, lng: -4.0083 };
  const nearby   = { lat: 5.3700, lng: -4.0100 }; // ~1km
  const farAway  = { lat: 6.8500, lng: -5.2800 }; // Bouaké, ~180km

  async function seedCI() {
    return CountryConfig.create({
      code: "CI", name: "Côte d'Ivoire", defaultCurrency: "XOF",
      deliveryBaseRate: 1000, deliveryRatePerKm: 200, deliveryMaxKm: 300,
    });
  }

  it("applique le barème pays au km quand le partenaire n'a configuré aucun tarif fixe", async () => {
    await seedCI();
    const result = await resolveDeliveryFee({
      clientLat: nearby.lat, clientLng: nearby.lng,
      vehicleLat: abidjan.lat, vehicleLng: abidjan.lng,
      countryCode: "CI", rentalPolicy: null,
    });
    const rawKm = haversineKm(nearby.lat, nearby.lng, abidjan.lat, abidjan.lng);
    expect(result.fee).toBe(Math.round(1000 + rawKm * 200));
  });

  it("applique le tarif fixe du partenaire quand la distance reste sous le rayon 'même ville'", async () => {
    await seedCI();
    const result = await resolveDeliveryFee({
      clientLat: nearby.lat, clientLng: nearby.lng,
      vehicleLat: abidjan.lat, vehicleLng: abidjan.lng,
      countryCode: "CI",
      rentalPolicy: { deliveryFeeSameCity: 120, deliverySameCityRadiusKm: 15 },
    });
    expect(result.fee).toBe(120);
    expect(result.feeDisplay).toContain("même ville");
  });

  it("retombe sur le barème au km au-delà du rayon 'même ville', même avec un tarif fixe configuré", async () => {
    await seedCI();
    const result = await resolveDeliveryFee({
      clientLat: farAway.lat, clientLng: farAway.lng,
      vehicleLat: abidjan.lat, vehicleLng: abidjan.lng,
      countryCode: "CI",
      rentalPolicy: { deliveryFeeSameCity: 120, deliverySameCityRadiusKm: 15 },
    });
    expect(result.fee).not.toBe(120);
    const rawKm = haversineKm(farAway.lat, farAway.lng, abidjan.lat, abidjan.lng);
    expect(result.fee).toBe(Math.round(1000 + rawKm * 200));
  });

  it("utilise un rayon par défaut de 15km si le partenaire fixe un tarif sans préciser de rayon", async () => {
    await seedCI();
    const result = await resolveDeliveryFee({
      clientLat: nearby.lat, clientLng: nearby.lng,
      vehicleLat: abidjan.lat, vehicleLng: abidjan.lng,
      countryCode: "CI",
      rentalPolicy: { deliveryFeeSameCity: 150 },
    });
    expect(result.fee).toBe(150);
  });
});
