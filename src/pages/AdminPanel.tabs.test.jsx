import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { waitFor } from "@testing-library/react";
import { renderPage, connecter, utilisateurTest } from "../test/renderPage";
import AdminPanel from "./AdminPanel";

// AdminPanel.render.test.jsx vérifie que le panneau s'ouvre — mais toujours
// sur le MÊME onglet, celui par défaut. Or le panneau en compte 44, chacun
// avec ses propres états, ses propres appels et ses propres hooks : un
// plantage propre à un onglet ne se voyait nulle part, ni au lint, ni au
// build, ni dans la suite serveur (aucun d'eux n'exécute un composant React).
//
// Ce fichier ouvre CHAQUE onglet atteignable depuis le menu et vérifie qu'il
// se rend sans lever d'exception. Un seul montage : le harnais se fige
// au-delà de cinq par fichier, et de toute façon changer d'onglet ne remonte
// pas le composant — c'est justement ce qu'on veut éprouver.

describe("Panneau d'administration — tous les onglets", () => {
  let erreursConsole;

  beforeEach(() => {
    erreursConsole = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      erreursConsole.push(args.map(String).join(" "));
    });
  });

  const PLANTAGE = /before initialization|is not a function|Cannot read propert|is not defined|Rendered (more|fewer) hooks|Objects are not valid as a React child/;

  it("chaque onglet du menu s'ouvre sans lever d'exception", async () => {
    connecter(utilisateurTest("admin", { adminScope: [] }));
    const { container } = renderPage(<AdminPanel />, { route: "/admin" });

    // L'authentification se résout de façon ASYNCHRONE : au premier rendu
    // `isAuthenticated` est encore faux et le panneau retourne `null`. Sans
    // cette attente, on inspecterait un écran vide — et tout passerait.
    await waitFor(() => {
      expect(container.querySelectorAll("button").length).toBeGreaterThan(10);
    }, { timeout: 5000 });

    // Les boutons du menu latéral sont les seuls à porter à la fois une icône
    // et un libellé dans deux <span> frères ; on les repère par leur structure
    // plutôt que par une classe, que CSS Modules réécrit à chaque build.
    const boutonsMenu = [...container.querySelectorAll("button")].filter((b) => {
      const spans = b.querySelectorAll(":scope > span");
      return spans.length >= 2 && (spans[1].textContent || "").trim().length > 2;
    });

    expect(boutonsMenu.length, "le menu d'administration doit proposer des onglets").toBeGreaterThan(10);

    const casses = [];
    for (const bouton of boutonsMenu) {
      const nom = (bouton.textContent || "").trim().slice(0, 40);
      const avant = erreursConsole.length;
      act(() => { bouton.click(); });
      const nouvelles = erreursConsole.slice(avant).filter((e) => PLANTAGE.test(e));
      const repli = /Une erreur s'est produite/i.test(container.textContent || "");
      if (nouvelles.length || repli) {
        casses.push(`${nom} → ${repli ? "ErrorBoundary" : nouvelles[0].slice(0, 160)}`);
      }
    }

    // Le compte est affirmé, pas seulement l'absence d'échec : sans lui, un
    // sélecteur devenu caduc ferait passer le test en ne cliquant sur rien.
    expect(boutonsMenu.length, "onglets réellement parcourus").toBeGreaterThanOrEqual(40);
    expect(casses, `onglets en échec (${casses.length}/${boutonsMenu.length}) :\n${casses.join("\n")}`).toEqual([]);
  });
});
