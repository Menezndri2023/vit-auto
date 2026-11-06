import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import AdminPanel from "./AdminPanel";

// Suppressions de la Configuration métier (devises, pays, campagnes) et des
// barèmes de coûts d'import : elles appelaient `confirm(...)`, alors que
// `confirm` est, dans le panneau, l'état de la fenêtre de confirmation (null) —
// « confirm is not a function », clic sans effet, depuis toujours (2026-11-02).
describe("Configuration métier — suppression d'une devise", () => {
  it("demande confirmation dans la fenêtre du panneau, puis envoie la suppression", { timeout: 30000 }, async () => {
    const admin = utilisateurTest("admin", { adminScope: [] });
    connecter(admin);
    const { fetchSimule } = simulerApi({ user: admin, routes: {
      "/api/admin/business-config/pricing": { config: { commissions: { standard: {}, premium: {} }, foundingPartner: { entreprise: {}, particulier: {} }, serviceFee: {} } },
      "/api/admin/business-config/exchange-rates": { rates: [{ _id: "r1", code: "EUR", name: "Euro", symbol: "€", rateFromUSD: 0.9, active: true }] },
    } });
    const erreurs = [];
    const surRejet = (e) => erreurs.push(String(e.reason?.message || e.reason));
    window.addEventListener("unhandledrejection", surRejet);
    const { container } = renderPage(<AdminPanel />, { route: "/admin" });
    await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(10), { timeout: 5000 });

    const menu = [...container.querySelectorAll("button")].find((b) => /Configuration métier/.test(b.textContent));
    await act(async () => { fireEvent.click(menu); });
    await act(async () => { fireEvent.click(await screen.findByText("Devises & Pays")); });
    const corbeille = (await screen.findAllByRole("button", { name: "Supprimer" }))[0];
    await act(async () => { fireEvent.click(corbeille); });

    expect(await screen.findByText("Supprimer cette devise ?")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("Confirmer")); });
    await waitFor(() => expect(fetchSimule.mock.calls.some(([url, init]) =>
      /\/api\/admin\/business-config\/exchange-rates\/r1$/.test(url) && init?.method === "DELETE")).toBe(true));
    window.removeEventListener("unhandledrejection", surRejet);
    expect(erreurs.filter((m) => /confirm/.test(m))).toEqual([]);
    vi.restoreAllMocks();
  });
});
