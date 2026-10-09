import { describe, it, expect, beforeEach } from "vitest";
import { getVehicles } from "../controllers/vehicleController.js";
import { cacheClear } from "../utils/catalogCache.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// RÈGLE DU 2026-10-09 : LE CATALOGUE NE MONTRE QUE LE PAYS DU VISITEUR
// ═══════════════════════════════════════════════════════════════════════════
// L'exploitant a remplacé le repli mondial (2026-09-11 → 2026-10-09) : un
// visiteur ne voit que les offres de son pays, sauf s'il choisit un autre pays
// ou « International » avec le filtre. Un pays vide reçoit une liste vide —
// le site l'annonce (« aucune annonce en <pays> ») et propose de voir
// l'international : jamais de page blanche sans explication, ce qui était le
// vrai défaut de l'incident du 2026-09-11.

const lister = async (query, user = null) => {
  const { req, res } = mockReqRes({ query, user });
  await getVehicles(req, res);
  return res;
};

describe("Catalogue — pays du visiteur seulement", () => {
  beforeEach(() => cacheClear());

  it("un pays sans annonce reçoit une liste vide, jamais les annonces d'un autre pays", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia Logan" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.total).toBe(0);
    expect(res.body.vehicles).toEqual([]);
    expect(res.body.repliMondial).toBeUndefined();
  });

  it("le pays du visiteur : ses annonces, et seulement elles", async () => {
    const p = await createUser({ role: "partenaire" });
    for (const title of ["Toyota locale", "Hyundai locale"]) {
      await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "CI", title });
    }
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Dacia lointaine" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title).sort()).toEqual(["Hyundai locale", "Toyota locale"]);
  });

  it("« International », choisi par le visiteur, montre tous les pays", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "CI", title: "Ivoirienne" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Marocaine" });

    const res = await lister({ country: "INTL", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title).sort()).toEqual(["Ivoirienne", "Marocaine"]);
  });

  it("une vitrine de partenaire filtrée par pays ne montre que ce pays", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "MA", title: "Unique au Maroc" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "FR", title: "Unique en France" });

    const res = await lister({ owner: p._id.toString(), country: "MA", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title)).toEqual(["Unique au Maroc"]);
  });

  it("une annonce sans pays n'appartient à aucun pays : absente des vues par pays, présente en International", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: null, title: "Sans pays" });

    expect((await lister({ country: "CI", limit: 10 })).body.vehicles).toEqual([]);
    expect((await lister({ country: "INTL", limit: 10 })).body.vehicles.map((v) => v.title)).toEqual(["Sans pays"]);
  });

  it("une RECHERCHE explicite porte sur tous les pays (le visiteur demande CES annonces-là)", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, country: "FR", title: "Clio Paris" });

    const res = await lister({ country: "CI", search: "Clio", limit: 10 });
    expect(res.body.vehicles.map((v) => v.title)).toEqual(["Clio Paris"]);
  });

  it("ne montre jamais d'annonce non modérée", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "pending", available: true, country: "CI", title: "En attente" });

    const res = await lister({ country: "CI", limit: 10 });
    expect(res.body.total).toBe(0);
  });
});
