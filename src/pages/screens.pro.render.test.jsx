import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import VendorPro from "./VendorPro";
import Plans from "./Plans";

// Espace Pro — les quatre avantages d'abonnement réunis sur un écran.
//
// Le cas qui compte est le PREMIER : un partenaire sans abonnement. C'est
// l'état de tous les comptes en production aujourd'hui, et l'écran doit y
// afficher un verrou lisible plutôt qu'une page blanche ou une exception —
// chaque onglet interroge une route qui lui répond 403.

describe("Espace Pro — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary déclenché`).toBeNull();
  };

  it("s'affiche pour un partenaire sans abonnement", () => {
    connecter(utilisateurTest("partenaire"));
    renderPage(<VendorPro />, { route: "/vendor/pro" });
    verifier("Espace Pro");
    expect(screen.getByRole("heading", { name: /Espace Pro/i })).toBeTruthy();
    // Les quatre onglets sont présents dès le premier rendu : c'est ce qui
    // donne au non-abonné une raison de s'abonner.
    for (const libelle of [/Statistiques/, /Demandes clients/, /Équipe/, /Accès API/, /Assistance/]) {
      expect(screen.getByRole("tab", { name: libelle })).toBeTruthy();
    }
  });

  it("s'affiche pour un partenaire abonné, sans exception", () => {
    simulerApi({
      user: utilisateurTest("partenaire"),
      routes: {
        "/api/subscriptions/me": { subscription: { plan: "exportateur" }, includedBoosts: { total: 6, utilises: 0, restants: 6 } },
        "/api/subscriptions/insights": { annonces: [], resume: null },
      },
    });
    connecter(utilisateurTest("partenaire"));
    renderPage(<VendorPro />, { route: "/vendor/pro" });
    verifier("Espace Pro abonné");
  });

  it("la page Tarifs n'annonce plus de fonctionnalité « bientôt »", () => {
    // Les quatre derniers avantages « en préparation » sont construits. Laisser
    // le pictogramme 🔜 sur la page de vente ferait douter d'un produit livré —
    // et ce test tombera si l'un d'eux repasse en attente sans que la grille
    // soit revue.
    connecter(utilisateurTest("partenaire"));
    const { container } = renderPage(<Plans />, { route: "/plans" });
    verifier("Tarifs");
    expect(container.textContent).not.toMatch(/🔜/);
    expect(container.textContent).toMatch(/Accès API/);
    expect(container.textContent).toMatch(/accès utilisateurs/);
    // Les paliers d'incitation doivent être annoncés, sinon ils n'incitent
    // personne : construits mais invisibles, ils ne valent rien.
    expect(container.textContent).toMatch(/Demandes clients/);
    expect(container.textContent).toMatch(/places en vitrine d'accueil/);
    expect(container.textContent).toMatch(/Bilan mensuel/);
  });
});
