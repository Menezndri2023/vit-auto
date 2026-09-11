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

  // Le nom des champs n'était porté que par le `placeholder` : il disparaît
  // dès la première frappe, et celui qui relit son formulaire ne sait plus
  // quel champ il regarde. Un intitulé <label> associé reste affiché — et
  // c'est aussi la seule chose qu'un lecteur d'écran annonce.
  it("chaque champ de l'inscription porte un intitulé qui lui est associé", () => {
    renderPage(<Register />, { route: "/register" });
    const sansIntitule = [...document.querySelectorAll("form input, form select")]
      .filter((champ) => champ.type !== "radio" && champ.type !== "hidden")
      .filter((champ) => {
        const intitule = champ.id && document.querySelector(`label[for="${champ.id}"]`);
        return !intitule || !intitule.textContent.trim();
      })
      .map((champ) => champ.name || champ.id || champ.type);
    expect(sansIntitule, "champs sans intitulé associé").toEqual([]);
  });

  it("le choix client / partenaire est visible sans ouvrir de menu", () => {
    renderPage(<Register />, { route: "/register" });
    // C'était un <select> : les deux options n'apparaissaient qu'une fois le
    // menu ouvert, alors que ce choix change la nature du compte.
    const boutons = document.querySelectorAll('form input[name="role"][type="radio"]');
    expect(boutons.length, "deux choix de profil affichés").toBe(2);
    expect(screen.getByText(/Partenaire/)).toBeTruthy();
  });
});
