import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, simulerApi, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import Home from "./Home";
import Catalogue from "./Catalogue";
import Services from "./Services";
import Plans from "./Plans";

// Écrans publics — rendu sans exception, pour un visiteur non connecté.
// Voir l'en-tête de AdminPanel.render.test.jsx pour la raison d'être de ces
// tests, et src/test/renderPage.jsx pour la limite de ~5 écrans par fichier.

describe("Écrans publics — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); simulerApi({ user: null }); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary déclenché`).toBeNull();
  };

  it("Accueil", () => { renderPage(<Home />, { route: "/" }); verifier("Accueil"); });
  it("Catalogue", () => { renderPage(<Catalogue />, { route: "/catalogue" }); verifier("Catalogue"); });
  it("Services", () => { renderPage(<Services />, { route: "/services" }); verifier("Services"); });
  it("Tarifs", () => { renderPage(<Plans />, { route: "/plans" }); verifier("Tarifs"); });
});
