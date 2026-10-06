import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import { oublierOutils } from "../hooks/useOutils";
import VendorDashboard from "./VendorDashboard";

// Les outils d'abonnement des cartes véhicule de l'espace partenaire.
//
// ⚠️ Le défaut que ce fichier verrouille : le bouton « Tarifs saisonniers »
// testait `vehicle.type === "location"`, alors qu'après normalizeVehicle
// (VehicleContext) `type` porte la CATÉGORIE (« Berline ») et le type
// d'annonce est dans `listingType`. Le bouton n'est apparu à aucun partenaire
// depuis sa création (juillet 2026) — un outil vendu au palier Essentiel,
// introuvable. Le balayage navigateur ne le voyait pas : il vérifie qu'un
// écran se rend, pas qu'un bouton y figure.

const partenaire = utilisateurTest("partenaire", { kycStatus: "VERIFIE", sellerType: "loueur" });
const LOCATION = { _id: "0000000000000000000000a1", type: "location", vehicleType: "Berline", marque: "Kia", modele: "Sportage",
  title: "Kia Sportage 2024", status: "approved", pricePerDay: 40, currency: "MAD", images: [] };
const VENTE = { ...LOCATION, _id: "0000000000000000000000a2", type: "vente", title: "VW Touareg 2021", pricePerDay: undefined, priceForSale: 20000 };
const FERME = (planRequis) => ({ ouvert: false, raison: "plan_insuffisant", planRequis });

const ouvrir = (outils) => {
  connecter(partenaire);
  simulerApi({ user: partenaire, routes: {
    "/api/vehicles/mine": { vehicles: [LOCATION, VENTE] },
    "/api/subscriptions/outils": { plan: "free", outils },
  } });
  renderPage(<VendorDashboard />, { route: "/vendor/dashboard?tab=annonces", path: "/vendor/dashboard" });
};

// Le premier rendu de l'espace partenaire, à froid (module encore non
// transformé), dépasse la seconde par défaut de waitFor : la garde pre-push
// a échoué ainsi le 2026-10-06 sur un arbre sain, le test passant au 2e essai.
const ATTENTE = { timeout: 5000 };

beforeEach(() => oublierOutils());

describe("Espace partenaire — outils des cartes véhicule", () => {
  it("une annonce de LOCATION propose les tarifs saisonniers ; une vente non", async () => {
    ouvrir({ tarifsSaisonniers: { ouvert: true, raison: "plan" }, promotions: { ouvert: true, raison: "plan" } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Promo/ })).toHaveLength(2), ATTENTE);
    expect(screen.getAllByRole("button", { name: /Tarifs saisonniers/ })).toHaveLength(1);
    expect(screen.queryByText(/🔒/)).toBeNull();
  });

  it("compte sans le palier : le cadenas est visible sur la carte, AVANT tout clic", async () => {
    ouvrir({ tarifsSaisonniers: FERME("individuel_plus"), promotions: FERME("individuel_plus"), journalVehicule: FERME("business") });
    await waitFor(() => expect(screen.getByRole("button", { name: /Tarifs saisonniers 🔒/ })).toBeInTheDocument(), ATTENTE);
    expect(screen.getAllByRole("button", { name: /Promo 🔒/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Journal 🔒/ })).toHaveLength(2);
  });
});
