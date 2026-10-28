import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../../test/renderPage";
import ConditionsIncoterm from "./ConditionsIncoterm";

// Incoterms® 2020 (2026-10-28) : le panneau affiche « FOB [lieu], Incoterms®
// 2020 », l'état de l'accord, et propose la validation à la partie qui ne l'a
// pas encore donnée.
describe("ConditionsIncoterm", () => {
  it("affiche la règle avec son lieu nommé et invite le vendeur à valider", async () => {
    const vendeur = utilisateurTest("partenaire");
    connecter(vendeur);
    simulerApi({ user: vendeur, routes: { "/api/incoterms/commandes/transaction/t1": {
      role: "vendeur", peutModifier: true, peutValider: true, suggestion: null,
      conditions: { regle: "FOB", lieuNomme: "Port de Jebel Ali", version: "2020", statut: "propose", libelle: "FOB Port de Jebel Ali, Incoterms® 2020",
        valideAcheteur: { le: "2026-10-28" }, valideVendeur: { le: null }, avertissements: [], historique: [{ action: "proposition", role: "acheteur", regle: "FOB", lieuNomme: "Port de Jebel Ali", le: "2026-10-28" }] },
    } } });
    renderPage(<ConditionsIncoterm type="transaction" id="t1" />);
    expect(await screen.findByText("FOB Port de Jebel Ali, Incoterms® 2020")).toBeTruthy();
    expect(screen.getByText(/en attente de validation/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Valider ces conditions" })).toBeTruthy();
    expect(screen.getByText(/ne désignent pas d'office qui commande ni qui paie/)).toBeTruthy();
  });

  it("sans accord, rappelle la règle de l'annonce et exige un lieu à la saisie", async () => {
    const acheteur = utilisateurTest("client");
    connecter(acheteur);
    simulerApi({ user: acheteur, routes: { "/api/incoterms/commandes/transaction/t2": { role: "acheteur", peutModifier: true, peutValider: false, conditions: null, suggestion: { regle: "CIF" } } } });
    renderPage(<ConditionsIncoterm type="transaction" id="t2" />);
    expect(await screen.findByText(/L'annonce indique CIF/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Proposer des conditions" }));
    const lieu = screen.getByLabelText("Lieu ou port convenu");
    expect(lieu.required).toBe(true);
    expect(screen.getByLabelText("Règle").value).toBe("CIF");
  });
});
