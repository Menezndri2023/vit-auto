import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";
import LogistiqueVendeur from "./LogistiqueVendeur";

// Espace vendeur / exportateur (2026-10-28) : il voit l'Incoterm de la
// commande et les rôles déclarés, confirme l'enlèvement — sans prix de
// transport ni coordonnées du client.

const DOSSIER = {
  _id: "0000000000000000000000c1", reference: "VA-LOG-2026-000009", typeBesoin: "vehicule", statut: "devis_accepte",
  depart: { pays: "AE", ville: "Dubaï" }, arrivee: { pays: "MA", ville: "Casablanca" }, modeSouhaite: "maritime",
  commandeLiee: { type: "transaction", reference: "TXN-ABCDEF12", libelle: "Transaction VIT-AUTO Trade" },
  incotermCommande: { regle: "FOB", lieuNomme: "Port de Jebel Ali", version: "2020", statut: "accepte", libelle: "FOB Port de Jebel Ali, Incoterms® 2020" },
  donneurOrdre: "a_confirmer", payeur: "a_confirmer", enlevement: { confirmeLe: null }, documents: [],
  prestataireRetenu: { raisonSociale: "Atlas Transport" }, evenements: [],
};

let erreurs;
beforeEach(() => { erreurs = surveillerErreurs(); });

describe("VIT-AUTO Logistique — espace exportateur", () => {
  it("affiche l'Incoterm et rappelle qu'il ne désigne pas qui commande ni qui paie ; ouvre la confirmation d'enlèvement", async () => {
    const vendeur = utilisateurTest("partenaire");
    connecter(vendeur);
    simulerApi({ user: vendeur, routes: { "/api/logistique/vendeur/demandes/": { demande: DOSSIER } } });
    const { container } = renderPage(<LogistiqueVendeur />, { route: `/logistique/vendeur/${DOSSIER._id}`, path: "/logistique/vendeur/:id" });

    expect(await screen.findByText(/FOB Port de Jebel Ali, Incoterms® 2020/)).toBeTruthy();
    expect(container.textContent).toMatch(/habituellement organisé par l'acheteur/);
    expect(container.textContent).toMatch(/seules les parties décident qui commande et qui paie/);
    expect(screen.getAllByText("À confirmer").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toMatch(/€|EUR|\$/);

    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'enlèvement" }));
    expect(screen.getByLabelText("Lieu d'enlèvement").required).toBe(true);
    expect(screen.getByLabelText("Volume (m³)")).toBeTruthy();
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages).toEqual([]);
  });

  it("liste les transports rattachés aux ventes", async () => {
    const vendeur = utilisateurTest("partenaire");
    connecter(vendeur);
    simulerApi({ user: vendeur, routes: { "/api/logistique/vendeur/demandes": { demandes: [DOSSIER] } } });
    renderPage(<LogistiqueVendeur />, { route: "/logistique/vendeur", path: "/logistique/vendeur" });
    expect(await screen.findByText("VA-LOG-2026-000009")).toBeTruthy();
    expect(screen.getByText("Enlèvement à confirmer")).toBeTruthy();
  });
});
