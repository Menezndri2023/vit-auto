import { describe, it, expect } from "vitest";
import { construireSitemap, PAGES_STATIQUES, slugifyVille, servirSitemap } from "../controllers/sitemapController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { cacheClear } from "../utils/catalogCache.js";
import { slugifyCity } from "../../src/constants/citySlug.js";
import { LANGUES as LANGUES_SERVEUR } from "../utils/langues.js";
import { LANGUES as LANGUES_APP, cheminDansLangue } from "../../src/i18n/langueUrl.js";

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

import { cheminDansLangue as cheminDansLangueServeur } from "../utils/langues.js";

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
    // Une page de ville est traduite : elle occupe désormais CINQ blocs <url>,
    // un par langue. On compte les <loc>, pas les mentions — chaque bloc cite
    // aussi la ville dans ses six alternates.
    expect(compter(xml, "<loc>https://vit-auto\\.com/location-voiture/yamoussoukro</loc>")).toBe(1);
    expect(compter(xml, "<loc>https://vit-auto\\.com/(?:en|ar|es|zh)/location-voiture/yamoussoukro</loc>")).toBe(4);
  });

  it("annonce les vitrines partenaires qui ont une adresse lisible", async () => {
    cacheClear();
    await createUser({ role: "partenaire", vitrineSlug: "boyzone-car" });
    await createUser({ role: "partenaire" }); // sans slug : rien à annoncer

    const xml = await construireSitemap();
    expect(xml).toContain("https://vit-auto.com/p/boyzone-car");
    expect(compter(xml, "<loc>https://vit-auto.com/p/")).toBe(1);
  });


  // ── hreflang ──────────────────────────────────────────────────────────────
  //
  // Le sitemap est le signal le plus fort pour déclarer les versions
  // linguistiques : il les couvre toutes d'un coup, sans dépendre de
  // l'exécution du JavaScript par le robot. Encore faut-il que ce qu'il
  // annonce existe et soit réciproque.

  it("annonce les mêmes langues que l'application", () => {
    // Une divergence publierait des adresses que le routeur ne sait pas
    // résoudre — un sitemap plein d'URL mortes.
    expect(LANGUES_SERVEUR.map((l) => l.code)).toEqual(LANGUES_APP.map((l) => l.code));
  });

  it("préfixe les adresses exactement comme l'application", () => {
    for (const chemin of ["/", "/faq", "/location-voiture/abidjan"]) {
      for (const l of LANGUES_SERVEUR) {
        expect(cheminDansLangueServeur(chemin, l.code)).toBe(cheminDansLangue(chemin, l.code));
      }
    }
  });

  it("donne à chaque page traduite ses cinq versions et x-default", async () => {
    const xml = await construireSitemap();
    // /faq est déclarée traduite : les cinq adresses doivent exister comme
    // <loc> à part entière, pas seulement comme alternates.
    for (const l of LANGUES_SERVEUR) {
      const attendu = `<loc>https://vit-auto.com${cheminDansLangue("/faq", l.code)}</loc>`;
      expect(xml, `version ${l.code} de /faq absente`).toContain(attendu);
    }
    expect(xml).toContain('hreflang="x-default" href="https://vit-auto.com/faq"');
    expect(xml).toContain('hreflang="zh-Hans"');
    // L'espace de noms, sans lequel <xhtml:link> rend le sitemap invalide.
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  it("ne déclare AUCUN alternate sur une page qui n'est pas traduite", async () => {
    const xml = await construireSitemap();
    // Les pages légales restent françaises : annoncer cinq versions d'un même
    // texte français serait une fausse déclaration.
    const blocCgu = xml.split("\n").find((l) => l.includes("<loc>https://vit-auto.com/cgu</loc>"));
    expect(blocCgu, "/cgu absente du sitemap").toBeTruthy();
    expect(blocCgu).not.toContain("xhtml:link");
    expect(xml).not.toContain("https://vit-auto.com/en/cgu");
  });

  it("chaque jeu d'alternates est réciproque", async () => {
    const xml = await construireSitemap();
    // Google ignore en bloc un jeu non réciproque : la version anglaise doit
    // déclarer la française autant que l'inverse.
    //
    // ⚠️ Ce test n'a longtemps vérifié que la PRÉSENCE des attributs hreflang,
    // jamais la valeur des href. Il a donc laissé passer en production un
    // sitemap où /en/faq déclarait /en/en/faq (2026-09-26) : le chemin déjà
    // préfixé était préfixé une seconde fois. On compare désormais les
    // adresses elles-mêmes.
    const blocs = xml.split("<url>").filter((b) => b.includes("xhtml:link"));
    expect(blocs.length).toBeGreaterThan(0);
    for (const bloc of blocs.slice(0, 20)) {
      for (const l of LANGUES_SERVEUR) {
        expect(bloc, `alternate ${l.hreflang} manquant`).toContain(`hreflang="${l.hreflang}"`);
      }
      expect(bloc).toContain('hreflang="x-default"');
    }
  });

  it("aucun alternate ne pointe vers une adresse absente du sitemap", async () => {
    const xml = await construireSitemap();
    // L'invariant qui manquait : un href d'alternate n'est pas un texte libre,
    // c'est une page que le sitemap doit aussi déclarer comme <loc>. Un double
    // préfixe, une faute de frappe ou un chemin nu oublié échouent ici.
    const locs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    const hrefs = new Set(
      [...xml.matchAll(/<xhtml:link rel="alternate" hreflang="[^"]+" href="([^"]+)"\/>/g)]
        .map((m) => m[1])
    );
    expect(hrefs.size).toBeGreaterThan(0);
    const orphelins = [...hrefs].filter((h) => !locs.has(h));
    expect(orphelins.slice(0, 5), `${orphelins.length} alternate(s) vers une page non déclarée`).toEqual([]);
  });

  it("les cinq versions d'une page déclarent toutes le même jeu d'alternates", async () => {
    const xml = await construireSitemap();
    // La réciprocité au sens strict : /faq, /en/faq, /ar/faq… doivent porter
    // des alternates IDENTIQUES, et chacun doit s'y désigner lui-même.
    const alternatesDe = (loc) => {
      const bloc = xml.split("\n").find((l) => l.includes(`<loc>${loc}</loc>`));
      expect(bloc, `${loc} absente du sitemap`).toBeTruthy();
      return [...bloc.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`).join("|");
    };
    const reference = alternatesDe("https://vit-auto.com/faq");
    expect(reference).toContain("x-default https://vit-auto.com/faq");
    for (const l of LANGUES_SERVEUR) {
      const loc = `https://vit-auto.com${cheminDansLangue("/faq", l.code)}`;
      expect(alternatesDe(loc), `jeu d'alternates divergent sur ${loc}`).toBe(reference);
      expect(reference, `${loc} ne se déclare pas elle-même`).toContain(`${l.hreflang} ${loc}`);
    }
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
