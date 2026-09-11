import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { AuthProvider, useAuth } from "./AuthContext";
import { simulerApi } from "../test/renderPage";

// Toute déconnexion doit ramener à l'accueil — y compris depuis une page
// protégée, et y compris quand c'est le serveur qui coupe la session
// (événement "vit:logout" émis par apiClient sur un 401 non rattrapable).
// Auparavant chaque appelant décidait seul, et la navbar ne naviguait nulle
// part : l'utilisateur restait sur une page devenue vide.

function PageProtegee() {
  const { logout } = useAuth();
  return <button onClick={() => logout()}>Déconnexion</button>;
}

const monter = () =>
  render(
    <MemoryRouter initialEntries={["/profil"]}>
      <AuthProvider>
        <Routes>
          <Route path="/profil" element={<PageProtegee />} />
          <Route path="/" element={<div data-testid="accueil">Accueil</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

describe("Déconnexion → retour à l'accueil", () => {
  beforeEach(() => {
    simulerApi({ user: null });
    try {
      localStorage.setItem("vit-auto-token", "jeton-de-test");
      localStorage.setItem("vit-auto-refresh", "refresh-de-test");
    } catch { /* stockage indisponible */ }
  });

  it("le bouton Déconnexion quitte la page protégée pour l'accueil", async () => {
    monter();
    // Contrôle à l'envers : sans le clic, on est bien encore sur la page
    // protégée — sinon le test passerait pour une raison sans rapport.
    expect(screen.queryByTestId("accueil")).toBeNull();

    screen.getByText("Déconnexion").click();

    await waitFor(() => expect(screen.getByTestId("accueil")).toBeTruthy());
  });

  it("une session coupée par le serveur ramène aussi à l'accueil", async () => {
    monter();
    expect(screen.queryByTestId("accueil")).toBeNull();

    window.dispatchEvent(new Event("vit:logout"));

    await waitFor(() => expect(screen.getByTestId("accueil")).toBeTruthy());
  });
});
