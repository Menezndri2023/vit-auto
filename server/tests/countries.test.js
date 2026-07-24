import { describe, it, expect } from "vitest";
import { isValidCountryCode } from "../utils/countries.js";

// Régression : isValidCountryCode() comparait auparavant à CountryConfig (la
// trentaine de pays où VIT AUTO a configuré une offre commerciale active) —
// un partenaire dans un pays réel mais pas encore dans CountryConfig (ex:
// Kenya, Brésil, Afrique du Sud, Inde...) se voyait rejeté à l'inscription
// avec "Pays invalide". La fonction valide maintenant contre la liste ISO
// 3166-1 complète (249 codes), indépendante de tout déploiement commercial.
describe("isValidCountryCode", () => {
  it("accepte un pays présent dans CountryConfig (ex: Chine)", async () => {
    expect(await isValidCountryCode("cn")).toBe(true); // insensible à la casse
  });

  it("accepte un pays qui n'était PAS dans CountryConfig (ex: Kenya)", async () => {
    expect(await isValidCountryCode("KE")).toBe(true);
  });

  it("accepte un pays qui n'était PAS dans CountryConfig (ex: Brésil)", async () => {
    expect(await isValidCountryCode("BR")).toBe(true);
  });

  it("rejette un code qui n'est pas un pays ISO 3166-1 valide", async () => {
    expect(await isValidCountryCode("ZZ")).toBe(false);
    expect(await isValidCountryCode("XX")).toBe(false);
  });

  it("rejette une entrée non-string", async () => {
    expect(await isValidCountryCode(null)).toBe(false);
    expect(await isValidCountryCode(undefined)).toBe(false);
  });
});
