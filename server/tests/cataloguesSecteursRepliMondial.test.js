import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import SparePart from "../models/SparePart.js";
import { getActivities } from "../controllers/activityController.js";
import { getDrivers, getDriverPublic } from "../controllers/driverController.js";
import { getParts } from "../controllers/partController.js";
import { cacheClear } from "../utils/catalogCache.js";
import { createUser, createActivityDoc, createDriverDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// RÈGLE DU 2026-10-09 : CHAQUE SECTEUR NE MONTRE QUE LE PAYS DU VISITEUR
// ═══════════════════════════════════════════════════════════════════════════
// L'exploitant a remplacé le repli mondial (en place depuis le 2026-09-11) :
// sans choix explicite d'un autre pays, un visiteur ne voit que les offres de
// son pays. Un pays vide reçoit une liste vide — le site l'annonce et propose
// « voir l'international ». Historique de l'ancienne règle ci-dessous.
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

describe("Catalogues sectoriels — pays du visiteur seulement", () => {
  beforeEach(() => cacheClear());

  describe("Activités et loisirs", () => {
    it("ne montre rien d'un autre pays quand le pays du visiteur n'a aucune activité", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      expect(await appeler(getActivities, { country: "CI" })).toEqual([]);
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
    it("une seule activité dans le pays : on la montre, seule", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: "CI", title: "Jetski Abidjan" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      const liste = await appeler(getActivities, { country: "CI" });
      expect(liste.map((a) => a.title)).toEqual(["Jetski Abidjan"]);
    });

    // Le défaut corrigé côté interface le 2026-09-24, vérifié ici côté serveur :
    // une annonce sans pays ne prouve pas qu'il y a de l'offre chez le visiteur.
    // Elle reste visible, mais n'empêche pas de montrer le reste du monde.
    it("une activité SANS pays n'appartient à aucun pays : absente des vues par pays", async () => {
      const p = await createUser({ role: "partenaire" });
      await createActivityDoc({ owner: p._id, country: null, title: "Sans pays" });
      await createActivityDoc({ owner: p._id, country: "MA", title: "Quad Agadir" });

      expect(await appeler(getActivities, { country: "CI" })).toEqual([]);
      expect((await appeler(getActivities, { country: "INTL" })).map((a) => a.title).sort()).toEqual(["Quad Agadir", "Sans pays"]);
    });

    it("rend une liste vide quand il n'existe rien nulle part", async () => {
      expect(await appeler(getActivities, { country: "CI" })).toEqual([]);
    });
  });

  describe("Chauffeurs", () => {
    it("ne montre aucun chauffeur d'un autre pays", async () => {
      const p = await createUser({ role: "partenaire" });
      await createDriverDoc({ owner: p._id, country: "MA", firstName: "Hassan" });

      expect(await appeler(getDrivers, { country: "CI" })).toEqual([]);
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

  describe("Fiche chauffeur par lien direct", () => {
    it("un chauffeur d'un autre pays reste lisible par son lien, sans téléphone ; une fiche non publiée ne l'est pas", async () => {
      const p = await createUser({ role: "partenaire" });
      const ok = await createDriverDoc({ owner: p._id, country: "MA", firstName: "Hassan", phone: "+212600000000" });
      const attente = await createDriverDoc({ owner: p._id, country: "MA", status: "pending" });
      const lire = async (id) => { const { req, res } = mockReqRes({ params: { id: String(id) } }); await getDriverPublic(req, res); return res; };
      const r = await lire(ok._id);
      expect(r.body.driver.firstName).toBe("Hassan");
      expect(r.body.driver.phone).toBeUndefined();
      expect(r.body.driver.owner).toEqual({ _id: p._id, firstName: p.firstName });
      expect((await lire(attente._id)).status).toHaveBeenCalledWith(404);
    });
  });

  describe("Pièces détachées", () => {
    it("ne montre aucune pièce qui n'est ni stockée ni livrable dans le pays du visiteur", async () => {
      await creerPiece({ country: "MA", title: "Filtre marocain" });

      expect(await appeler(getParts, { country: "CI" })).toEqual([]);
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
    it("la recherche s'applique dans le pays du visiteur", async () => {
      await creerPiece({ country: "CI", title: "Amortisseur avant" });
      await creerPiece({ country: "CI", title: "Filtre à huile" });
      await creerPiece({ country: "MA", title: "Amortisseur arrière" });

      const liste = await appeler(getParts, { country: "CI", q: "Amortisseur" });
      expect(liste.map((p) => p.title)).toEqual(["Amortisseur avant"]);
    });
  });

  describe("Mode international et administration", () => {
    it("« INTL » (choix du visiteur) ne pose aucune restriction", async () => {
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
