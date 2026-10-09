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

// Règle de l'exploitant (2026-10-09) : le visiteur ne voit QUE les annonces de
// son pays ; un pays vide affiche l'état vide qui le dit et propose
// l'international (plus de repli automatique).
describe("Catalogue — pays du visiteur seulement", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });

  // Place le visiteur dans un pays donné : le choix de la visite en cours,
  // lu par CurrencyContext au montage.
  const visiteurEn = (code) => {
    try { sessionStorage.setItem("vit_pays_choisi", code); } catch { /* stockage indisponible */ }
  };

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary`).toBeNull();
  };

  it("pays du visiteur vide : aucune annonce étrangère, l'état vide le dit et propose l'international", async () => {
    // Le cas de l'incident du 2026-09-11 : visiteur en Côte d'Ivoire, annonces
    // au Maroc et en France. La page n'est pas blanche : elle explique.
    visiteurEn("CI");
    simulerApi({
      routes: {
        "/api/vehicles": { vehicles: [vehicule("a", "MA", "Dacia Logan"), vehicule("b", "FR", "Peugeot 208")], total: 2, pages: 1 },
      },
    });
    const { container } = renderPage(<Catalogue />, { route: "/catalogue" });

    expect(await screen.findByText(/Aucune annonce dans votre pays/i)).toBeTruthy();
    verifier("Catalogue pays vide");
    expect(container.textContent).not.toMatch(/Dacia Logan|Peugeot 208/);
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
    expect(container.textContent).not.toMatch(/Aucune annonce dans votre pays/i);
  });
});
