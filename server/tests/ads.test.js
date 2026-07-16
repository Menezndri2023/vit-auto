import { describe, it, expect } from "vitest";
import { getAds, getAllAds, createAd, updateAd, deleteAd, trackAdClick } from "../controllers/adsController.js";
import Ad from "../models/Ad.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("getAds — visibilité publique", () => {
  it("exclut les annonces inactives et hors fenêtre de dates", async () => {
    const now = Date.now();
    await Ad.create({ title: "Active sans dates", active: true });
    await Ad.create({ title: "Inactive", active: false });
    await Ad.create({ title: "Pas encore commencée", active: true, startDate: new Date(now + 86400_000) });
    await Ad.create({ title: "Déjà terminée", active: true, endDate: new Date(now - 86400_000) });
    await Ad.create({ title: "Dans la fenêtre", active: true, startDate: new Date(now - 86400_000), endDate: new Date(now + 86400_000) });

    const { req, res } = mockReqRes({ query: {} });
    await getAds(req, res);
    const titles = res.body.map((a) => a.title).sort();
    expect(titles).toEqual(["Active sans dates", "Dans la fenêtre"]);
  });

  it("filtre par position et trie par priorité décroissante", async () => {
    await Ad.create({ title: "Basse priorité", active: true, position: "sidebar", priority: 1 });
    await Ad.create({ title: "Haute priorité", active: true, position: "sidebar", priority: 5 });
    await Ad.create({ title: "Autre position", active: true, position: "featured_section", priority: 9 });

    const { req, res } = mockReqRes({ query: { position: "sidebar" } });
    await getAds(req, res);
    expect(res.body.map((a) => a.title)).toEqual(["Haute priorité", "Basse priorité"]);
  });

  it("incrémente les vues des annonces renvoyées (best-effort)", async () => {
    const ad = await Ad.create({ title: "Vue test", active: true });
    const { req, res } = mockReqRes({ query: {} });
    await getAds(req, res);
    // L'incrément est fire-and-forget (pas attendu par le controller) — laisser
    // le temps à la microtask/promesse de s'exécuter avant de vérifier.
    await new Promise((r) => setTimeout(r, 50));
    const reloaded = await Ad.findById(ad._id);
    expect(reloaded.views).toBe(1);
  });
});

describe("CRUD admin", () => {
  it("createAd associe createdBy et rejette les champs invalides du schéma", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: { id: admin._id }, body: { title: "Pub 1" } });
    await createAd(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.createdBy.toString()).toBe(admin._id.toString());

    const { req: req2, res: res2 } = mockReqRes({ user: { id: admin._id }, body: {} });
    await createAd(req2, res2);
    expect(res2.statusCode).toBe(400); // title requis
  });

  it("updateAd modifie l'annonce, 404 si introuvable", async () => {
    const ad = await Ad.create({ title: "Avant" });
    const { req, res } = mockReqRes({ params: { id: ad._id.toString() }, body: { title: "Après" } });
    await updateAd(req, res);
    expect(res.body.title).toBe("Après");

    const { req: req2, res: res2 } = mockReqRes({ params: { id: "000000000000000000000000" }, body: { title: "x" } });
    await updateAd(req2, res2);
    expect(res2.statusCode).toBe(404);
  });

  it("deleteAd supprime l'annonce", async () => {
    const ad = await Ad.create({ title: "À supprimer" });
    const { req, res } = mockReqRes({ params: { id: ad._id.toString() } });
    await deleteAd(req, res);
    expect(res.statusCode).toBe(200);
    expect(await Ad.findById(ad._id)).toBeNull();
  });

  it("getAllAds renvoie toutes les annonces, actives ou non", async () => {
    await Ad.create({ title: "A", active: true });
    await Ad.create({ title: "B", active: false });
    const { req, res } = mockReqRes({});
    await getAllAds(req, res);
    expect(res.body).toHaveLength(2);
  });

  it("trackAdClick incrémente le compteur de clics", async () => {
    const ad = await Ad.create({ title: "Clic test" });
    const { req, res } = mockReqRes({ params: { id: ad._id.toString() } });
    await trackAdClick(req, res);
    expect(res.statusCode).toBe(200);
    const reloaded = await Ad.findById(ad._id);
    expect(reloaded.clicks).toBe(1);
  });
});
