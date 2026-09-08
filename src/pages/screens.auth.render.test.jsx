import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, simulerApi, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import Login from "./Login";
import Register from "./Register";
import ImportExport from "./ImportExport";

// Connexion, inscription et vitrine Import/Export. Ces deux premiers écrans
// dépendent de GoogleOAuthProvider, fourni par renderPage — il vit dans
// main.jsx et non dans App.jsx, ce qui est facile à oublier.

describe("Connexion, inscription et Import/Export — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); simulerApi({ user: null }); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary déclenché`).toBeNull();
  };

  it("Connexion", () => { renderPage(<Login />, { route: "/login" }); verifier("Connexion"); });
  it("Inscription", () => { renderPage(<Register />, { route: "/register" }); verifier("Inscription"); });
  it("Import / Export", () => { renderPage(<ImportExport />, { route: "/import-export" }); verifier("Import/Export"); });
});
