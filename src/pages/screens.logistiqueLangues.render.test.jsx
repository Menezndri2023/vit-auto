import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage, connecter, simulerApi, utilisateurTest } from "../test/renderPage";
import Logistique from "./Logistique";
import LogistiqueVendeur from "./LogistiqueVendeur";

// Les espaces logistiques sont traduits (2026-10-28) : rendus en anglais et en
// arabe, ils n'affichent plus le français — y compris les libellés de
// statut, de mode et de rôle, et les noms de pays.

const choisirLangue = (code) => { try { localStorage.setItem("vit_lang", code); } catch { /* stockage indisponible */ } };
afterEach(() => { try { localStorage.removeItem("vit_lang"); } catch { /* idem */ } });

describe("VIT-AUTO Logistique — langues", () => {
  it("anglais : liste, gratuité et formulaire traduits", async () => {
    choisirLangue("en");
    const client = utilisateurTest("client");
    connecter(client);
    simulerApi({ user: client, routes: { "/api/logistique/demandes": { demandes: [{
      _id: "x1", reference: "VA-LOG-2026-000001", typeBesoin: "vehicule", statut: "devis_recus",
      depart: { pays: "FR", ville: "Marseille" }, arrivee: { pays: "MA", ville: "Casablanca" }, devis: [], updatedAt: "2026-10-28",
    }] } } });
    const { container } = renderPage(<Logistique />, { route: "/logistique", path: "/logistique" });
    expect(await screen.findByText("Free matchmaking.")).toBeTruthy();
    expect(screen.getByText("Quotes received")).toBeTruthy();
    expect(screen.getByText("Vehicle transport")).toBeTruthy();
    expect(container.textContent).toMatch(/Morocco/);
    expect(container.textContent).not.toMatch(/Mise en relation|Devis reçus|Transport de véhicule|Maroc/);
  });

  it("arabe : l'espace exportateur et ses rôles sont traduits", async () => {
    choisirLangue("ar");
    const vendeur = utilisateurTest("partenaire");
    connecter(vendeur);
    simulerApi({ user: vendeur, routes: { "/api/logistique/vendeur/demandes/": { demande: {
      _id: "c1", reference: "VA-LOG-2026-000009", typeBesoin: "pieces", statut: "recue",
      depart: { pays: "CN", ville: "Guangzhou" }, arrivee: { pays: "CI", ville: "Abidjan" }, modeSouhaite: "maritime",
      incotermCommande: { regle: "FCA", lieuNomme: "Guangzhou", version: "2020", statut: "propose", libelle: "FCA Guangzhou, Incoterms® 2020" },
      donneurOrdre: "a_confirmer", payeur: "a_confirmer", enlevement: { confirmeLe: null }, documents: [], evenements: [],
    } } } });
    const { container } = renderPage(<LogistiqueVendeur />, { route: "/logistique/vendeur/c1", path: "/logistique/vendeur/:id" });
    expect(await screen.findByText("الشروط والأدوار")).toBeTruthy();
    expect(screen.getAllByText("قيد التأكيد").length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toMatch(/FCA Guangzhou, Incoterms® 2020/);
    expect(container.textContent).not.toMatch(/À confirmer|Conditions et rôles|Enlèvement/);
  });
});
