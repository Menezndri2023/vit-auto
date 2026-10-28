import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import { DirectionSection } from "./admin/sections/DirectionSection.jsx";
import BandeauActivation from "../components/BandeauActivation/BandeauActivation";

// Tableau de bord de direction et activation (2026-10-28) : une donnée non
// mesurée s'affiche « indisponible », et les cinq notions économiques restent
// séparées.

const DIRECTION = {
  periode: {}, partenaires: { inscrits: 12, verifies: 7, actives: 4, suspendus: 1, delaiMoyenReponseMin: null },
  offresDisponibles: { location: 30, vente: 5, chauffeurs: 2, activites: 11, pieces: 0, trade: 3, total: 51 },
  demandes: { reservations: 0, parType: {}, demandesEssai: 0, demandesEssaiQualifiees: 0, transactionsTrade: 0, logistiqueSoumises: 0, logistiqueQualifiees: 0 },
  delaisReponseMin: { reservations: null, demandesEssai: null, logistiquePremiereReponseH: null },
  conversions: { reservationVersFinalisee: null, demandeEssaiVersVente: null, tradeVersFinalisee: null, logistiqueVersConclue: null },
  transactionsFinalisees: {}, volumeAffaires: { reservations: { USD: 300 }, ventes: {}, trade: {}, logistiqueDeclaree: {} },
  commissionsCalculees: { USD: 50 }, commissionsEncaissees: { USD: 20 }, commissionsParStatut: { confirmed: 1, paid: 1 }, revenuLogistique: 0,
  coutsExploitation: null, coutAcquisition: null, resultatEstime: null, nonMesure: ["Coûts d'exploitation : aucune dépense enregistrée."],
  annulations: { reservations: 0, trade: 0, logistique: 0, litigesLogistique: 0 }, remboursements: { nombre: 0, montants: {} }, activiteParMois: [],
};

describe("Direction et activation", () => {
  it("le tableau de bord sépare volume, commissions calculées et encaissées, et dit « indisponible »", async () => {
    simulerApi({ routes: { "/api/analytics/direction": { direction: DIRECTION }, "/api/analytics/activation": { partenaires: [] } } });
    const { container } = renderPage(<DirectionSection headers={{ Authorization: "Bearer x" }} />, { route: "/admin" });
    expect(await screen.findByText(/Économie — cinq notions séparées/)).toBeTruthy();
    expect(container.textContent).toMatch(/1\. Volume d'affaires.*300 USD/);
    expect(container.textContent).toMatch(/2\. Revenu brut de commission.*50 USD/);
    expect(container.textContent).toMatch(/3\. Commissions effectivement encaissées.*20 USD/);
    expect(container.textContent).toMatch(/5\. Résultat économique estiméindisponible/);
    expect(screen.getAllByText("indisponible").length).toBeGreaterThan(3);
  });

  it("le partenaire vérifié voit ce qui lui manque pour être activé", async () => {
    const p = utilisateurTest("partenaire");
    connecter(p);
    simulerApi({ user: p, routes: { "/api/users/me/activation": { activation: {
      statut: "verifie", offres: { total: 0 }, premieresDemandes: {},
      manquants: [{ code: "offresExploitables", libelle: "Au moins une offre approuvée, disponible et chiffrée" }],
    } } } });
    renderPage(<BandeauActivation token="t" styles={{}} />, { route: "/vendor/dashboard" });
    expect(await screen.findByText(/Presque activé/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /au moins une offre approuvée/ }).getAttribute("href")).toBe("/vendor/publish");
  });

  it("un compte non partenaire (admin sur le tableau de bord) n'interroge pas l'activation", async () => {
    const a = utilisateurTest("admin");
    connecter(a);
    simulerApi({ user: a });
    const espion = vi.spyOn(globalThis, "fetch");
    renderPage(<BandeauActivation token="t" styles={{}} partenaire={false} />, { route: "/vendor/dashboard" });
    await new Promise((r) => setTimeout(r, 20));
    expect(espion.mock.calls.some(([u]) => String(u).includes("/me/activation"))).toBe(false);
    espion.mockRestore();
  });
});
