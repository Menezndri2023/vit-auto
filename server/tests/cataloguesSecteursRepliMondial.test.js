import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import SparePart from "../models/SparePart.js";
import { getActivities } from "../controllers/activityController.js";
import { getDrivers } from "../controllers/driverController.js";
import { getParts } from "../controllers/partController.js";
import { cacheClear } from "../utils/catalogCache.js";
import { createUser, createActivityDoc, createDriverDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// LE REPLI MONDIAL VAUT POUR TOUS LES SECTEURS, PAS SEULEMENT LES VÉHICULES
// ═══════════════════════════════════════════════════════════════════════════
// `catalogueRepliMondial.test.js` couvrait les véhicules depuis l'incident du
// 2026-09-11. Les activités, chauffeurs et pièces n'avaient PAS ce repli : ils
// étaient filtrés dans le navigateur après avoir chargé le catalogue mondial
// entier — tenable avec 12 activités, plus du tout à quelques centaines.
// Déplacer le filtre côté serveur sans y déplacer aussi le repli aurait rendu
// une page vide à tout pays dépourvu de contenu : exactement la panne d'origine.

const appeler = async (handler, query) => {
  const { req, res } = mockReqRes({ query });
  await handler(req, res);
  return res.body;
};

const creerPiece = (overrides = {}) =>
  SparePart.create({
    owner: overrides.owner || new mongoose.Types.ObjectId(),
    category: "MOTEUR",
    title: "Filtre à huile",
    compatibility: [{ marque: "Toyota" }],
    price: 25,
    status: "approved",
    available: true,
    ...overrides,
  });

describe("Catalogues sectoriels — repli mondial", () => {
  beforeEach(() => cacheClear());

  describe("Activités et loisirs", () => {
    it("montre l'international quand le pays du visiteur n'a aucune activité", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, { country: "CI" });
      expect(liste.map((a) => a.title)).toEqual(["Quad Agadir"]);
    });

    // « Avoir les siennes » veut dire SEUIL_CONTENU_PAYS, pas une. Voir le
    // commentaire du seuil dans utils/repliMondial.js.
    it("ne replie pas quand le pays du visiteur a les siennes", async () => {
      const p = await createUser({ role: "partenaire" });
      for (const title of ["Jetski Abidjan", "Quad Bassam", "Plongée Assinie"]) {
        await createActivityDoc({ owner: p._id, country: "CI", title });
      }
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, { country: "CI" });
      expect(liste.map((a) => a.title).sort()).toEqual(["Jetski Abidjan", "Plongée Assinie", "Quad Bassam"]);
    });

    // Le seuil lui-même : une offre de deux n'est pas une offre.
    it("replie quand le pays du visiteur n'en a qu'une poignée", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: "CI", title: "Jetski Abidjan" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, { country: "CI" });
      expect(liste.map((a) => a.title).sort()).toEqual(["Jetski Abidjan", "Quad Agadir"]);
    });

    // Le défaut corrigé côté interface le 2026-09-24, vérifié ici côté serveur :
    // une annonce sans pays ne prouve pas qu'il y a de l'offre chez le visiteur.
    // Elle reste visible, mais n'empêche pas de montrer le reste du monde.
    it("une activité SANS pays ne prive pas le visiteur de l'offre internationale", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: null, title: "Sans pays" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, { country: "CI" });
      expect(liste.map((a) => a.title).sort()).toEqual(["Quad Agadir", "Sans pays"]);
    });

    it("rend une liste vide quand il n'existe rien nulle part", async () => {
      expect(await appeler(getActivities, { country: "CI" })).toEqual([]);
    });
  });

  describe("Chauffeurs", () => {
    it("montre l'international quand le pays du visiteur n'a aucun chauffeur", async () => {
      const p = await createUser({ role: "partenaire" });
      await createDriverDoc({ owner: p._id, country: "MA", firstName: "Hassan" });

      const liste = await appeler(getDrivers, { country: "CI" });
      expect(liste.map((d) => d.firstName)).toEqual(["Hassan"]);
    });

    it("ne replie pas quand le pays du visiteur a les siens", async () => {
      const p = await createUser({ role: "partenaire" });
      for (const firstName of ["Kouassi", "Aya", "Yao"]) {
        await createDriverDoc({ owner: p._id, country: "CI", firstName });
      }
      await createDriverDoc({ owner: p._id, country: "MA", firstName: "Hassan" });

      const liste = await appeler(getDrivers, { country: "CI" });
      expect(liste.map((d) => d.firstName).sort()).toEqual(["Aya", "Kouassi", "Yao"]);
    });
  });

  describe("Pièces détachées", () => {
    it("montre l'international quand rien n'est livrable dans le pays du visiteur", async () => {
      await creerPiece({ country: "MA", title: "Filtre marocain" });

      const liste = await appeler(getParts, { country: "CI" });
      expect(liste.map((p) => p.title)).toEqual(["Filtre marocain"]);
    });

    it("ne replie pas quand assez de pièces sont livrables dans le pays du visiteur", async () => {
      for (const title of ["Filtre expédié en CI", "Courroie expédiée en CI", "Plaquettes expédiées en CI"]) {
        await creerPiece({ country: "MA", title, shipping: { countries: ["CI"] } });
      }
      await creerPiece({ country: "MA", title: "Filtre marocain seul" });

      const liste = await appeler(getParts, { country: "CI" });
      expect(liste.map((p) => p.title).sort())
        .toEqual(["Courroie expédiée en CI", "Filtre expédié en CI", "Plaquettes expédiées en CI"]);
    });

    // La clause pays des pièces vit dans `$and` parce que `$or` porte déjà la
    // recherche `q`. Le repli doit retirer la BONNE clé : retirer `$or` rendrait
    // la recherche inopérante au lieu d'élargir le pays.
    it("le repli conserve la recherche en cours", async () => {
      await creerPiece({ country: "MA", title: "Amortisseur avant" });
      await creerPiece({ country: "MA", title: "Filtre à huile" });

      const liste = await appeler(getParts, { country: "CI", q: "Amortisseur" });
      expect(liste.map((p) => p.title)).toEqual(["Amortisseur avant"]);
    });
  });

  describe("Mode international et administration", () => {
    it("« INTL » ne pose aucune restriction et ne déclenche aucun repli", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: "CI", title: "Jetski Abidjan" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, { country: "INTL" });
      expect(liste.map((a) => a.title).sort()).toEqual(["Jetski Abidjan", "Quad Agadir"]);
    });

    it("sans paramètre pays, tout est rendu — c'est ce que lit le panneau d'administration", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: "CI", title: "Jetski Abidjan" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, {});
      expect(liste).toHaveLength(2);
    });
  });
});
