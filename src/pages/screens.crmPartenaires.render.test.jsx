import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import AdminPanel from "./AdminPanel";

// CRM partenaires (2026-10-28) : activation réelle, prochaine action en
// retard, indicateurs issus du serveur, et une erreur de chargement affichée
// comme une erreur — jamais comme « aucun prospect ».

const admin = utilisateurTest("admin", { adminScope: ["partners"] });
const hier = new Date(Date.now() - 86400000).toISOString();

describe("Onglet CRM partenaires", () => {
  it("liste : activation calculée, prochaine action en retard, indicateurs réels", async () => {
    connecter(admin);
    simulerApi({ user: admin, routes: {
      "/api/partner-crm/admin/list": { total: 1, page: 1, limit: 50, items: [{
        _id: "c1", entreprise: "Garage Atlas", statut: "QUALIFIE", pays: "MA", prochaineAction: "Envoyer la grille", nextFollowUpDate: hier,
        activation: { statut: "verifie", manquants: ["offresExploitables"], offres: 0, demandesRecues: 0 },
      }] },
      "/api/partner-crm/admin/stats": { total: 1, byStatut: { QUALIFIE: 1, ABANDONNE: 0 }, aRelancer: 1, activationReelle: { comptesLies: 1, active: 0 } },
    } });
    renderPage(<AdminPanel />, { route: "/admin?tab=partner_crm", path: "/admin" });
    expect(await screen.findByText("Garage Atlas")).toBeTruthy();
    expect(screen.getByText("Vérifié").getAttribute("title")).toBe("Manque : offre");
    expect(screen.getByText(/Envoyer la grille · .*⏰/)).toBeTruthy();
    expect(screen.getByText("Activés (réel)")).toBeTruthy();
    expect(screen.getAllByText("À relancer").length).toBeGreaterThan(0);
  });

  it("un refus du serveur s'affiche comme une erreur, pas comme une liste vide", async () => {
    connecter(admin);
    const { fetchSimule } = simulerApi({ user: admin });
    const base = fetchSimule.getMockImplementation();
    fetchSimule.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("/api/partner-crm/admin/list")) return { ok: false, status: 403, json: async () => ({ message: "Accès refusé : domaine partenaires requis." }) };
      return base(input);
    });
    renderPage(<AdminPanel />, { route: "/admin?tab=partner_crm", path: "/admin" });
    expect((await screen.findByRole("alert")).textContent).toMatch(/Accès refusé/);
    expect(screen.queryByText(/Aucun prospect pour ce filtre/)).toBeNull();
    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
  });
});
