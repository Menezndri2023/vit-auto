import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import VehicleDetails from "./VehicleDetails";
import TestDriveLead from "./TestDriveLead";
import VendorDashboard from "./VendorDashboard";

// Vente par demande d'essai (docs/vente-demande-essai.md) — trois écrans,
// trois montages : fiche véhicule (CTA + formulaire), suivi client, onglet
// partenaire. Chaque test vérifie d'abord l'ABSENCE de l'élément attendu
// avant l'action, puis sa présence (test validé à l'envers).

const VEHICULE_VENTE = {
  _id: "6aa000000000000000000001", title: "Peugeot 3008 GT", marque: "Peugeot", modele: "3008",
  type: "vente", priceForSale: 18000, currency: "USD", ville: "Casablanca", country: "MA",
  images: [], status: "approved", available: true, owner: "6aa000000000000000000002", ownerName: "Auto Center",
};

const LEAD = {
  _id: "6aa000000000000000000010", reference: "VA-LEAD-2026-000007", status: "ALTERNATIVE_PROPOSED", requestType: "test_drive",
  listingSnapshot: { title: "Peugeot 3008 GT", ville: "Casablanca", country: "MA", image: null },
  client: { firstName: "Awa", lastName: "K.", phone: "+2250700000099", city: "Abidjan" },
  requested: { date: "2026-09-20T00:00:00.000Z", slot: "morning", message: null },
  alternative: { date: "2026-09-21T00:00:00.000Z", time: "15:00", note: "Plutôt l'après-midi", clientResponse: "pending" },
  appointment: {}, followUp: {}, attribution: { windowDays: 90 }, milestones: {},
  history: [{ action: "lead_created", timestamp: "2026-09-12T10:00:00.000Z" }, { action: "alternative_proposed", timestamp: "2026-09-12T11:00:00.000Z" }],
};

describe("Vente par demande d'essai — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });

  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} a levé une exception :\n${plantages.join("\n---\n")}`).toEqual([]);
    expect(screen.queryByText(/Une erreur s'est produite/i), `${nom} : ErrorBoundary déclenché`).toBeNull();
  };

  it("fiche véhicule en vente : « Demander un essai » ouvre le formulaire, pas la réservation", async () => {
    simulerApi({ routes: { [`/api/vehicles/${VEHICULE_VENTE._id}`]: { vehicle: VEHICULE_VENTE } } });
    renderPage(<VehicleDetails />, { route: `/vehicle/${VEHICULE_VENTE._id}`, path: "/vehicle/:id" });
    const cta = await screen.findByRole("button", { name: /Demander un essai|Request a test drive/i });
    expect(screen.getByRole("button", { name: /Être rappelé|Request a call back/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Envoyer ma demande d'essai/i })).toBeNull();
    fireEvent.click(cta);
    expect(await screen.findByRole("button", { name: /Envoyer ma demande d'essai/i })).toBeTruthy();
    expect(screen.getByText(/Créneau souhaité/i)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Matin" })).toBeTruthy();
    verifier("Fiche véhicule vente");
  });

  it("suivi client : un créneau proposé affiche Accepter / Choisir un autre créneau", async () => {
    simulerApi({ routes: { [`/api/sales-leads/public/${LEAD.reference}`]: { lead: LEAD } } });
    renderPage(<TestDriveLead />, { route: `/essai/${LEAD.reference}?t=jeton`, path: "/essai/:reference" });
    expect(await screen.findByText(/Le vendeur vous propose un nouveau créneau/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accepter" })).toBeTruthy();
    const autre = screen.getByRole("button", { name: /Choisir un autre créneau/i });
    expect(screen.queryByRole("button", { name: /Envoyer au vendeur/i })).toBeNull();
    fireEvent.click(autre);
    expect(await screen.findByRole("button", { name: /Envoyer au vendeur/i })).toBeTruthy();
    verifier("Suivi client");
  });

  it("espace partenaire : l'onglet « Mes opportunités » liste les demandes avec leurs actions", async () => {
    const { fetchSimule } = connecter(utilisateurTest("partenaire"));
    const leadPartenaire = { ...LEAD, status: "SENT_TO_PARTNER", contactDisclosed: false, client: { ...LEAD.client, phone: "+225••••99" } };
    const original = fetchSimule.getMockImplementation();
    fetchSimule.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.startsWith("/api/sales-leads/partner/stats")) return { ok: true, status: 200, json: async () => ({ stats: { leads: 1, testDriveRequests: 1, confirmed: 0, completed: 0, sales: 0, conversionRate: 0, avgResponseMs: null, revenueUSD: 0, commissionUSD: 0 } }) };
      if (url.startsWith("/api/sales-leads/partner")) return { ok: true, status: 200, json: async () => ({ leads: [leadPartenaire] }) };
      return original(input, init);
    });
    renderPage(<VendorDashboard />, { route: "/vendor/dashboard?tab=opportunites", path: "/vendor/dashboard" });
    expect(await screen.findByText(/Peugeot 3008 GT/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /Accepter/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Proposer un autre créneau/i })).toBeTruthy();
    expect(screen.getByText(/visibles après acceptation/i)).toBeTruthy();
    verifier("Mes opportunités");
  });
});
