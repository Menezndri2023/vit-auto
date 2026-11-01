import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../../test/renderPage";
import LitigesTransaction from "./LitigesTransaction";
import ConditionsLiberation from "./ConditionsLiberation";

// Réclamations et conditions de libération (2026-10-31) : l'écran ne laisse
// jamais entendre que des fonds sont bloqués ou sécurisés par VIT AUTO.
// (« ne bloque aucun fonds » est une négation, permise ; « fonds bloqués » non.)
const PROMESSE = /fonds (sont |restent )?bloqués|blocage des fonds|séquestr|fonds sécurisés|paiement garanti/i;

const LITIGE = {
  _id: "l1", reference: "VA-LIT-2026-000001", motif: "endommage", etat: "under_review", partieOuvrante: "acheteur",
  description: "Pare-choc arrière enfoncé à la livraison.", ouvertLe: "2026-10-31", echeanceReponse: null,
  contexte: { fondsLiberes: true }, pieces: [{ _id: "p1", nom: "Photo.jpg", url: "https://ik.example/p1", partie: "acheteur", le: "2026-10-31" }],
  messages: [{ _id: "m1", partie: "vendeur", texte: "Le véhicule est parti intact.", le: "2026-10-31" }], issue: {},
};

describe("Réclamations et conditions", () => {
  it("affiche la réclamation, sans promesse de fonds bloqués, et rappelle que VIT AUTO ne détient pas les fonds", async () => {
    const acheteur = utilisateurTest("client");
    connecter(acheteur);
    simulerApi({ user: acheteur, routes: { "/api/import-export/transactions/t1/litiges": { litiges: [LITIGE] } } });
    renderPage(<LitigesTransaction txId="t1" role="client" ouvrable />);
    expect(await screen.findByText(/VA-LIT-2026-000001/)).toBeTruthy();
    expect(screen.getByText("En cours d'examen")).toBeTruthy();
    expect(screen.getByText(/échéance non définie/)).toBeTruthy();
    expect(screen.getByText(/ne détient pas ces fonds et ne peut pas les récupérer/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ouvrir une réclamation" })).toBeNull();   // déjà une en cours
    expect(screen.queryByRole("button", { name: "Rendre une décision" })).toBeNull();      // réservé à l'admin
    expect(document.body.textContent).not.toMatch(PROMESSE);
  });

  it("l'admin voit les seules transitions permises depuis l'état courant", async () => {
    const admin = utilisateurTest("admin");
    connecter(admin);
    simulerApi({ user: admin, routes: { "/api/import-export/transactions/t1/litiges": { litiges: [LITIGE] } } });
    renderPage(<LitigesTransaction txId="t1" role="admin" ouvrable />);
    expect(await screen.findByRole("button", { name: "Rendre une décision" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rejeter" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clore" })).toBeNull();
  });

  it("conditions : version, empreinte, acceptations, et bouton d'acceptation pour la partie qui n'a pas accepté", async () => {
    const vendeur = utilisateurTest("partenaire");
    connecter(vendeur);
    simulerApi({ user: vendeur, routes: { "/api/import-export/transactions/t2/conditions": {
      courante: { version: 2, hash: "abc123", contenu: { montant: 28300, devise: "USD", livraison: { incoterm: "CIF", lieuNomme: "Port d'Abidjan" }, documentsRequis: ["Connaissement"], delaiReclamationJours: 7, roleVitAuto: "VIT AUTO ne reçoit, ne conserve, ne bloque ni ne libère aucun fonds." } },
      acceptations: { acheteur: { le: "2026-10-31" }, vendeur: null }, accepteeParLesDeux: false,
      versions: [{ version: 2, acceptations: [{}] }, { version: 1, creeLe: "2026-10-30", acceptations: [{}, {}] }],
    } } });
    renderPage(<ConditionsLiberation txId="t2" role="partner" />);
    expect(await screen.findByText("Version 2")).toBeTruthy();
    expect(screen.getByText("En attente d'acceptation")).toBeTruthy();
    expect(screen.getByText(/CIF \(Incoterms® 2020\) — Port d'Abidjan/)).toBeTruthy();
    expect(screen.getByText(/abc123/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accepter la version 2" })).toBeTruthy();
    expect(screen.getByText(/Version 1 du .* 2 acceptation\(s\), conservée telle quelle/)).toBeTruthy();
    // Rappelé deux fois : note d'introduction et clause « Rôle de VIT AUTO ».
    expect(screen.getAllByText(/ne bloque ni ne libère aucun fonds/)).toHaveLength(2);
  });
});
