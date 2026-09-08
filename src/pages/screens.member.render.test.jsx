import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import Dashboard from "./Dashboard";
import Profile from "./Profile";
import VendorDashboard from "./VendorDashboard";

// Écrans réservés aux comptes connectés, un par rôle.
//
// C'est ce fichier qui a mis au jour un vrai défaut : VendorDashboard lisait
// `user.sellerType` sans garde et tombait dès que `user` repassait à null —
// déconnexion, ou rafraîchissement de jeton refusé. Le partenaire voyait
// « Une erreur s'est produite » au lieu d'être redirigé vers la connexion.

describe("Écrans membres — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary déclenché`).toBeNull();
  };

  it("Tableau de bord client", () => {
    connecter(utilisateurTest("client"));
    renderPage(<Dashboard />, { route: "/dashboard" });
    verifier("Tableau de bord");
  });

  it("Profil", () => {
    connecter(utilisateurTest("client"));
    renderPage(<Profile />, { route: "/profile" });
    verifier("Profil");
  });

  it("Espace partenaire", () => {
    connecter(utilisateurTest("partenaire"));
    renderPage(<VendorDashboard />, { route: "/vendor/dashboard" });
    verifier("Espace partenaire");
  });

  it("Espace partenaire survit à la fin de session (user redevenu null)", () => {
    // Reproduit le défaut corrigé : aucune session en localStorage, donc
    // `user` reste null pendant tout le rendu.
    renderPage(<VendorDashboard />, { route: "/vendor/dashboard" });
    verifier("Espace partenaire sans session");
  });
});
