import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { installerAppuiFiable } from "./appuiFiable";

// ═══════════════════════════════════════════════════════════════════════════
// LE PREMIER APPUI APRÈS UNE SAISIE NE DOIT PAS ÊTRE PERDU
// ═══════════════════════════════════════════════════════════════════════════
// Reproduction donnée par l'exploitant le 2026-09-24 : dans l'assistant de
// publication, « Suivant » demandait DEUX appuis aux étapes 1 (Identité) et 3
// (Informations) — précisément les deux où l'on tape du texte. Les étapes de
// simple sélection répondaient du premier coup.
//
// Cause : l'appui fait perdre le focus au champ, le clavier se referme, la page
// se réagence (`Keyboard.resize: "body"`) et le bouton se dérobe sous le doigt.
// Parade : empêcher le défaut de `mousedown`, dont le rôle est de déplacer le
// focus. Le champ le garde, rien ne bouge, le clic atteint sa cible.

beforeEach(() => { delete document.__vitAppuiFiable; installerAppuiFiable(); });

function Formulaire({ surSuivant }) {
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input aria-label="marque" defaultValue="" />
      <input aria-label="case" type="checkbox" />
      <label htmlFor="ville">ville</label>
      <input id="ville" aria-label="ville" />
      <button type="button" onClick={surSuivant}>Suivant</button>
    </form>
  );
}

describe("appuiFiable — champ au focus puis appui sur un bouton", () => {
  it("le champ GARDE le focus : le clavier ne se referme pas, la page ne bouge pas", () => {
    render(<Formulaire surSuivant={() => {}} />);
    const champ = screen.getByLabelText("marque");
    champ.focus();
    expect(document.activeElement).toBe(champ);

    const annule = !fireEvent.mouseDown(screen.getByText("Suivant"));
    expect(annule, "mousedown doit être annulé").toBe(true);
    expect(document.activeElement, "le champ doit garder le focus").toBe(champ);
  });

  it("le clic atteint bien le bouton — un seul appui suffit", () => {
    const surSuivant = vi.fn();
    render(<Formulaire surSuivant={surSuivant} />);
    screen.getByLabelText("marque").focus();
    fireEvent.mouseDown(screen.getByText("Suivant"));
    fireEvent.click(screen.getByText("Suivant"));
    expect(surSuivant).toHaveBeenCalledTimes(1);
  });

  it("n'intervient pas quand aucun champ n'a le focus", () => {
    render(<Formulaire surSuivant={() => {}} />);
    document.body.focus();
    const annule = !fireEvent.mouseDown(screen.getByText("Suivant"));
    expect(annule).toBe(false);
  });

  // Une case à cocher n'ouvre pas de clavier : rien ne se réagence, et
  // intervenir là gênerait sans raison.
  it("n'intervient pas depuis une case à cocher", () => {
    render(<Formulaire surSuivant={() => {}} />);
    screen.getByLabelText("case").focus();
    const annule = !fireEvent.mouseDown(screen.getByText("Suivant"));
    expect(annule).toBe(false);
  });

  // Cliquer une étiquette DOIT donner le focus à son champ : l'y empêcher
  // casserait un comportement que l'utilisateur attend.
  it("laisse une étiquette donner le focus à son champ", () => {
    render(<Formulaire surSuivant={() => {}} />);
    screen.getByLabelText("marque").focus();
    const annule = !fireEvent.mouseDown(screen.getByText("ville"));
    expect(annule).toBe(false);
  });

  it("s'installe une seule fois, même appelée plusieurs fois", () => {
    const avant = document.__vitAppuiFiable;
    installerAppuiFiable();
    installerAppuiFiable();
    expect(avant).toBe(true);
  });
});

// Les cas ci-dessus installent eux-mêmes la parade : ils valident le mécanisme,
// pas son branchement. Sans cette garde, retirer l'appel de main.jsx ne ferait
// échouer aucun test et le défaut reviendrait en silence.
describe("Branchement au démarrage", () => {
  it("main.jsx installe la parade", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "main.jsx"), "utf8");
    const appelee = src.split("\n").some((l) => /^\s*installerAppuiFiable\(\)/.test(l));
    expect(appelee, "appeler installerAppuiFiable() dans main.jsx").toBe(true);
  });
});
