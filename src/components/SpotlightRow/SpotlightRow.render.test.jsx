import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, simulerApi, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../../test/renderPage";
import SpotlightRow from "./SpotlightRow";

// Bandes de mise en avant composées par le serveur.
//
// Le cas qui compte est le PREMIER : aucune activité n'est publiée en
// production aujourd'hui. La section doit alors disparaître, pas afficher une
// bande vide — une vitrine à deux vignettes donne l'impression d'un site vide.

const loisir = (id, extra = {}) => ({
  id, source: "activite", titre: `Activité ${id}`, ville: "Abidjan",
  prix: 45, unite: "personne", devise: "USD", image: null,
  dureeMinutes: 120, capacite: 4, lien: `/activity-booking/${id}`,
  origine: "merite", ...extra,
});

describe("Bande de mise en avant", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
  };

  it("ne s'affiche pas tant qu'il n'y a pas assez de contenu", async () => {
    simulerApi({ routes: { "/api/spotlight/loisirs": { items: [loisir("a"), loisir("b")] } } });
    renderPage(<SpotlightRow emplacement="loisirs" titre="Activités et loisirs" />, { route: "/" });
    // `findBy…` qui ÉCHOUE, et non un `queryBy…` immédiat : la vitrine arrive
    // d'un fetch. Une assertion synchrone constaterait seulement que le premier
    // rendu est vide — elle passerait même si la garde de seuil était retirée
    // (vérifié en injectant la régression).
    await expect(screen.findByRole("heading", { name: /Activités et loisirs/ })).rejects.toThrow();
    verifier("Bande sous le minimum");
  });

  it("affiche la bande dès que le seuil est atteint", async () => {
    simulerApi({ routes: { "/api/spotlight/loisirs": { items: [loisir("a"), loisir("b"), loisir("c")] } } });
    const { container } = renderPage(
      <SpotlightRow emplacement="loisirs" titre="Activités et loisirs" sousTitre="Près de chez vous." lienTout="/catalogue?mode=Autres" />,
      { route: "/" }
    );
    // `findBy…` et non `getBy…` : la vitrine arrive d'un fetch, elle n'est pas
    // là au premier rendu. Le test passait « pour de mauvaises raisons » avec
    // une assertion synchrone — il vérifiait un écran encore vide.
    expect(await screen.findByRole("heading", { name: /Activités et loisirs/ })).toBeTruthy();
    verifier("Bande remplie");
    expect(container.querySelectorAll("a[href^='/activity-booking/']")).toHaveLength(3);
    expect(container.textContent).toMatch(/120 min/);
    expect(container.textContent).toMatch(/jusqu'à 4 pers/);
  });

  it("survit à une vitrine indisponible sans casser la page", async () => {
    // Une section de mise en avant ne doit jamais faire tomber la page
    // d'accueil : elle se contente de ne pas s'afficher.
    simulerApi({ routes: {} });
    renderPage(<SpotlightRow emplacement="loisirs" titre="Activités et loisirs" />, { route: "/" });
    await expect(screen.findByRole("heading", { name: /Activités et loisirs/ })).rejects.toThrow();
    verifier("Bande sans données");
  });
});
