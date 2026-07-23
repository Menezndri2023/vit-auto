import { describe, it, expect } from "vitest";
import { isValidCountryCode } from "../utils/countries.js";
import CountryConfig from "../models/CountryConfig.js";

// Régression : isValidCountryCode() comparait auparavant à une liste figée de
// 13 pays (server/utils/countries.js), désynchronisée de CountryConfig (27
// pays depuis la refonte du modèle économique) — un utilisateur choisissant
// un pays présent dans le sélecteur (alimenté par CountryConfig) mais absent
// de l'ancienne liste (ex: Chine, Ghana, Nigeria, Allemagne...) se voyait
// rejeté à l'inscription avec "Pays invalide" alors que son pays était bien
// supporté et actif.
describe("isValidCountryCode", () => {
  it("accepte un pays présent et actif dans CountryConfig", async () => {
    await CountryConfig.create({ code: "CN", name: "Chine", defaultCurrency: "CNY" });
    expect(await isValidCountryCode("cn")).toBe(true); // insensible à la casse
  });

  it("accepte un pays qui n'était PAS dans l'ancienne liste figée (ex: Ghana)", async () => {
    await CountryConfig.create({ code: "GH", name: "Ghana", defaultCurrency: "GHS" });
    expect(await isValidCountryCode("GH")).toBe(true);
  });

  it("rejette un pays absent de CountryConfig", async () => {
    expect(await isValidCountryCode("ZZ")).toBe(false);
  });

  it("rejette un pays désactivé (active: false)", async () => {
    await CountryConfig.create({ code: "XX", name: "Pays test", defaultCurrency: "USD", active: false });
    expect(await isValidCountryCode("XX")).toBe(false);
  });

  it("rejette une entrée non-string", async () => {
    expect(await isValidCountryCode(null)).toBe(false);
    expect(await isValidCountryCode(undefined)).toBe(false);
  });
});
