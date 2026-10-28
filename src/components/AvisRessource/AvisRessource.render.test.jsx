import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, simulerApi } from "../../test/renderPage";
import AvisRessource from "./AvisRessource";

// Avis Experiences / Parts (2026-10-27) : la fiche affiche les vrais avis de
// la ressource, et le dit quand il n'y en a pas.
describe("AvisRessource", () => {
  it("affiche les avis d'une pièce avec la moyenne, et interroge la bonne cible", async () => {
    const { appels } = simulerApi({ routes: { "/api/reviews?targetType=part": {
      reviews: [{ _id: "r1", note: 4, commentaire: "Conforme et bien emballé", createdAt: "2026-10-20", reviewer: { firstName: "Sara", lastName: "Benali" } }],
      noteMoyenne: 4, total: 1,
    } } });
    renderPage(<AvisRessource targetType="part" targetId="abc123" />);
    expect(await screen.findByText("Conforme et bien emballé")).toBeTruthy();
    expect(screen.getByText("Sara B.")).toBeTruthy();
    expect(appels.some((u) => u.includes("targetType=part&targetId=abc123"))).toBe(true);
  });

  it("dit qu'il n'y a pas encore d'avis, sans en inventer", async () => {
    simulerApi({ routes: { "/api/reviews?targetType=activity": { reviews: [], noteMoyenne: 0, total: 0 } } });
    renderPage(<AvisRessource targetType="activity" targetId="xyz" />);
    expect(await screen.findByText("Aucun avis pour le moment.")).toBeTruthy();
  });
});
