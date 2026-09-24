import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import fs from "node:fs";
import path from "node:path";
import { useFermetureExterieure } from "./useFermetureExterieure";

// ═══════════════════════════════════════════════════════════════════════════
// LE « DEUX APPUIS » DU TÉLÉPHONE
// ═══════════════════════════════════════════════════════════════════════════
// Signalé par l'exploitant le 2026-09-24 : « je suis obligé d'appuyer deux fois
// pour que ça ouvre ». Six panneaux se fermaient sur `mousedown` — le menu
// burger sur `touchstart`, pire encore. Ces évènements PRÉCÈDENT `click` :
// fermer là démonte le panneau, la mise en page bouge, et le clic n'atteint
// plus sa cible. Le premier appui ne sert qu'à fermer.

function Panneau({ surAction }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useFermetureExterieure(ref, ouvert, () => setOuvert(false));
  return (
    <div>
      <div ref={ref}>
        <button onClick={() => setOuvert((o) => !o)}>ouvrir</button>
        {ouvert && <div data-testid="panneau">contenu</div>}
      </div>
      <button onClick={surAction}>ailleurs</button>
    </div>
  );
}

describe("useFermetureExterieure", () => {
  it("un SEUL appui dehors agit ET ferme le panneau", () => {
    const surAction = vi.fn();
    render(<Panneau surAction={surAction} />);
    fireEvent.click(screen.getByText("ouvrir"));
    expect(screen.getByTestId("panneau")).toBeTruthy();

    // Le cœur du correctif : ce clic doit faire les deux choses.
    fireEvent.click(screen.getByText("ailleurs"));
    expect(surAction).toHaveBeenCalledTimes(1);           // l'action a eu lieu
    expect(screen.queryByTestId("panneau")).toBeNull();   // et le panneau est fermé
  });

  it("ouvrir ne referme pas aussitôt : le déclencheur est dans la référence", () => {
    render(<Panneau surAction={() => {}} />);
    fireEvent.click(screen.getByText("ouvrir"));
    expect(screen.getByTestId("panneau")).toBeTruthy();
  });

  it("un clic DANS le panneau ne le ferme pas", () => {
    render(<Panneau surAction={() => {}} />);
    fireEvent.click(screen.getByText("ouvrir"));
    fireEvent.click(screen.getByTestId("panneau"));
    expect(screen.getByTestId("panneau")).toBeTruthy();
  });

  it("Échap ferme", () => {
    render(<Panneau surAction={() => {}} />);
    fireEvent.click(screen.getByText("ouvrir"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("panneau")).toBeNull();
  });

  it("n'écoute rien tant que le panneau est fermé", () => {
    const surAction = vi.fn();
    render(<Panneau surAction={surAction} />);
    fireEvent.click(screen.getByText("ailleurs"));
    expect(surAction).toHaveBeenCalledTimes(1);
  });
});

// Garde de non-régression : la prochaine fermeture au clic extérieur ne doit
// pas être réécrite à l'ancienne. `mousedown` et `touchstart` précèdent le
// clic ; les réintroduire ramènerait le double appui, invisible au test unitaire
// du composant concerné.
describe("Aucun composant ne referme sur un évènement antérieur au clic", () => {
  it("plus aucun mousedown/touchstart de fermeture dans src/", () => {
    const fautifs = [];
    (function marcher(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) marcher(p);
        else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (/addEventListener\(\s*["'](mousedown|touchstart)["']/.test(src)) {
            fautifs.push(p.replace(process.cwd() + "/", ""));
          }
        }
      }
    })(path.join(process.cwd(), "src"));
    expect(fautifs, "utiliser useFermetureExterieure (écoute `click`)").toEqual([]);
  });
});
