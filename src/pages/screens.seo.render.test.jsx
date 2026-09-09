import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, simulerApi, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";
import { slugifyCity } from "../constants/citySlug";

import LocalLanding from "./LocalLanding";

// Pages d'entrée par ville (référencement local). Elles montent la pile de
// contextes complète et lisent un paramètre d'URL : c'est exactement le genre
// d'écran qui se rend en apparence puis plante sur une donnée absente.

describe("Slug de ville", () => {
  it("retire les accents et la ponctuation", () => {
    // Le sitemap et l'application DOIVENT produire la même chaîne : un écart
    // publierait des adresses que le site ne sait pas résoudre.
    expect(slugifyCity("Abidjan")).toBe("abidjan");
    expect(slugifyCity("Bouaké")).toBe("bouake");
    expect(slugifyCity("Saint-Louis")).toBe("saint-louis");
    expect(slugifyCity("  Casablanca  ")).toBe("casablanca");
  });

  it("ne renvoie jamais de tirets aux extrémités", () => {
    expect(slugifyCity("— Dakar —")).toBe("dakar");
    expect(slugifyCity("")).toBe("");
  });
});

describe("Page locale — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); simulerApi({ user: null }); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary déclenché`).toBeNull();
  };

  it("Ville sans annonce — se rend sans planter et invite vers le catalogue", () => {
    // Le cas le plus fragile : aucune donnée à afficher, nom de ville reconstruit
    // depuis le slug seul.
    renderPage(<LocalLanding mode="location" />, { route: "/location-voiture/abidjan" });
    verifier("Page locale (vide)");
    expect(screen.getByText(/Parcourir tout le catalogue/i)).toBeTruthy();
  });

  it("Mode vente — se rend sans planter", () => {
    renderPage(<LocalLanding mode="vente" />, { route: "/achat-voiture/casablanca" });
    verifier("Page locale (vente)");
  });
});
