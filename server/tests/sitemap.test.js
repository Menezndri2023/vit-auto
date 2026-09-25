import { describe, it, expect } from "vitest";
import { construireSitemap, PAGES_STATIQUES, slugifyVille, servirSitemap } from "../controllers/sitemapController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { cacheClear } from "../utils/catalogCache.js";
import { slugifyCity } from "../../src/constants/citySlug.js";

// ═══════════════════════════════════════════════════════════════════════════
// LE SITEMAP DOIT CONTENIR LE CATALOGUE, PAS SEULEMENT LE MENU
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré en production le 2026-09-25 : https://vit-auto.com/sitemap.xml servait
// **17 URL** — exactement le nombre de pages statiques — alors que le même
// générateur en produit 643 quand l'API répond. 626 pages, dont les 405
// annonces publiées, étaient invisibles aux moteurs de recherche.
//
// La cause : `public/sitemap.xml` n'est pas versionné, Vercel construit sur un
// clone neuf, et le script de build interrogeait l'API Render — qui dort. Au
// réveil trop lent, repli silencieux sur les seules pages statiques, signalé
// par un avertissement dans un journal de build que personne ne lit.
//
// Le sitemap est désormais construit par l'API elle-même : toujours complet,
// toujours frais, sans dépendre d'un réveil au bon moment.

const compter = (xml, motif) => (xml.match(new RegExp(motif, "g")) || []).length;

describe("Sitemap", () => {
  it("contient les annonces publiées, pas seulement les pages statiques", async () => {
    cacheClear();
    const p = await createUser({ role: "partenaire" });
    for (let i = 0; i < 3; i++) {
      await createVehicleDoc({ owner: p._id, status: "approved", available: true, ville: "Abidjan", type: "location" });
    }

    const xml = await construireSitemap();
    expect(compter(xml, "<loc>")).toBeGreaterThan(PAGES_STATIQUES.length);
    expect(compter(xml, "/vehicle/")).toBe(3);
  });

  // Le défaut EXACT constaté : un sitemap réduit aux pages statiques. Si cette
  // garde ne tient plus, c'est que la partie dynamique a de nouveau disparu.
  it("ne se réduit JAMAIS aux seules pages statiques quand des annonces existent", async () => {
    cacheClear();
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true });

    const xml = await construireSitemap();
    expect(compter(xml, "<loc>"), "sitemap retombé aux pages statiques").not.toBe(PAGES_STATIQUES.length);
  });

  it("n'annonce pas les annonces non approuvées ni les indisponibles", async () => {
    cacheClear();
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "pending",  available: true });
    await createVehicleDoc({ owner: p._id, status: "approved", available: false });

    const xml = await construireSitemap();
    expect(compter(xml, "/vehicle/")).toBe(0);
  });

  // Une adresse annoncée que le site ne sait pas résoudre est pire qu'une
  // adresse absente : le moteur la visite, reçoit une page vide, et en tire
  // une conclusion sur la qualité du site.
  it("produit exactement le même slug de ville que l'application", () => {
    for (const ville of ["Abidjan", "Bouaké", "Saint-Louis", "  Casablanca  ", "— Dakar —", "Port-Gentil", ""]) {
      expect(slugifyVille(ville), `ville=${ville}`).toBe(slugifyCity(ville));
    }
  });

  it("n'annonce une page de ville qu'à partir de deux annonces", async () => {
    cacheClear();
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, ville: "Yamoussoukro", type: "location" });
    let xml = await construireSitemap();
    expect(compter(xml, "location-voiture/yamoussoukro")).toBe(0);

    await createVehicleDoc({ owner: p._id, status: "approved", available: true, ville: "Yamoussoukro", type: "location" });
    xml = await construireSitemap();
    expect(compter(xml, "location-voiture/yamoussoukro")).toBe(1);
  });

  it("annonce les vitrines partenaires qui ont une adresse lisible", async () => {
    cacheClear();
    await createUser({ role: "partenaire", vitrineSlug: "boyzone-car" });
    await createUser({ role: "partenaire" }); // sans slug : rien à annoncer

    const xml = await construireSitemap();
    expect(xml).toContain("https://vit-auto.com/p/boyzone-car");
    expect(compter(xml, "<loc>https://vit-auto.com/p/")).toBe(1);
  });

  it("est du XML servi avec le bon type", async () => {
    cacheClear();
    const { req, res } = mockReqRes({});
    await servirSitemap(req, res);
    expect(res.headers?.["Content-Type"] || res.headers?.["content-type"]).toMatch(/xml/);
    expect(res.body).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(res.body).toContain("<urlset");
  });
});
