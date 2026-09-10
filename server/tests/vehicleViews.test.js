import { describe, it, expect } from "vitest";
import { getVehicleById } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// `Vehicle.vues` était déclaré au schéma, initialisé à zéro à la création, et
// JAMAIS incrémenté : 333 annonces publiées, 0 vue enregistrée — alors que le
// chiffre était présenté au partenaire comme une donnée réelle.

// L'incrément est détaché de la réponse (la consultation ne doit pas attendre
// une écriture de compteur) : on scrute la base plutôt que de dormir un délai
// fixe, qui serait instable sous charge.
const attendreVues = async (id, attendu, timeoutMs = 5000) => {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const v = await Vehicle.findById(id).select("vues").lean();
    if (v?.vues === attendu) return v.vues;
    await new Promise((r) => setTimeout(r, 20));
  }
  return (await Vehicle.findById(id).select("vues").lean())?.vues;
};

const consulter = async (vehicule, user = null) => {
  const { req, res } = mockReqRes({ params: { id: String(vehicule._id) }, user });
  await getVehicleById(req, res);
  return res;
};

describe("Compteur de vues d'une annonce", () => {
  it("compte la visite d'un visiteur", async () => {
    const v = await createVehicleDoc({ status: "approved" });
    await consulter(v);
    expect(await attendreVues(v._id, 1)).toBe(1);
  });

  it("ne compte PAS le propriétaire qui relit sa propre annonce", async () => {
    // Sans cette exclusion, un partenaire gonfle son audience en consultant ses
    // annonces, et la statistique ne vaut plus rien pour décider d'un prix.
    const proprio = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: proprio._id, status: "approved" });

    await consulter(v, proprio);

    await new Promise((r) => setTimeout(r, 300));
    const apres = await Vehicle.findById(v._id).select("vues").lean();
    expect(apres.vues).toBe(0);
  });

  it("ne compte pas un administrateur", async () => {
    const admin = await createUser({ role: "admin" });
    const v = await createVehicleDoc({ status: "approved" });

    await consulter(v, admin);

    await new Promise((r) => setTimeout(r, 300));
    expect((await Vehicle.findById(v._id).select("vues").lean()).vues).toBe(0);
  });

  it("ne compte pas une annonce non publiée", async () => {
    // Une annonce en brouillon n'est visible que de son auteur : y accumuler
    // des vues n'aurait aucun sens.
    const proprio = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: proprio._id, status: "draft" });

    await consulter(v, proprio);

    await new Promise((r) => setTimeout(r, 300));
    expect((await Vehicle.findById(v._id).select("vues").lean()).vues).toBe(0);
  });

  it("cumule les visites successives", async () => {
    const v = await createVehicleDoc({ status: "approved" });
    await consulter(v);
    await attendreVues(v._id, 1);
    await consulter(v);
    expect(await attendreVues(v._id, 2)).toBe(2);
  });
});
