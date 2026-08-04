import { describe, it, expect } from "vitest";
import { getHero, updateHero } from "../controllers/siteContentController.js";
import SiteContent from "../models/SiteContent.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Carrousel hero par pays (voir SiteContent.js heroSpotlightsByCountry) —
// demande explicite : un visiteur au Maroc doit pouvoir voir une sélection
// différente d'un visiteur en Côte d'Ivoire, sans jamais perdre la sélection
// globale par défaut (repli pour tout pays non curaté, voir HeroSection.jsx).
const patchHero = async (admin, body) => {
  const { req, res } = mockReqRes({ user: admin, body });
  await updateHero(req, res);
  return res;
};

describe("siteContentController — carrousel hero par pays", () => {
  it("PATCH sans `country` (ou GLOBAL) écrit heroSpotlights, jamais heroSpotlightsByCountry", async () => {
    const admin = await createUser({ role: "admin" });
    const v = await createVehicleDoc();

    const res = await patchHero(admin, { heroSpotlights: [v._id.toString()], country: "GLOBAL" });

    expect(res.body.heroSpotlights.map((x) => String(x._id))).toEqual([v._id.toString()]);
    expect(res.body.heroSpotlightsByCountry).toHaveLength(0);
  });

  it("PATCH avec `country` crée une entrée dédiée sans toucher à la sélection globale", async () => {
    const admin = await createUser({ role: "admin" });
    const vGlobal = await createVehicleDoc();
    const vMa     = await createVehicleDoc();

    await patchHero(admin, { heroSpotlights: [vGlobal._id.toString()], country: "GLOBAL" });
    const res = await patchHero(admin, { heroSpotlights: [vMa._id.toString()], country: "MA" });

    expect(res.body.heroSpotlightsByCountry).toHaveLength(1);
    expect(res.body.heroSpotlightsByCountry[0].country).toBe("MA");
    expect(res.body.heroSpotlightsByCountry[0].vehicles.map((x) => String(x._id))).toEqual([vMa._id.toString()]);
    // La sélection globale n'a pas été écrasée par le PATCH pays.
    expect(res.body.heroSpotlights.map((x) => String(x._id))).toEqual([vGlobal._id.toString()]);
  });

  it("PATCH sur un pays déjà configuré met à jour son entrée in-place (pas de doublon)", async () => {
    const admin = await createUser({ role: "admin" });
    const v1 = await createVehicleDoc();
    const v2 = await createVehicleDoc();

    await patchHero(admin, { heroSpotlights: [v1._id.toString()], country: "CI" });
    await patchHero(admin, { heroSpotlights: [v2._id.toString()], country: "CI" });

    const stored = await SiteContent.findById("hero").lean();
    const ciEntries = stored.heroSpotlightsByCountry.filter((c) => c.country === "CI");
    expect(ciEntries).toHaveLength(1);
    expect(ciEntries[0].vehicles.map(String)).toEqual([v2._id.toString()]);
  });

  it("GET renvoie la sélection globale et la sélection par pays, peuplées", async () => {
    const admin = await createUser({ role: "admin" });
    const v = await createVehicleDoc({ title: "Toyota Corolla — Maroc" });

    await patchHero(admin, { heroSpotlights: [v._id.toString()], country: "MA" });

    const { req, res } = mockReqRes({});
    await getHero(req, res);

    expect(res.body.heroSpotlightsByCountry).toHaveLength(1);
    expect(res.body.heroSpotlightsByCountry[0].vehicles[0].title).toBe("Toyota Corolla — Maroc");
  });
});
