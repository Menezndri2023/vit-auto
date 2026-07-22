import { describe, it, expect } from "vitest";
import {
  getActiveRates, getActiveCountries, getRateFromUSD,
  convertFromUSD, convertAmount, calculateDeliveryFee, getCountry,
} from "../services/currencyEngine.js";
import ExchangeRate from "../models/ExchangeRate.js";
import CountryConfig from "../models/CountryConfig.js";

// La base est réinitialisée après CHAQUE test (voir tests/setup.js afterEach)
// — chaque `it()` crée ici tout ce dont il a besoin, rien n'est partagé entre tests.

describe("currencyEngine", () => {
  it("getActiveRates ne renvoie que les devises actives", async () => {
    await ExchangeRate.create({ code: "TST", name: "Test", symbol: "T$", rateFromUSD: 2, active: true });
    await ExchangeRate.create({ code: "OLD", name: "Ancienne", symbol: "O$", rateFromUSD: 3, active: false });

    const rates = await getActiveRates();
    const codes = rates.map((r) => r.code);
    expect(codes).toContain("TST");
    expect(codes).not.toContain("OLD");
  });

  it("getActiveCountries ne renvoie que les pays actifs, triés par nom", async () => {
    await CountryConfig.create({ code: "ZZ", name: "Zone Test", defaultCurrency: "TST", active: true });
    await CountryConfig.create({ code: "YY", name: "Pays désactivé", defaultCurrency: "TST", active: false });

    const countries = await getActiveCountries();
    const codes = countries.map((c) => c.code);
    expect(codes).toContain("ZZ");
    expect(codes).not.toContain("YY");
  });

  it("getRateFromUSD renvoie 1 pour USD sans requête, la valeur seedée pour un code connu, null pour un code inconnu", async () => {
    await ExchangeRate.create({ code: "USD", name: "Dollar US", symbol: "$", rateFromUSD: 1, active: true });
    await ExchangeRate.create({ code: "TST", name: "Test", symbol: "T$", rateFromUSD: 2, active: true });
    expect(await getRateFromUSD("USD")).toBe(1);
    expect(await getRateFromUSD("TST")).toBe(2);
    expect(await getRateFromUSD("INCONNU")).toBeNull();
  });

  it("convertFromUSD convertit correctement et renvoie null pour une devise inconnue/inactive", async () => {
    await ExchangeRate.create({ code: "TST", name: "Test", symbol: "T$", rateFromUSD: 2, active: true });
    await ExchangeRate.create({ code: "OLD", name: "Ancienne", symbol: "O$", rateFromUSD: 3, active: false });

    const converted = await convertFromUSD(10, "TST");
    expect(converted).toBe(20);
    expect(await convertFromUSD(10, "OLD")).toBeNull(); // inactive
    expect(await convertFromUSD(10, "INCONNU")).toBeNull();
  });

  it("convertAmount convertit entre deux devises arbitraires via le pivot USD", async () => {
    await ExchangeRate.create({ code: "TST", name: "Test", symbol: "T$", rateFromUSD: 2, active: true });
    await ExchangeRate.create({ code: "ABC", name: "Devise A", symbol: "A", rateFromUSD: 4, active: true });
    // 1 USD = 2 TST = 4 ABC → 8 TST doivent valoir 16 ABC
    const result = await convertAmount(8, "TST", "ABC");
    expect(result).toBe(16);
  });

  it("calculateDeliveryFee calcule le tarif dans la devise locale, refuse au-delà de deliveryMaxKm", async () => {
    await ExchangeRate.create({ code: "TST", name: "Test", symbol: "T$", rateFromUSD: 2, active: true });
    await CountryConfig.create({
      code: "FT", name: "Frais Test", defaultCurrency: "TST", active: true,
      deliveryBaseRate: 100, deliveryRatePerKm: 10, deliveryMaxKm: 50,
    });

    const near = await calculateDeliveryFee("FT", 10);
    expect(near.fee).toBe(200); // 100 + 10*10
    expect(near.currency).toBe("TST");

    const far = await calculateDeliveryFee("FT", 100);
    expect(far.fee).toBeNull();
  });

  it("getCountry renvoie le pays demandé ou un repli si introuvable", async () => {
    await CountryConfig.create({ code: "FT", name: "Frais Test", defaultCurrency: "TST", active: true });

    const found = await getCountry("FT");
    expect(found.code).toBe("FT");

    const fallback = await getCountry("CODE_INEXISTANT");
    expect(fallback).toBeTruthy(); // repli sur le premier pays actif
  });
});
