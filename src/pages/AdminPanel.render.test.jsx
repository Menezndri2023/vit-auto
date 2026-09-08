import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, utilisateurTest } from "../test/renderPage";
import AdminPanel from "./AdminPanel";

// LE test qui manquait le 2026-09-08.
//
// Le panneau d'administration entier était remplacé par l'écran « Une erreur
// s'est produite » : `const headers = useMemo(...)` était déclaré ~550 lignes
// plus bas qu'un `useCallback` qui le citait dans son TABLEAU DE DÉPENDANCES.
// Un tableau de dépendances est évalué à chaque rendu — la lecture tombait donc
// dans la zone morte temporelle du `const` et levait « Cannot access 'headers'
// before initialization » dès la première ligne de rendu.
//
// Ni la suite serveur (1040 tests), ni le lint, ni le build ne pouvaient le
// voir : aucun n'exécute un composant React. Ce fichier ferme ce trou.
//
// Ce qui est vérifié ici n'est pas l'apparence, mais le fait BRUT que l'écran
// se rende sans lever d'exception — pour l'administrateur général comme pour un
// admin assigné.

describe("Panneau d'administration — rendu", () => {
  let erreursConsole;

  beforeEach(() => {
    // Une exception attrapée par un ErrorBoundary n'échoue pas le test toute
    // seule : React la journalise et affiche le repli. On surveille donc la
    // console pour ne rien laisser passer silencieusement.
    erreursConsole = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      erreursConsole.push(args.map(String).join(" "));
    });
  });

  const attendreAucunPlantage = () => {
    const plantages = erreursConsole.filter((e) =>
      /before initialization|is not a function|Cannot read propert|is not defined|Rendered (more|fewer) hooks/.test(e)
    );
    expect(plantages, `le panneau a levé une exception au rendu :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), "l'ErrorBoundary a pris la main").toBeNull();
  };

  it("s'affiche pour l'administrateur général (aucun secteur assigné)", async () => {
    connecter(utilisateurTest("admin", { adminScope: [] }));
    renderPage(<AdminPanel />, { route: "/admin" });
    attendreAucunPlantage();
  });

  it("s'affiche pour un administrateur « super_admin » explicite", async () => {
    // Forme réellement présente en base sur le compte de production.
    connecter(utilisateurTest("admin", { adminScope: ["super_admin"] }));
    renderPage(<AdminPanel />, { route: "/admin" });
    attendreAucunPlantage();
  });

  it("s'affiche pour un administrateur assigné à un seul secteur", async () => {
    connecter(utilisateurTest("admin", { adminScope: ["bookings"] }));
    renderPage(<AdminPanel />, { route: "/admin" });
    attendreAucunPlantage();
  });

  it("s'affiche quand le serveur ne transmet pas adminScope (ancienne session)", async () => {
    // Cas déjà rencontré : `adminScope` absent ne doit jamais être confondu
    // avec « aucune permission », sous peine de panneau vide.
    connecter(utilisateurTest("admin"));
    renderPage(<AdminPanel />, { route: "/admin" });
    attendreAucunPlantage();
  });

  it("ne rend rien pour un compte non-administrateur, sans planter", async () => {
    connecter(utilisateurTest("client"));
    renderPage(<AdminPanel />, { route: "/admin" });
    attendreAucunPlantage();
  });
});
