import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import DriverBooking from "./DriverBooking";
import DriverEmployment from "./DriverEmployment";

// Pages chauffeur, rendues dans les états qu'aucun test ni la garde ne
// couvraient : VISITEUR (hors connexion) et client NON vérifié. En production
// (2026-09-15, iPhone), la réservation d'un chauffeur affichait la page de
// secours pour tout visiteur : `identitySatisfied` lisait `idFrontImage`
// avant sa déclaration, et seul le court-circuit d'un client vérifié
// (`user.kycStatus === "VERIFIE" || …`) évitait la lecture. La garde visitait
// la page connectée en admin — précisément le cas qui masquait le défaut.
const chauffeur = {
  _id: "6a720fd86c7c2ebcde959773", firstName: "Isaac", lastName: "Bassono", title: "Chauffeur Professionnel",
  tarif: 60, tarifDemiJournee: 35, currency: null, zone: "Maroc ; Casablanca", ville: "Casablanca", country: "MA",
  status: "approved", langues: ["Français"], permisCategorie: ["B"], images: [], blackoutDates: [],
  owner: { _id: "6a691050a0b974306437c94f", firstName: "Bassono" },
};
const routes = { "/api/drivers": [chauffeur] };

describe("Pages chauffeur — visiteur et client non vérifié", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });
  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} : ${plantages.join("\n")}`).toEqual([]);
  };

  it("réservation d'un chauffeur, hors connexion : le formulaire ou l'invitation à se connecter, jamais la page de secours", async () => {
    simulerApi({ routes });
    const { container } = renderPage(<DriverBooking />, { route: `/driver-booking/${chauffeur._id}`, path: "/driver-booking/:id" });
    await screen.findByText(/Isaac/);
    verifier("DriverBooking visiteur");
    expect(container.textContent).not.toMatch(/Une erreur s'est produite/);
  });

  it("réservation d'un chauffeur, client connecté mais non vérifié", async () => {
    const client = utilisateurTest("client", { kycStatus: "EN_ATTENTE" });
    connecter(client);
    simulerApi({ user: client, routes });
    const { container } = renderPage(<DriverBooking />, { route: `/driver-booking/${chauffeur._id}`, path: "/driver-booking/:id" });
    await screen.findByText(/Isaac/);
    verifier("DriverBooking non vérifié");
    expect(container.textContent).not.toMatch(/Une erreur s'est produite/);
  });

  it("proposition d'embauche, hors connexion : invitation à se connecter", async () => {
    simulerApi({ routes });
    const { container } = renderPage(<DriverEmployment />, { route: `/driver-employment/${chauffeur._id}`, path: "/driver-employment/:id" });
    await screen.findByText(/Connexion requise|Isaac/);
    verifier("DriverEmployment visiteur");
    expect(container.textContent).not.toMatch(/Une erreur s'est produite/);
  });
});
