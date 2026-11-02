import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderPage, simulerApi } from "../../test/renderPage";
import PriceTag from "./PriceTag";

// Annonces Import/Export : prix saisi dans la devise de l'annonce (EUR, AED…).
// La conversion passait encore par l'ancien pivot XOF alors que fmt() attend
// des USD depuis la migration : le prix affiché était multiplié par le taux
// XOF (≈ 600).
const DEVISES = { currencies: [
  { code: "USD", symbol: "$", name: "Dollar", rateFromUSD: 1 },
  { code: "EUR", symbol: "€", name: "Euro", rateFromUSD: 0.9 },
  { code: "XOF", symbol: "FCFA", name: "Franc CFA", rateFromUSD: 600 },
  { code: "MAD", symbol: "DH", name: "Dirham", rateFromUSD: 10 },
] };

describe("Prix d'une annonce saisie dans une autre devise que l'USD", () => {
  beforeEach(() => { localStorage.clear(); });

  it("visiteur en MAD : 18 000 € → 200 000 DH (18 000 / 0,9 × 10), jamais multiplié par le taux XOF", async () => {
    localStorage.setItem("vit_currency", "MAD");
    simulerApi({ routes: { "/api/pricing/currencies": DEVISES } });
    renderPage(<PriceTag amount={18000} sourceCurrency="EUR" />);
    // fr-MA groupe les milliers par un point (« 200.000 DH ») : convention marocaine.
    await waitFor(() => expect(document.body.textContent.replace(/\s/g, "")).toMatch(/^200\.000DH/));
    expect(screen.getByText(/réel/).textContent.replace(/\s/g, "")).toMatch(/18000,00€|18000€/);
  });
});

describe("Format des montants hors Intl (MAD, XOF)", () => {
  it("pas de décimale isolée : centimes seulement sous 1 000, et alors toujours deux", async () => {
    const { formaterMontant } = await import("../../context/CurrencyContext");
    expect(formaterMontant(188430.6, "fr-MA")).toBe("188.431");
    expect(formaterMontant(347.1, "fr-MA")).toBe("347,10");
    expect(formaterMontant(350, "fr-MA")).toBe("350");
    expect(formaterMontant(1250000, "fr-CI").replace(/\s/g, " ")).toBe("1 250 000");
  });
});
