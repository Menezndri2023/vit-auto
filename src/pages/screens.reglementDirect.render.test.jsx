import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import IETransactionTracking from "./IETransactionTracking";

// Séquestre suspendu (2026-10-30) : à l'étape de règlement, l'acheteur voit le
// règlement direct — jamais un « compte d'entiercement » ni un paiement par carte.

describe("Suivi Import/Export — règlement direct", () => {
  it("l'acheteur voit qu'il règle l'exportateur directement, sans séquestre ni paiement par carte", async () => {
    const client = utilisateurTest("client");
    connecter(client);
    simulerApi({ user: client, routes: {
      "/api/pricing/config": { sequestreIeActif: false },
      "/api/import-export/transactions/tx1": { transaction: {
        _id: "tx1", status: "payment_pending", client: { _id: client._id }, partner: { _id: "p1" },
        finalOffer: { totalAmount: 25000, currency: "EUR" }, statusHistory: [], documents: {}, reglementDirect: {},
      } },
    } });
    renderPage(<IETransactionTracking />, { route: "/import-export/transaction/tx1", path: "/import-export/transaction/:id" });
    expect(await screen.findByText("Règlement direct avec l'exportateur")).toBeTruthy();
    expect(screen.getByText(/ne reçoit pas, ne conserve pas et ne garantit pas/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "J'ai réglé l'exportateur" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/entiercement|Payer par carte/);
  });
});
