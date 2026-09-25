import { describe, it, expect } from "vitest";
import { getVehicles } from "../controllers/vehicleController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { cacheClear } from "../utils/catalogCache.js";

// ═══════════════════════════════════════════════════════════════════════════
// UNE VITRINE PARTENAIRE NE MONTRE QUE SES PROPRES ANNONCES
// ═══════════════════════════════════════════════════════════════════════════
// Consigne de l'exploitant (2026-09-24) : « les liens partagés par les
// partenaires ne doivent contenir que les annonces du partenaire, pas tout le
// contenu VIT AUTO ».
//
// Deux façons de trahir cette consigne, toutes deux constatées :
//
//  1. la page filtrait le catalogue DÉJÀ CHARGÉ — paginé et filtré sur le pays
//     du visiteur : 12 % de la flotte visible depuis le Maroc, 0 % depuis la
//     Côte d'Ivoire pour un partenaire de 270 annonces ;
//  2. un `owner` illisible était ignoré EN SILENCE et rendait tout le catalogue
//     — 405 annonces en production. La vitrine d'un partenaire affichait alors
//     les annonces de ses concurrents.
//
// Le second est le plus grave : il échoue en OUVRANT.

const lister = async (query) => {
  const { req, res } = mockReqRes({ query });
  await getVehicles(req, res);
  return res.body;
};

describe("Vitrine partenaire — périmètre", () => {
  const deuxPartenaires = async () => {
    cacheClear();
    const a = await createUser({ role: "partenaire" });
    const b = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: a._id, status: "approved", available: true, country: "MA", title: "A1" });
    await createVehicleDoc({ owner: a._id, status: "approved", available: true, country: "FR", title: "A2" });
    await createVehicleDoc({ owner: b._id, status: "approved", available: true, country: "MA", title: "B1" });
    return { a, b };
  };

  it("ne rend QUE les annonces du partenaire demandé", async () => {
    const { a } = await deuxPartenaires();
    const d = await lister({ owner: a._id.toString(), country: "INTL", limit: 50 });
    expect(d.vehicles.map((v) => v.title).sort()).toEqual(["A1", "A2"]);
  });

  // `country=INTL` est ce que la vitrine envoie, et c'est là que le contrat
  // compte : la flotte ENTIÈRE, quel que soit l'endroit d'où l'on regarde.
  it("avec INTL, rend la flotte entière", async () => {
    const { a } = await deuxPartenaires();
    const d = await lister({ owner: a._id.toString(), country: "INTL", limit: 50 });
    expect(d.vehicles.map((v) => v.title).sort()).toEqual(["A1", "A2"]);
  });

  // Demander un pays AVEC un propriétaire reste légitime (l'administration le
  // fait) : on rend alors le sous-ensemble, pas la flotte entière. Le repli
  // mondial ne se déclenche que si le pays demandé ne donne rien — c'est ce qui
  // évite la page vide sans pour autant ignorer un filtre explicite.
  it("avec un pays précis, rend le sous-ensemble ; et la flotte entière si ce pays est vide", async () => {
    const { a } = await deuxPartenaires();

    const ma = await lister({ owner: a._id.toString(), country: "MA", limit: 50 });
    expect(ma.vehicles.map((v) => v.title)).toEqual(["A1"]);

    const fr = await lister({ owner: a._id.toString(), country: "FR", limit: 50 });
    expect(fr.vehicles.map((v) => v.title)).toEqual(["A2"]);

    // Aucune annonce de ce partenaire en Côte d'Ivoire : plutôt qu'une vitrine
    // vide, on montre tout — et on le signale.
    const ci = await lister({ owner: a._id.toString(), country: "CI", limit: 50 });
    expect(ci.vehicles.map((v) => v.title).sort()).toEqual(["A1", "A2"]);
    expect(ci.repliMondial).toBe(true);
  });

  // LE point. Un filtre demandé mais incompréhensible doit ne RIEN rendre.
  it("ne rend RIEN si l'identifiant du partenaire est illisible", async () => {
    await deuxPartenaires();
    for (const owner of ["INVALIDE", "abc", "12345", "'; DROP", "6aaa8980-6b5a"]) {
      const d = await lister({ owner, country: "INTL", limit: 50 });
      expect(d.total, `owner=${owner}`).toBe(0);
      expect(d.vehicles, `owner=${owner}`).toEqual([]);
    }
  });

  it("un identifiant bien formé mais inconnu rend une vitrine vide, pas le catalogue", async () => {
    await deuxPartenaires();
    const d = await lister({ owner: "000000000000000000000000", country: "INTL", limit: 50 });
    expect(d.total).toBe(0);
  });

  // Sans `owner`, on est sur le catalogue : le comportement d'origine ne doit
  // pas changer, sinon le correctif casserait la page d'accueil.
  it("sans owner, le catalogue reste le catalogue", async () => {
    await deuxPartenaires();
    const d = await lister({ country: "INTL", limit: 50 });
    expect(d.vehicles.map((v) => v.title).sort()).toEqual(["A1", "A2", "B1"]);
  });

  it("un owner vide vaut absence de filtre, pas un blocage", async () => {
    await deuxPartenaires();
    const d = await lister({ owner: "", country: "INTL", limit: 50 });
    expect(d.total).toBe(3);
  });

  // Trouvé en vérifiant si le correctif de pagination était justifié : en
  // production, `?page=abc` rendait HTTP 500 — `Number("abc")` vaut NaN, et
  // `Math.max(NaN, 1)` vaut NaN, donc `$skip: NaN` faisait échouer l'agrégation.
  // Une page illisible doit valoir la première, pas une panne du catalogue.
  it("une page non numérique ne casse pas le catalogue", async () => {
    await deuxPartenaires();
    for (const page of ["abc", "", "-3", "0", "1e9999"]) {
      const d = await lister({ country: "INTL", limit: 50, page });
      expect(d?.total, `page=${page}`).toBe(3);
      expect(d.vehicles.length, `page=${page}`).toBe(3);
    }
  });
});
