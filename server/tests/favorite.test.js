import { describe, it, expect } from "vitest";
import { getFavorites, getFavoriteIds, addFavorite, removeFavorite } from "../controllers/favoriteController.js";
import Favorite from "../models/Favorite.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import mongoose from "mongoose";

describe("addFavorite", () => {
  it("rejette un itemType invalide ou un itemId mal formé", async () => {
    const user = await createUser();
    const { req, res } = mockReqRes({ user: { id: user._id }, body: { itemType: "review", itemId: "not-an-id" } });
    await addFavorite(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("404 si l'annonce visée n'existe pas", async () => {
    const user = await createUser();
    const { req, res } = mockReqRes({ user: { id: user._id }, body: { itemType: "vehicle", itemId: new mongoose.Types.ObjectId().toString() } });
    await addFavorite(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("ajoute un favori, idempotent au second appel", async () => {
    // Attendre que l'index unique (user+itemType+itemId) soit construit — sinon
    // le second create() ci-dessous peut passer avant que Mongo ne le rejette
    // réellement (voir la même précaution dans tests/report.test.js).
    await Favorite.init();

    const user = await createUser();
    const vehicle = await createVehicleDoc();
    const body = { itemType: "vehicle", itemId: vehicle._id.toString() };

    const first = mockReqRes({ user: { id: user._id }, body });
    await addFavorite(first.req, first.res);
    expect(first.res.statusCode).toBe(201);

    const second = mockReqRes({ user: { id: user._id }, body });
    await addFavorite(second.req, second.res);
    expect(second.res.statusCode).toBe(200);

    const count = await Favorite.countDocuments({ user: user._id });
    expect(count).toBe(1);
  });
});

describe("getFavorites / getFavoriteIds", () => {
  it("ignore silencieusement un favori orphelin (item supprimé depuis)", async () => {
    const user = await createUser();
    const vehicle = await createVehicleDoc();
    await Favorite.create({ user: user._id, itemType: "vehicle", itemId: vehicle._id });
    await Favorite.create({ user: user._id, itemType: "vehicle", itemId: new mongoose.Types.ObjectId() });

    const { req, res } = mockReqRes({ user: { id: user._id } });
    await getFavorites(req, res);
    expect(res.body.favorites).toHaveLength(1);
  });

  it("un utilisateur ne voit que ses propres favoris", async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    const vehicle = await createVehicleDoc();
    await Favorite.create({ user: user1._id, itemType: "vehicle", itemId: vehicle._id });

    const { req, res } = mockReqRes({ user: { id: user2._id } });
    await getFavorites(req, res);
    expect(res.body.favorites).toHaveLength(0);
  });

  it("getFavoriteIds renvoie le format 'type:id'", async () => {
    const user = await createUser();
    const vehicle = await createVehicleDoc();
    await Favorite.create({ user: user._id, itemType: "vehicle", itemId: vehicle._id });

    const { req, res } = mockReqRes({ user: { id: user._id } });
    await getFavoriteIds(req, res);
    expect(res.body.ids).toEqual([`vehicle:${vehicle._id}`]);
  });
});

describe("removeFavorite", () => {
  it("ne supprime que le favori de l'utilisateur connecté", async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    const vehicle = await createVehicleDoc();
    await Favorite.create({ user: user1._id, itemType: "vehicle", itemId: vehicle._id });

    const { req, res } = mockReqRes({
      user: { id: user2._id }, params: { itemType: "vehicle", itemId: vehicle._id.toString() },
    });
    await removeFavorite(req, res);
    expect(res.statusCode).toBe(200);

    const stillThere = await Favorite.countDocuments({ user: user1._id });
    expect(stillThere).toBe(1);
  });

  it("supprime effectivement le favori du bon utilisateur", async () => {
    const user = await createUser();
    const vehicle = await createVehicleDoc();
    await Favorite.create({ user: user._id, itemType: "vehicle", itemId: vehicle._id });

    const { req, res } = mockReqRes({
      user: { id: user._id }, params: { itemType: "vehicle", itemId: vehicle._id.toString() },
    });
    await removeFavorite(req, res);
    expect(res.statusCode).toBe(200);
    expect(await Favorite.countDocuments({ user: user._id })).toBe(0);
  });
});
