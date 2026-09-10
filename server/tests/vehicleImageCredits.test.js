import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import MediaCredit from "../models/MediaCredit.js";
import Vehicle from "../models/Vehicle.js";
import { getVehicleImageCredits } from "../controllers/vehicleController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Crédits des photos de référence.
//
// Plus de 370 annonces sont illustrées par des clichés Wikimedia Commons
// rapatriés sur notre CDN. 171 des 192 fichiers sont sous CC BY ou CC BY-SA :
// citer l'auteur est la CONDITION de la licence, pas un ornement. Depuis que
// nous hébergeons les fichiers, la page Commons n'est plus à un clic — nous
// portons l'attribution nous-mêmes, ou nous sommes en infraction.
//
// Ce fichier protège les deux moitiés de la règle : le crédit dû est rendu, et
// le crédit non dû (CC0, domaine public) n'encombre pas la page.

const CDN = "https://ik.imagekit.io/vitauto/vit-auto/vehicles/reference";

const credit = (over = {}) => MediaCredit.create({
  hostedUrl: `${CDN}/photo.jpg`,
  sourceUrl: "Photo.jpg",
  sourceName: "Wikimedia Commons",
  filePage: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
  author: "Damian B Oh",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  attributionRequired: true,
  ...over,
});

describe("Crédits des photos d'une annonce", () => {
  beforeEach(async () => {
    await MediaCredit.deleteMany({});
    await Vehicle.deleteMany({});
  });

  it("rend l'auteur et la licence d'une photo sous CC BY-SA", async () => {
    await credit();
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id, images: [`${CDN}/photo.jpg`] });

    const { req, res } = mockReqRes({ params: { id: String(v._id) } });
    await getVehicleImageCredits(req, res);

    expect(res.body.credits).toHaveLength(1);
    expect(res.body.credits[0].author).toBe("Damian B Oh");
    expect(res.body.credits[0].licence).toBe("CC BY-SA 4.0");
    expect(res.body.credits[0].filePage, "la source doit rester atteignable").toMatch(/commons\.wikimedia\.org/);
  });

  it("n'encombre pas la page d'un crédit qui n'est pas dû (CC0)", async () => {
    await credit({ hostedUrl: `${CDN}/libre.jpg`, licence: "CC0", attributionRequired: false });
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id, images: [`${CDN}/libre.jpg`] });

    const { req, res } = mockReqRes({ params: { id: String(v._id) } });
    await getVehicleImageCredits(req, res);

    expect(res.body.credits).toEqual([]);
  });

  it("ne rend que les crédits des photos RÉELLEMENT affichées par cette annonce", async () => {
    await credit({ hostedUrl: `${CDN}/la_sienne.jpg`, author: "Auteur A" });
    await credit({ hostedUrl: `${CDN}/une_autre.jpg`, author: "Auteur B" });
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id, images: [`${CDN}/la_sienne.jpg`] });

    const { req, res } = mockReqRes({ params: { id: String(v._id) } });
    await getVehicleImageCredits(req, res);

    expect(res.body.credits.map((c) => c.author)).toEqual(["Auteur A"]);
  });

  it("couvre aussi la vignette, pas seulement le tableau images", async () => {
    await credit({ hostedUrl: `${CDN}/vignette.jpg`, author: "Auteur Vignette" });
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id, images: [], thumbnail: `${CDN}/vignette.jpg` });

    const { req, res } = mockReqRes({ params: { id: String(v._id) } });
    await getVehicleImageCredits(req, res);

    expect(res.body.credits.map((c) => c.author)).toEqual(["Auteur Vignette"]);
  });

  it("ne renvoie rien pour une photo du partenaire — aucun crédit n'est dû", async () => {
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id, images: ["https://ik.imagekit.io/vitauto/vit-auto/vehicles/img_perso.jpg"] });

    const { req, res } = mockReqRes({ params: { id: String(v._id) } });
    await getVehicleImageCredits(req, res);

    expect(res.body.credits).toEqual([]);
  });

  it("répond une liste vide plutôt qu'une erreur sur une annonce inexistante", async () => {
    // Une fiche d'annonce ne doit jamais tomber à cause d'un crédit.
    const { req, res } = mockReqRes({ params: { id: String(new mongoose.Types.ObjectId()) } });
    await getVehicleImageCredits(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.credits).toEqual([]);
  });
});
