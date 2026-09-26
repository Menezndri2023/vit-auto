import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest, surveillerErreurs, MOTIFS_DE_PLANTAGE } from "../test/renderPage";

import Plans from "./Plans";
import PartnerSectors from "../components/PartnerSectors/PartnerSectors";
import { SectorRequestsSection } from "./admin/sections/SectorRequestsSection";

// Accès par secteur et plans (2026-09-14) — trois écrans, un montage chacun
// (le harnais fige au-delà de cinq montages par fichier).

describe("Secteurs d'activité et page Tarifs — rendu", () => {
  let erreurs;
  beforeEach(() => { erreurs = surveillerErreurs(); });
  const verifier = (nom) => {
    const plantages = erreurs.filter((e) => MOTIFS_DE_PLANTAGE.test(e));
    expect(plantages, `${nom} : ${plantages.join("\n")}`).toEqual([]);
  };

  it("la page Tarifs porte les nouveaux libellés, vend par secteur, et ne promet plus de commission réduite", async () => {
    connecter(utilisateurTest("partenaire", { activity: "loisirs" }));
    const { container } = renderPage(<Plans />, { route: "/plans" });
    // Le secteur du partenaire connecté est sélectionné dès que la session
    // est résolue : ses outils s'affichent.
    //
    // Délai explicite : la sélection dépend d'un effet qui attend la session,
    // et le défaut d'une seconde de findBy* est dépassé environ une fois sur
    // trois quand la suite tourne entière (32 workers en parallèle). Le test
    // échouait alors au hasard et aurait bloqué des push sans rien prouver —
    // ce qui est vérifié n'a pas changé, seule la patience (2026-09-26).
    await screen.findByRole("tab", { name: "Activités & loisirs", selected: true }, { timeout: 8000 });
    verifier("Tarifs");

    // Les paliers ne portent plus un nom de métier ni de type d'entité.
    expect(container.textContent).toMatch(/Essentiel/);
    expect(container.textContent).toMatch(/Premium/);
    expect(container.textContent).not.toMatch(/Individuel Plus/);
    expect(container.textContent).not.toMatch(/pour les particuliers/i);
    // Depuis la grille du 2026-09-09, aucun ABONNEMENT ne réduit la
    // commission — l'Offre Partenaire Fondateur, elle, la réduit bel et bien
    // pendant 12 mois (voir PricingConfig et la grille affichée plus bas).
    //
    // L'assertion était « le texte ne contient nulle part "commission
    // réduite" », et elle passait pour une mauvaise raison : jusqu'au
    // 2026-09-25, la langue était choisie par `navigator.language`, qui vaut
    // "en-US" sous jsdom. La moitié traduite de la page se rendait donc en
    // ANGLAIS ("Reduced commission"), et la négation française ne trouvait
    // rien. C'est le même mécanisme qui faisait indexer par Google une page
    // anglaise à une adresse déclarée française. La langue vient maintenant
    // de l'URL (i18n/langueUrl.js) : la page se rend en français, et
    // l'assertion doit dire ce qu'elle voulait dire.
    expect(container.textContent).toMatch(/jamais une remise sur la commission/i);
    expect(container.textContent).toMatch(/commissions sont identiques pour tous les plans/i);

    // Le report météo (Activity.weatherDependent) existe pour TOUS depuis
    // toujours : il était vendu en Business jusqu'au 2026-09-26. Il doit
    // désormais figurer dans le palier GRATUIT — et nulle part ailleurs.
    const gratuit = container.textContent.split("Essentiel")[0];
    expect(gratuit).toMatch(/Report automatique des sorties dépendant de la météo/);
    expect(container.textContent).not.toMatch(/Fermeture automatique selon la météo/);
    expect(container.textContent).not.toMatch(/Import de flotte/);

    // Aucune promesse sans contrepartie : le badge « Pro » n'est affiché nulle
    // part dans le produit, et les statistiques d'une annonce sont gratuites.
    expect(container.textContent).not.toMatch(/Badge « Pro »/);
    // Les statistiques d'analyse (vues, conversion, prix face à la médiane)
    // SONT verrouillées par getPartnerInsights : gratuit ne les a pas.
    const gratuit2 = container.textContent.split("Essentiel")[0];
    expect(gratuit2).toMatch(/✗Statistiques de performance|Statistiques de performance/);

    // Changer d'onglet change les outils du métier, pas les prix ni les paliers.
    fireEvent.click(screen.getByRole("tab", { name: "Location" }));
    expect(container.textContent).toMatch(/Import de flotte/);
    expect(container.textContent).not.toMatch(/Report automatique des sorties/);
    expect(container.textContent).toMatch(/Planning et indisponibilités/);
    expect(container.textContent).toMatch(/secteurs? d'activité/);
    expect(container.textContent).toMatch(/annonces actives par secteur/);
  });

  it("le panneau Secteurs du partenaire montre l'occupation, la limite du plan et le formulaire de demande", async () => {
    const partenaire = utilisateurTest("partenaire", { activity: "loueur" });
    connecter(partenaire);
    simulerApi({
      user: partenaire,
      routes: {
        "/api/partner-sectors/me": {
          secteurs: [{ secteur: "loueur", label: "Location", actives: 3, quota: null }],
          plan: "business", maxSecteurs: 2, fondateur: false,
          immuniteJusquau: "2027-09-10T00:00:00.000Z",
          demandes: [{ _id: "d1", secteur: "vendeur", status: "pending", createdAt: "2026-09-14T00:00:00.000Z" }],
          secteursDisponibles: [{ id: "vendeur", label: "Vendeur" }, { id: "exportateur", label: "Exportateur" }],
        },
      },
    });
    renderPage(<PartnerSectors />, { route: "/vendor/dashboard" });
    expect(await screen.findByText(/3 annonces actives/)).toBeTruthy();
    verifier("Secteurs partenaire");
    expect(screen.getByText(/Plan/).textContent).toMatch(/Business/);
    expect(screen.getByText(/Demande en attente : Vente/)).toBeTruthy();
    // Le secteur déjà demandé n'est pas reproposé ; les autres le sont.
    const options = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) => o.value);
    expect(options).toContain("exportateur");
    expect(options).not.toContain("vendeur");
  });

  it("l'onglet admin liste une demande avec le contexte du compte et ses deux décisions", async () => {
    const admin = utilisateurTest("admin");
    connecter(admin);
    simulerApi({
      user: admin,
      routes: {
        "/api/partner-sectors/admin/requests": {
          demandes: [{
            _id: "d1", secteur: "exportateur", status: "pending", motif: "Export vers le Sénégal", createdAt: "2026-09-14T00:00:00.000Z",
            user: { firstName: "Ama", lastName: "Koné", email: "ama@vitauto-fixtures.fr", partnerActivity: "vendeur", partnerActivities: [], entityType: "entreprise", kycStatus: "VERIFIE", certificationBadge: "gold", country: "CI" },
          }],
        },
      },
    });
    const { container } = renderPage(<SectorRequestsSection headers={{}} />, { route: "/admin?tab=secteurs", path: "/admin" });
    expect(await screen.findByText(/ama@vitauto-fixtures.fr/)).toBeTruthy();
    verifier("Admin secteurs");
    expect(container.textContent).toMatch(/Ama Koné/);
    expect(screen.getByText(/Export vers le Sénégal/)).toBeTruthy();
    expect(screen.getByText(/Secteurs actuels : Vente/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accorder/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refuser/ })).toBeTruthy();
  });
});
