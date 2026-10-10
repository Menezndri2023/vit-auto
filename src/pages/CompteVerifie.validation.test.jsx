import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import PartnerCertification from "./PartnerCertification";
import PartnerPMSDashboard from "./PartnerPMSDashboard";

// Plainte du 2026-10-10 : un loueur VALIDÉ (documents complets) voyait encore
// la certification « non commencée », des critères « En attente » et le badge
// VERIFIED verrouillé, et croyait qu'on lui demandait toujours de se faire
// vérifier. Ces écrans suivent désormais la validation calculée par le
// serveur (/api/users/me/validation).

const VALIDE = { validation: { statut: "valide", exiges: [], manquants: [] } };
const A_COMPLETER = { validation: { statut: "a_completer", exiges: [], manquants: [{ code: "registre", libelle: "Registre de commerce", lien: "/partner-certification" }] } };
const ATTENTE = { timeout: 5000 };
const partenaire = utilisateurTest("partenaire", { kycStatus: "VERIFIE", entityType: "entreprise" });

const ouvrir = (element, route, path, validation, routes = {}) => {
  connecter(partenaire);
  // En production, PartnerRoute attend l'utilisateur avant de monter la page ;
  // ici il est posé d'emblée, sans quoi le PMS redirige vers la connexion.
  try { localStorage.setItem("vit-auto-user", JSON.stringify(partenaire)); } catch { /* stockage indisponible */ }
  simulerApi({ user: partenaire, routes: { "/api/users/me/validation": validation, ...routes } });
  renderPage(element, { route, path });
};

describe("Partenaire validé : plus aucune démarche affichée comme due", () => {
  it("page Certification : bandeau « compte vérifié », certification présentée comme facultative", async () => {
    ouvrir(<PartnerCertification />, "/partner-certification", "/partner-certification", VALIDE,
      { "/api/certification/status": { certification: null } });
    await waitFor(() => expect(screen.getByText(/Votre compte partenaire est vérifié/)).toBeInTheDocument(), ATTENTE);
    expect(screen.getByText(/facultative/)).toBeInTheDocument();
  });

  it("PMS, Mon Entreprise : bandeau « compte vérifié » pour un partenaire validé", async () => {
    ouvrir(<PartnerPMSDashboard />, "/partner-pms?section=company", "/partner-pms", VALIDE);
    await waitFor(() => expect(screen.getByText(/Votre compte partenaire est vérifié/)).toBeInTheDocument(), ATTENTE);
  });

  it("PMS, Mon Entreprise : pas de bandeau tant que des pièces manquent", async () => {
    ouvrir(<PartnerPMSDashboard />, "/partner-pms?section=company", "/partner-pms", A_COMPLETER);
    await waitFor(() => expect(screen.getByText(/Certification VIT AUTO en 8 étapes/)).toBeInTheDocument(), ATTENTE);
    expect(screen.queryByText(/Votre compte partenaire est vérifié/)).toBeNull();
  });
});
