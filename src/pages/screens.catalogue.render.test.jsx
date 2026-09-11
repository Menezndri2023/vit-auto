import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, simulerApi, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";
import Catalogue from "./Catalogue";

// Incident du 2026-09-11, reproduit ici.
//
// Les 345 annonces publiées étaient au Maroc et en France. Le catalogue ne
// passe aucun pays à l'API — il charge tout et filtre CÔTÉ CLIENT. Pour un
// visiteur en Côte d'Ivoire, ce filtre vidait la page entière : ni véhicule,
// ni image, rien. De sa fenêtre, le site était cassé.
//
// Le filtre pays est un confort, pas une règle : quand il ne laisse rien
// passer, l'international vaut mieux qu'une page blanche — et il faut le DIRE,
// sans quoi le visiteur croit à une erreur.

const vehicule = (id, country, titre) => ({
  _id: id, id, title: titre, titre, type: "location", mode: "Louer",
  pricePerDay: 60, prix: 60, country, ville: "Casablanca",
  images: [`https://ik.imagekit.io/vitauto/${id}.jpg`],
  status: "approved", available: true,
});

describe("Catalogue — repli mondial", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });

  // Place le visiteur dans un pays donné, comme le fait CurrencyContext au
  // chargement (clé lue une seule fois, au montage).
  const visiteurEn = (code) => {
    try { localStorage.setItem("vit_catalog_country", code); } catch { /* stockage indisponible */ }
  };

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary`).toBeNull();
  };

  it("montre les annonces internationales et le dit, quand le pays du visiteur est vide", async () => {
    // Le cas exact de l'incident : visiteur en Côte d'Ivoire, annonces au Maroc
    // et en France.
    visiteurEn("CI");
    simulerApi({
      routes: {
        "/api/vehicles": { vehicles: [vehicule("a", "MA", "Dacia Logan"), vehicule("b", "FR", "Peugeot 208")], total: 2, pages: 1 },
      },
    });
    const { container } = renderPage(<Catalogue />, { route: "/catalogue" });

    // Les annonces arrivent d'un fetch : `findBy…` et non `getBy…`, sinon le
    // test constaterait seulement que le premier rendu est vide.
    expect(await screen.findByText(/Dacia Logan/)).toBeTruthy();
    verifier("Catalogue repli");
    expect(container.textContent).toMatch(/annonces disponibles à l'international/i);
  });

  it("ne dit rien quand il y a des annonces du pays du visiteur", async () => {
    visiteurEn("MA");
    simulerApi({
      routes: {
        "/api/vehicles": { vehicles: [vehicule("a", "MA", "Dacia locale")], total: 1, pages: 1 },
      },
    });
    const { container } = renderPage(<Catalogue />, { route: "/catalogue" });
    expect(await screen.findByText(/Dacia locale/)).toBeTruthy();
    verifier("Catalogue local");
    expect(container.textContent).not.toMatch(/annonces disponibles à l'international/i);
  });
});
