import { describe, it, expect, beforeEach } from "vitest";
import { getVehicles } from "../controllers/vehicleController.js";
import { cacheClear } from "../utils/catalogCache.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// UN PAYS SANS ANNONCE NE DOIT PAS DONNER UNE PAGE BLANCHE
// ═══════════════════════════════════════════════════════════════════════════
// Incident réel du 2026-09-11 : les 345 annonces publiées étaient au Maroc et
// en France. Le catalogue ivoirien contenait exactement une annonce — orpheline,
// sans propriétaire, donc impossible à honorer. Son retrait, parfaitement
// justifié, a vidé d'un coup toute la page pour un visiteur en Côte d'Ivoire :
// ni véhicule, ni image, rien. Vu de sa fenêtre, le site était cassé.
//
// Le filtre pays est un CONFORT, pas une règle. Quand il ne donne rien, montrer
// l'international vaut mieux qu'une page blanche — c'est déjà ce que fait la
// vitrine d'accueil.

const lister = async (query, user = null) => {
  const { req, res } = mockReqRes({ query, user });
  await getVehicles(req, res);
  return res;
};

describe("Catalogue — repli mondial", () => {
  beforeEach(() => cacheClear());

  it("montre l'international quand le pays du visiteur ne contient rien", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia Logan" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.total).toBe(1);
    expect(res.body.vehicles[0].title).toBe("Dacia Logan");
    // L'interface doit pouvoir le DIRE : un visiteur ivoirien à qui l'on montre
    // une voiture marocaine sans explication croit à une erreur.
    expect(res.body.repliMondial).toBe(true);
  });

  it("ne replie PAS quand le pays du visiteur a ses propres annonces", async () => {
    const p = await createUser({ role: "partenaire" });
    for (const title of ["Toyota locale", "Hyundai locale", "Kia locale"]) {
      await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "CI", title });
    }
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia lointaine" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title).sort()).toEqual(["Hyundai locale", "Kia locale", "Toyota locale"]);
    expect(res.body.repliMondial).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LE SEUIL : DEUX ANNONCES NE FONT PAS UN CATALOGUE
  // ─────────────────────────────────────────────────────────────────────────
  // Constaté en production le 2026-09-25. Les deux annonces de démonstration
  // créées pour la review Apple (compte `review-partner@vit-auto.com`) étaient
  // les SEULES portant `country: "CI"`. Le repli, qui ne se déclenchait qu'à
  // zéro, s'est donc éteint : les visiteurs ivoiriens — marché principal — ne
  // voyaient plus que ces deux voitures au lieu des 405 annonces publiées, et
  // le carrousel d'accueil tombait de six vignettes à deux.
  //
  // Une poignée d'annonces dans un pays n'y prouve pas une offre. Le repli se
  // déclenche désormais sous `SEUIL_CONTENU_PAYS`, comme les autres catalogues.
  it("replie quand le pays du visiteur n'a qu'une poignée d'annonces", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "CI", title: "Démo 1" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "CI", title: "Démo 2" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia lointaine" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.repliMondial).toBe(true);
    // Le repli ÉLARGIT, il n'exclut pas : les annonces locales restent là.
    expect(res.body.vehicles.map((v) => v.title).sort()).toEqual(["Dacia lointaine", "Démo 1", "Démo 2"]);
  });

  // La vitrine d'un partenaire n'est pas un catalogue de pays : un loueur qui
  // n'a qu'une voiture au Maroc en a vraiment une. Élargir au monde entier
  // trahirait la consigne « les liens partagés ne contiennent que les annonces
  // du partenaire » (voir tests/vitrinePartenaire.test.js).
  it("le seuil ne s'applique pas à une vitrine de partenaire", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Unique au Maroc" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "FR", title: "Unique en France" });

    const res = await lister({ owner: p._id.toString(), country: "MA", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title)).toEqual(["Unique au Maroc"]);
    expect(res.body.repliMondial).toBeUndefined();
  });

  it("les annonces sans pays restent visibles partout", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: null, title: "Sans pays" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title)).toEqual(["Sans pays"]);
  });

  // Corrigé le 2026-09-24 : ce test attendait l'inverse (« sans déclencher de
  // repli »). Une annonce sans pays n'appartient à AUCUN pays — elle ne prouve
  // pas qu'il y a de l'offre chez le visiteur. Tant qu'elle comptait comme
  // telle, une seule suffisait à priver tout un pays de l'offre
  // internationale : le visiteur ivoirien ne voyait qu'elle, seule au milieu
  // d'une page vide. Elle reste visible dans les deux cas.
  it("une annonce sans pays n'empêche pas le repli vers l'international", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: null, title: "Sans pays" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia marocaine" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title).sort()).toEqual(["Dacia marocaine", "Sans pays"]);
    expect(res.body.repliMondial).toBe(true);
  });

  it("ne replie pas sur une RECHERCHE explicite — l'absence de résultat est la réponse", async () => {
    // Chercher « Ferrari » et recevoir des Dacia serait pire que zéro résultat.
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia Logan" });

    const res = await lister({ country: "CI", search: "Ferrari", limit: 10 });
    expect(res.body.total).toBe(0);
    expect(res.body.repliMondial).toBeUndefined();
  });

  it("respecte les autres filtres pendant le repli", async () => {
    // Le repli lève la restriction de PAYS, jamais les critères que le visiteur
    // a explicitement choisis.
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", type: "location", title: "À louer" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", type: "vente", pricePerDay: undefined, priceForSale: 9000, title: "À vendre" });

    const res = await lister({ country: "CI", type: "vente", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title)).toEqual(["À vendre"]);
    expect(res.body.repliMondial).toBe(true);
  });

  it("ne montre jamais d'annonce non modérée pendant le repli", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "pending", available: true, country: "MA", title: "En attente" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.total).toBe(0);
    expect(res.body.repliMondial).toBeUndefined();
  });

  it("un catalogue vide partout reste vide, sans prétendre replier", async () => {
    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.total).toBe(0);
    expect(res.body.vehicles).toEqual([]);
    expect(res.body.repliMondial).toBeUndefined();
  });
});
