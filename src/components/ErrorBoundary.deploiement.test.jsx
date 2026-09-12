import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

// Un visiteur qui a chargé la page AVANT un déploiement, puis navigue APRÈS,
// demande un fichier JS à empreinte de l'ancienne version — que l'hébergeur ne
// sert plus. Ce n'est pas un bug de l'application : la nouvelle version
// attend, il suffit de recharger. Avant ce correctif, il voyait l'écran
// « Une erreur s'est produite ».

const CLE = "vit-auto-rechargement-apres-deploiement";
const Casse = ({ message }) => { throw new Error(message); };

describe("ErrorBoundary après un déploiement", () => {
  let reload;
  beforeEach(() => {
    sessionStorage.removeItem(CLE);
    reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("recharge la page quand un morceau de page de l'ancienne version manque", () => {
    render(<ErrorBoundary><Casse message="Failed to fetch dynamically imported module: https://vit-auto.com/assets/Catalogue-abc123.js" /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CLE)).toBeTruthy();
  });

  it("ne recharge qu'UNE fois : si le fichier manque pour une autre raison, on ne boucle pas", () => {
    sessionStorage.setItem(CLE, "déjà");
    render(<ErrorBoundary><Casse message="Importing a module script failed." /></ErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/Une erreur s'est produite|Something went wrong/)).toBeTruthy();
  });

  it("une erreur ordinaire affiche l'écran d'erreur, sans recharger", () => {
    render(<ErrorBoundary><Casse message="Cannot read properties of undefined (reading 'x')" /></ErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/Une erreur s'est produite|Something went wrong/)).toBeTruthy();
  });
});
