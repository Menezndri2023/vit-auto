import { describe, it, expect } from "vitest";
import { getVehicles, getPublicStats } from "../controllers/vehicleController.js";
import { getPublicShowrooms } from "../controllers/pmsController.js";
import { composerVitrine } from "../services/spotlightEngine.js";
import { estEmailDeTest } from "../constants/testAccounts.js";
import { idsComptesDeTest, clauseHorsComptesDeTest } from "../utils/comptesDeTest.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Comptes de test rendus INVISIBLES, jamais supprimés : ils resservent à
// d'autres tests, et une suppression est irréversible.
//
// Deux sources de détection réunies : le drapeau `isTestAccount`, posé
// explicitement, et le domaine réservé par la norme (RFC 2606/6761), qui couvre
// d'office tout compte créé par un futur script de test.

const partenaireReel = (extra = {}) =>
  createUser({ role: "partenaire", email: `pro${Math.random().toString(36).slice(2)}@gmail.com`, ...extra });

const annonce = (owner, extra = {}) => createVehicleDoc({
  owner, status: "approved", available: true, ville: "Abidjan", country: "CI",
  images: ["a.jpg", "b.jpg"], ...extra,
});

describe("Détection des comptes de test", () => {
  it("ne retient que les domaines réservés par la norme", async () => {
    // Jamais le mot « test » dans un nom : « Testa », « Tester » sont des
    // patronymes réels, et masquer un compte légitime se voit tout de suite.
    for (const e of ["a@example.com", "b@vit-auto-test.local", "c@example.test", "d@x.invalid", "e@example.org"]) {
      expect(estEmailDeTest(e), e).toBe(true);
    }
    for (const e of ["tester@gmail.com", "testa@exemple.fr", "ho.rentacar@gmail.com", "913824211@qq.com", null, ""]) {
      expect(estEmailDeTest(e), String(e)).toBe(false);
    }
  });

  it("réunit le drapeau explicite et le domaine réservé", async () => {
    // Le drapeau couvre les comptes hors convention — « t-partner-…@ex.com » —
    // qu'aucune règle automatique ne peut reconnaître sans risque.
    const marque = await createUser({ role: "partenaire", email: "t-partner-178@ex.com", isTestAccount: true });
    const parDomaine = await createUser({ role: "partenaire", email: "auto@vit-auto-test.local" });
    const reel = await partenaireReel();

    const ids = (await idsComptesDeTest()).map(String);
    expect(ids).toContain(String(marque._id));
    expect(ids).toContain(String(parDomaine._id));
    expect(ids).not.toContain(String(reel._id));
  });

  it("ne produit aucune clause quand il n'y a aucun compte de test", async () => {
    // Ajouter `{ owner: { $nin: [] } }` à chaque requête publique coûterait
    // pour rien.
    await partenaireReel();
    expect(await clauseHorsComptesDeTest("owner")).toBeNull();
  });
});

describe("Invisibilité sur les surfaces publiques", () => {
  const monter = async () => {
    const test = await createUser({ role: "partenaire", email: "sec-p-1@vit-auto-test.local" });
    const reel = await partenaireReel();
    const aTest = await annonce(test._id, { title: "Annonce de test" });
    const aReel = await annonce(reel._id, { title: "Annonce réelle" });
    return { test, reel, aTest, aReel };
  };

  it("le catalogue public ne montre pas leurs annonces, l'administration si", async () => {
    const { aTest, aReel } = await monter();

    const visiteur = mockReqRes({ query: {} });
    await getVehicles(visiteur.req, visiteur.res);
    const idsPublics = visiteur.res.body.vehicles.map((v) => String(v._id));
    expect(idsPublics).toContain(String(aReel._id));
    expect(idsPublics).not.toContain(String(aTest._id));

    // L'administration doit continuer de les voir, sinon elle ne pourrait plus
    // les administrer.
    const admin = await createUser({ role: "admin" });
    const vueAdmin = mockReqRes({ user: admin, query: {} });
    await getVehicles(vueAdmin.req, vueAdmin.res);
    expect(vueAdmin.res.body.vehicles.map((v) => String(v._id))).toContain(String(aTest._id));
  });

  it("les compteurs publics ne les additionnent pas", async () => {
    // Un total gonflé par des annonces de test est un chiffre faux affiché sur
    // la page d'accueil.
    await monter();
    const { req, res } = mockReqRes({ query: {} });
    await getPublicStats(req, res);
    expect(res.body.vehicles).toBe(1);
  });

  it("l'annuaire public des showrooms les écarte", async () => {
    const test = await createUser({ role: "partenaire", email: "sec-p-2@vit-auto-test.local" });
    const reel = await partenaireReel();
    await PartnerShowroom.create({ partnerId: test._id, companyName: "Showroom de test", isPublished: true });
    await PartnerShowroom.create({ partnerId: reel._id, companyName: "Showroom réel", isPublished: true });

    const { req, res } = mockReqRes({ query: {} });
    await getPublicShowrooms(req, res);
    const noms = (res.body.showrooms || []).map((s) => s.companyName);
    expect(noms).toContain("Showroom réel");
    expect(noms).not.toContain("Showroom de test");
  });

  it("la vitrine d'accueil les écarte, véhicules comme partenaires", async () => {
    const { aTest, aReel } = await monter();

    const vedette = await composerVitrine("vedette");
    expect(vedette.items.map((i) => i.id)).toContain(String(aReel._id));
    expect(vedette.items.map((i) => i.id)).not.toContain(String(aTest._id));

    const partenaires = await composerVitrine("partenaires");
    expect(partenaires.items).toHaveLength(1);
  });

  it("un compte marqué reste PLEINEMENT fonctionnel — seule sa visibilité change", async () => {
    // C'est tout l'objet du marquage plutôt que de la suppression : ces comptes
    // resservent à d'autres tests.
    const test = await createUser({ role: "partenaire", email: "reutilisable@vit-auto-test.local" });
    const a = await annonce(test._id);

    // Il possède bien son annonce, publiée, et peut la consulter lui-même.
    const sienne = mockReqRes({ user: test, params: { id: String(a._id) } });
    const { getVehicleById } = await import("../controllers/vehicleController.js");
    await getVehicleById(sienne.req, sienne.res);
    expect(sienne.res.statusCode).toBe(200);
    expect(String(sienne.res.body._id ?? sienne.res.body.vehicle?._id)).toBe(String(a._id));
  });
});
