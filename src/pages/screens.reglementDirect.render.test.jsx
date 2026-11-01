import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import IETransactionTracking from "./IETransactionTracking";

// Séquestre suspendu (2026-10-30) : à l'étape de règlement, l'acheteur voit le
// règlement direct — jamais un « compte d'entiercement » ni un paiement par carte.
// Règle du 2026-10-31 : il ne peut déclarer son règlement qu'une fois les
// conditions acceptées par les DEUX parties.

const transaction = (client, reglementDirect) => ({
  _id: "tx1", status: "payment_pending", client: { _id: client._id }, partner: { _id: "p1" },
  finalOffer: { totalAmount: 25000, currency: "EUR" }, statusHistory: [], documents: {}, reglementDirect,
});
// Routes les plus précises d'abord : la simulation compare par inclusion.
const routes = (client, reglementDirect) => ({
  "/api/pricing/config": { sequestreIeActif: false },
  "/api/import-export/transactions/tx1/conditions": { courante: null, acceptations: {}, accepteeParLesDeux: false, versions: [] },
  "/api/import-export/transactions/tx1/litiges": { litiges: [] },
  "/api/import-export/transactions/tx1": { transaction: transaction(client, reglementDirect) },
});

describe("Suivi Import/Export — règlement direct", () => {
  it("conditions pas encore acceptées par les deux : aucune déclaration possible, l'étape 1 est expliquée", async () => {
    const client = utilisateurTest("client");
    connecter(client);
    simulerApi({ user: client, routes: routes(client, { etat: "none" }) });
    renderPage(<IETransactionTracking />, { route: "/import-export/transaction/tx1", path: "/import-export/transaction/:id" });
    expect(await screen.findByText("Règlement direct avec l'exportateur")).toBeTruthy();
    expect(screen.getByText(/ne reçoit pas, ne conserve pas et ne garantit pas/)).toBeTruthy();
    expect(screen.getByText(/acceptées par l'acheteur ET par le vendeur/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Je déclare avoir réglé l'exportateur" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/entiercement|Payer par carte/);
  });

  it("conditions acceptées par les deux : l'acheteur déclare son règlement, preuve facultative", async () => {
    const client = utilisateurTest("client");
    connecter(client);
    simulerApi({ user: client, routes: routes(client, { etat: "terms_accepted" }) });
    renderPage(<IETransactionTracking />, { route: "/import-export/transaction/tx1", path: "/import-export/transaction/:id" });
    expect(await screen.findByRole("button", { name: "Je déclare avoir réglé l'exportateur" })).toBeTruthy();
    expect(screen.getByLabelText(/Preuve de règlement \(facultatif/)).toBeTruthy();
    expect(screen.getByText(/✅ Conditions acceptées par les deux parties/)).toBeTruthy();
    expect(screen.getByText(/⏳ Réception confirmée par le vendeur/)).toBeTruthy();
  });
});
