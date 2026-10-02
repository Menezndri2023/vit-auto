/* global global */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VerrouOutil from "./VerrouOutil.jsx";
import { useOutils, oublierOutils } from "../../hooks/useOutils";

vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ token: "jeton-de-test" }) }));

// ═══════════════════════════════════════════════════════════════════════════
// LE CADENAS SE LIT AVANT LE CLIC — ET NE SE DEVINE JAMAIS
// ═══════════════════════════════════════════════════════════════════════════
// Un partenaire non abonné remplissait un formulaire de promotions pour
// apprendre, à l'enregistrement, qu'il ne pouvait pas s'en servir. Le verdict
// vient du serveur (même règle que la garde) ; à défaut de verdict, l'écran
// se comporte comme avant — jamais un outil fermé à tort à un abonné.

const reponse = (corps, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(corps) });

const VERDICTS = {
  plan: "individuel_plus",
  outils: {
    promotions:   { ouvert: true, raison: "plan" },
    importFlotte: { ouvert: false, raison: "plan_insuffisant", planRequis: "business" },
  },
};

function Ecran({ feature }) {
  const outils = useOutils();
  return (
    <MemoryRouter>
      <VerrouOutil outils={outils} feature={feature} nom="Outil testé" />
      <button disabled={outils.ferme(feature)}>Enregistrer</button>
    </MemoryRouter>
  );
}

beforeEach(() => { oublierOutils(); global.fetch = vi.fn(() => reponse(VERDICTS)); });

describe("VerrouOutil", () => {
  it("outil fermé : nomme le palier COMMERCIAL, renvoie vers les plans, désactive l'action", async () => {
    render(<Ecran feature="importFlotte" />);
    await waitFor(() => expect(screen.getByRole("note")).toBeInTheDocument());
    expect(screen.getByRole("note").textContent).toMatch(/inclus à partir du plan Business/);
    expect(screen.getByRole("note").textContent).not.toMatch(/business/); // jamais l'identifiant
    expect(screen.getByRole("link", { name: "Voir les plans" }).getAttribute("href")).toBe("/plans");
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("outil ouvert : aucune mention, action disponible", async () => {
    render(<Ecran feature="promotions" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer" })).not.toBeDisabled();
  });

  it("verdict illisible (erreur serveur, réseau) : aucun cadenas — on ne ferme jamais à tort", async () => {
    global.fetch = vi.fn(() => reponse({ message: "boom" }, false));
    render(<Ecran feature="importFlotte" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer" })).not.toBeDisabled();

    oublierOutils();
    global.fetch = vi.fn(() => Promise.reject(new Error("hors ligne")));
    render(<Ecran feature="importFlotte" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryAllByRole("note")).toHaveLength(0);
  });

  it("plusieurs écrans du même compte : un seul appel, avec le jeton", async () => {
    render(<><Ecran feature="importFlotte" /><Ecran feature="promotions" /><Ecran feature="importFlotte" /></>);
    await waitFor(() => expect(screen.getAllByRole("note")).toHaveLength(2));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe("/api/subscriptions/outils");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer jeton-de-test");
  });
});
