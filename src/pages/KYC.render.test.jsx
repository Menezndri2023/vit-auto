import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import KYC from "./KYC";

// apiClient lit le content-type ; simulerApi n'en fournit pas.
function avecEnTetesJson() {
  const base = globalThis.fetch;
  globalThis.fetch = async (...a) => ({ headers: new Headers({ "content-type": "application/json" }), ...(await base(...a)) });
}

describe("Page KYC", () => {
  it("un compte déjà VERIFIE sans date de soumission (approbation Founding) voit son résultat, pas le formulaire", async () => {
    const partenaire = utilisateurTest("partenaire", { kycStatus: "VERIFIE" });
    connecter(partenaire);
    simulerApi({ user: partenaire, routes: { "/api/kyc/status": {
      emailVerified: true, phoneVerified: false, hasEmail: true, hasPhone: false,
      kycStatus: "VERIFIE", kycScore: 100, kycSubmittedAt: null,
    } } });
    avecEnTetesJson();
    renderPage(<KYC />, { route: "/kyc" });
    expect(await screen.findByText(/Votre identité a été vérifiée/)).toBeTruthy();
    expect(screen.queryByText("Coordonnées de contact")).toBeNull();
  });

  it("à l'ouverture, aucun modèle OCR n'est téléchargé", async () => {
    const client = utilisateurTest("client");
    connecter(client);
    const { appels } = simulerApi({ user: client, routes: { "/api/kyc/status": { emailVerified: true, kycStatus: "EN_ATTENTE" } } });
    renderPage(<KYC />, { route: "/kyc" });
    expect(await screen.findByText("Coordonnées de contact")).toBeTruthy();
    expect(appels.some((u) => /traineddata|tesseract/.test(u))).toBe(false);
  });
});
