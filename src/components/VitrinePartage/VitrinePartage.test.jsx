/* global global */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VitrinePartage from "./VitrinePartage.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// LE LIEN DE VITRINE DOIT ÊTRE DONNÉ, PAS DEVINÉ
// ═══════════════════════════════════════════════════════════════════════════
// Consigne de l'exploitant (2026-09-25). La page /partner/:id existait depuis
// longtemps ; ce qui manquait, c'est qu'AUCUN écran ne donnait le lien — ni au
// partenaire, ni à l'administrateur. Il fallait le fabriquer à la main depuis
// la barre d'adresse, ce qu'aucun partenaire ne fera.

const reponse = (corps) => Promise.resolve({ ok: true, json: () => Promise.resolve(corps) });

const VITRINE_OUVERTE = {
  partenaire: { id: "68f", nom: "Boyzone Car" },
  lien: "https://vit-auto.com/partner/68f",
  lienCourt: "https://vit-auto.com/p/boyzone-car",
  slug: "boyzone-car",
  qr: "data:image/png;base64,iVBORw0KGgo=",
  annonces: 6,
  lienCourtOuvert: true,
};

const VITRINE_FERMEE = {
  partenaire: { id: "68f", nom: "Petit Loueur" },
  lien: "https://vit-auto.com/partner/68f",
  lienCourt: null,
  slug: null,
  qr: null,
  annonces: 2,
  lienCourtOuvert: false,
  planRequis: "individuel_plus",
  message: "Cette fonctionnalité est incluse à partir du plan Essentiel.",
};

beforeEach(() => { global.fetch = vi.fn(() => reponse(VITRINE_OUVERTE)); });
afterEach(() => { vi.restoreAllMocks(); });

describe("VitrinePartage", () => {
  it("affiche l'adresse courte, l'adresse complète et le QR code", async () => {
    render(<VitrinePartage />);
    expect(await screen.findByDisplayValue("https://vit-auto.com/p/boyzone-car")).toBeTruthy();
    expect(screen.getByDisplayValue("https://vit-auto.com/partner/68f")).toBeTruthy();
    expect(screen.getByRole("img", { name: /QR code/i })).toBeTruthy();
  });

  it("demande SA vitrine quand aucun partenaire n'est précisé", async () => {
    render(<VitrinePartage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][0]).toBe("/api/partenaires/ma-vitrine");
  });

  it("demande celle d'un partenaire donné pour l'administrateur", async () => {
    render(<VitrinePartage partenaireId="68f" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][0]).toBe("/api/partenaires/68f/vitrine");
    expect(await screen.findByText(/Vitrine de Boyzone Car/)).toBeTruthy();
  });

  // LE point du palier : sans lien court, la page reste partageable. Afficher
  // un verrou sans donner d'adresse de repli laisserait le partenaire sans
  // rien — or la décision de l'exploitant est que la page reste publique.
  it("sans lien court, donne quand même l'adresse complète et dit ce qui manque", async () => {
    global.fetch = vi.fn(() => reponse(VITRINE_FERMEE));
    render(<VitrinePartage />);

    expect(await screen.findByDisplayValue("https://vit-auto.com/partner/68f")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /QR code/i })).toBeNull();
    expect(screen.getByText(/à partir du plan Essentiel/i)).toBeTruthy();
  });

  // Une vitrine vide se dit, elle ne se cache pas : un partenaire qui partage
  // un lien vers une page sans annonce doit l'apprendre de nous, pas de son
  // client.
  it("prévient quand la vitrine ne contient aucune annonce", async () => {
    global.fetch = vi.fn(() => reponse({ ...VITRINE_OUVERTE, annonces: 0 }));
    render(<VitrinePartage />);
    expect(await screen.findByText(/elle sera vide/i)).toBeTruthy();
  });

  it("ne casse pas la page quand le serveur ne répond pas", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("réseau")));
    render(<VitrinePartage />);
    expect(await screen.findByText(/indisponible/i)).toBeTruthy();
  });
});
