import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";
import Logistique from "./Logistique";
import LogistiquePrestataire from "./LogistiquePrestataire";
import { LogistiqueSection } from "./admin/sections/LogistiqueSection.jsx";

// VIT-AUTO Logistique (2026-10-27) — mise en relation GRATUITE. Les trois
// écrans se rendent sans planter, annoncent la gratuité, et ne montrent
// jamais de revenu logistique autre que zéro.

const DEMANDE = {
  _id: "0000000000000000000000b1", reference: "VA-LOG-2026-000001", typeBesoin: "vehicule", statut: "devis_recus",
  depart: { pays: "FR", ville: "Marseille" }, arrivee: { pays: "MA", ville: "Casablanca" }, modeSouhaite: "maritime",
  marchandise: { vehicule: { marque: "Peugeot", modele: "3008", annee: 2021, roulant: true } },
  nbPrestatairesSollicites: 2, evenements: [], updatedAt: "2026-10-27T10:00:00Z",
  devis: [
    { _id: "d1", prestataire: { raisonSociale: "Atlas Transport" }, montant: 1200, devise: "EUR", statut: "propose", valideJusquau: "2027-01-01", inclus: "Roulier" },
    { _id: "d2", prestataire: { raisonSociale: "Med Transit" }, montant: 950, devise: "EUR", statut: "propose", valideJusquau: "2027-01-01" },
  ],
};

let erreurs;
beforeEach(() => { erreurs = surveillerErreurs(); });
const verifier = (nom) => {
  const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
  expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
  expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary`).toBeNull();
};

describe("VIT-AUTO Logistique — écrans", () => {
  it("client : la liste annonce la mise en relation gratuite et ouvre le formulaire adapté au besoin", async () => {
    const client = utilisateurTest("client");
    connecter(client);
    simulerApi({ user: client, routes: { "/api/logistique/demandes": { demandes: [] } } });
    const { container } = renderPage(<Logistique />, { route: "/logistique" });

    expect(await screen.findByText(/Mise en relation gratuite/)).toBeTruthy();
    expect(container.textContent).toMatch(/ni transporteur, ni transitaire/);
    // Véhicule par défaut : marque et modèle, pas de poids.
    expect(await screen.findByLabelText("Marque")).toBeTruthy();
    expect(screen.queryByLabelText(/Poids total/)).toBeNull();
    verifier("Logistique client");
  });

  it("client : le suivi compare les devis et rappelle que VIT AUTO ne perçoit rien", async () => {
    const client = utilisateurTest("client");
    connecter(client);
    simulerApi({ user: client, routes: { "/api/logistique/demandes/": { demande: DEMANDE } } });
    const { container } = renderPage(<Logistique />, { route: `/logistique/demandes/${DEMANDE._id}`, path: "/logistique/demandes/:id" });

    expect(await screen.findByText("Atlas Transport")).toBeTruthy();
    expect(screen.getByText("Med Transit")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Accepter" })).toHaveLength(2);
    expect(container.textContent).toMatch(/VIT AUTO ne perçoit rien/);
    verifier("Logistique suivi");
  });

  it("prestataire : la demande s'affiche sans les coordonnées du client", async () => {
    const prest = utilisateurTest("prestataire");
    connecter(prest);
    const vue = { ...DEMANDE, statut: "recherche_prestataires", retenu: false, sollicitation: { reponse: "en_attente" }, mesDevis: [], devis: undefined };
    simulerApi({ user: prest, routes: { "/api/logistique/prestataire/demandes/": { demande: vue } } });
    const { container } = renderPage(<LogistiquePrestataire />, { route: `/transit/logistique/${DEMANDE._id}`, path: "/transit/logistique/:id" });

    expect(await screen.findByRole("heading", { name: "Votre devis" })).toBeTruthy();
    expect(container.textContent).toMatch(/coordonnées du client vous seront communiquées si votre devis est accepté/);
    verifier("Logistique prestataire");
  });

  it("admin : les indicateurs disent « indisponible » sans données et un revenu de 0", async () => {
    simulerApi({ routes: {
      "/api/logistique/admin/indicateurs": { indicateurs: {
        modeleEconomique: "FREE_REFERRAL",
        demandes: { creees: 0, soumises: 0, valides: 0, transmises: 0, avecDevis: 0, devisAcceptes: 0, commandesConfirmees: 0, operationsConclues: 0, annulations: 0, litiges: 0 },
        prestataires: { sollicites: 0, ayantRepondu: 0, devisRecus: 0, performance: [] },
        delais: { premiereReponseH: null, demandeAuPremierDevisH: null },
        conversions: { demandeVersDevis: null, devisVersCommande: null, commandeVersConclue: null },
        montantsDeclares: { devis: {}, commandes: {}, conclues: {} }, revenusVitAuto: { montantUSD: 0 }, zones: [], types: {}, motifs: { annulation: [], refusPrestataires: [] },
      } },
      "/api/logistique/admin/demandes": { demandes: [] },
    } });
    const { container } = renderPage(<LogistiqueSection headers={{ Authorization: "Bearer x" }} />, { route: "/admin" });

    expect(await screen.findByText(/Revenus encaissés par VIT AUTO/)).toBeTruthy();
    expect(container.textContent).toMatch(/indisponible/);
    expect(container.textContent).toMatch(/aucune rémunération logistique/);
    verifier("Logistique admin");
  });
});
