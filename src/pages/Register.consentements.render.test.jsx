import { describe, it, expect } from "vitest";
import { renderPage, simulerApi } from "../test/renderPage";
import Register from "./Register";

// Inscription (2026-11-02) : les accords se lisent juste avant « Créer mon
// compte », et les champs propres à Google (date de naissance, pays) ne
// s'affichent qu'après un clic sur le bouton Google — jamais en double d'emblée.
describe("Inscription : accords et parcours Google", () => {
  it("les accords précèdent immédiatement le bouton de création ; aucun champ Google avant le clic", () => {
    simulerApi();
    const { container } = renderPage(<Register />, { route: "/register" });
    const formulaire = container.querySelector("form");
    const enfants = [...formulaire.children];
    const iBouton = enfants.findIndex((e) => e.matches("button[type=submit]"));
    expect(enfants[iBouton - 1]?.tagName).toBe("FIELDSET");
    expect(enfants[iBouton - 1].querySelectorAll("input[type=checkbox]")).toHaveLength(2);
    // Une seule paire de cases, une seule date de naissance à l'ouverture.
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
    expect(container.querySelector("#google-birthDate")).toBeNull();
    expect(container.querySelectorAll("input[type=date]")).toHaveLength(1);
  });
});
