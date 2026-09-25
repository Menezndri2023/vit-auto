/* global process */
//
// `process` est bien disponible sous Vitest (Node + globals jsdom) ; seul
// ESLint l'ignore dans le périmètre navigateur, d'où la déclaration ci-dessus.
// L'environnement reste jsdom : le fichier de configuration partagé
// (src/test/setup.js) s'appuie sur `window`, et le passer en Node casserait
// toute la suite.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// LA POLITIQUE DE SÉCURITÉ NE DOIT PAS CASSER CE QU'ELLE AUTORISE
// ═══════════════════════════════════════════════════════════════════════════
// Trouvé en balayant la production au navigateur : `accounts.google.com` était
// autorisé pour les SCRIPTS, les CADRES et les CONNEXIONS, mais pas pour les
// STYLES. La bibliothèque Google Sign-In charge `accounts.google.com/gsi/style`
// — bloqué sur /login, /register et /importer-apply, les trois pages où l'on
// se connecte.
//
// Une CSP qui autorise un tiers à moitié est pire qu'une CSP qui le refuse :
// le bouton s'affiche, mal, et personne ne sait pourquoi.

const CSP = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"))
  .headers.flatMap((h) => h.headers)
  .find((h) => h.key === "Content-Security-Policy").value;

const directive = (nom) => {
  const d = CSP.split(";").map((x) => x.trim()).find((x) => x.startsWith(nom + " "));
  return d ? d.slice(nom.length).trim().split(/\s+/) : [];
};

describe("Content-Security-Policy", () => {
  it("autorise Google Sign-In sur les QUATRE directives dont il a besoin", async () => {
    // Retirer l'une d'elles ne casse pas le déploiement : cela casse
    // silencieusement l'authentification Google, sur les seules pages de
    // connexion.
    for (const d of ["script-src", "style-src", "frame-src", "connect-src"]) {
      expect(directive(d), `${d} doit autoriser accounts.google.com`).toContain("https://accounts.google.com");
    }
  });

  it("autorise les polices Google, feuille ET fichiers", async () => {
    // Même piège : la feuille vient de fonts.googleapis.com, les fichiers de
    // fonts.gstatic.com. N'en autoriser qu'un donne une page sans sa typographie.
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("autorise les services dont dépend le catalogue", async () => {
    // Géolocalisation par IP (pays du visiteur, devise), géocodage inverse et
    // tuiles de carte : bloqués, le catalogue se dégrade sans message d'erreur.
    const connect = directive("connect-src");
    for (const h of ["https://ipapi.co", "https://nominatim.openstreetmap.org"]) {
      expect(connect, `connect-src doit autoriser ${h}`).toContain(h);
    }
  });

  it("garde les restrictions qui protègent réellement", async () => {
    expect(directive("object-src")).toContain("'none'");
    expect(directive("frame-ancestors")).toContain("'none'");
    expect(directive("base-uri")).toContain("'self'");
    // Aucun script inline : c'est la protection principale contre le XSS, et
    // elle ne doit pas être desserrée pour faire passer un widget.
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });
});

describe("Rien dans la page d'accueil ne dépend d'un script en ligne", () => {
  // `script-src` ne contient pas `'unsafe-inline'` — c'est voulu, c'est la
  // protection principale contre l'injection de script. Conséquence : tout
  // gestionnaire écrit en attribut HTML (`onload=`, `onclick=`…) est bloqué
  // EN PRODUCTION, et nulle part ailleurs.
  //
  // C'est exactement ce qui est arrivé à la police de la marque. index.html
  // chargeait Poppins avec l'astuce `media="print"` + `onload="this.media='all'"` :
  // le gestionnaire ne s'exécutait jamais en ligne, la feuille restait en
  // `media="print"` et n'était donc JAMAIS appliquée à l'écran. Tout le site
  // s'affichait dans la police de secours du système.
  // Invisible en local : ni `vite dev` ni `vite preview` ne posent d'en-tête
  // CSP, le gestionnaire s'y exécutait normalement.
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");   // les commentaires citent le code fautif

  it("index.html ne contient aucun gestionnaire d'événement en attribut", () => {
    const enLigne = [...html.matchAll(/\son[a-z]+\s*=\s*["']/gi)].map((m) => m[0].trim());
    expect(enLigne, "gestionnaires en ligne, bloqués par la CSP en production").toEqual([]);
  });

  it("script-src n'autorise pas 'unsafe-inline' (sinon la garde ci-dessus n'a plus d'objet)", () => {
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
  });

  it("la feuille de police est appliquée sans condition", () => {
    const lien = html.match(/<link[^>]*fonts\.googleapis[^>]*rel="stylesheet"[^>]*>|<link[^>]*rel="stylesheet"[^>]*fonts\.googleapis[^>]*>/s);
    expect(lien, "un lien stylesheet vers fonts.googleapis doit exister").toBeTruthy();
    expect(lien[0], "pas de media=print : la feuille doit valoir pour l'écran").not.toMatch(/media\s*=\s*["']print/);
  });
});

describe("Le moteur OCR du KYC passe la CSP", () => {
  // Trouvé le 2026-09-12 en parcourant les pages CONNECTÉES : sur /kyc,
  // « Failed to execute 'importScripts' on 'WorkerGlobalScope' ». Tesseract v7
  // charge son worker, son cœur WebAssembly et ses modèles de langue depuis
  // cdn.jsdelivr.net ; dans un worker, importScripts relève de script-src et
  // le chargement des modèles de connect-src. Rien de tout cela n'était
  // autorisé : la soumission d'une pièce d'identité échouait en production.
  // Les chemins sont scellés à la version : ouvrir tout le CDN reviendrait à
  // autoriser n'importe quel script tiers.
  it("autorise le worker, le cœur WASM et les modèles de Tesseract, et rien de plus large", () => {
    const script = directive("script-src"), connect = directive("connect-src");
    expect(script).toContain("https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/");
    expect(script).toContain("https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/");
    // Compiler du WebAssembly exige cette autorisation, limitée au WASM.
    expect(script).toContain("'wasm-unsafe-eval'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("https://cdn.jsdelivr.net");   // jamais le CDN entier
    expect(connect).toContain("https://cdn.jsdelivr.net/npm/@tesseract.js-data/");
  });

  it("la version scellée dans la CSP est celle réellement installée", () => {
    const installee = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", "tesseract.js", "package.json"), "utf8")).version;
    expect(directive("script-src").join(" ")).toContain(`tesseract.js@v${installee}/`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUI A LE DROIT D'ÊTRE MIS EN CACHE
// ═══════════════════════════════════════════════════════════════════════════
// Deux exigences opposées vivent dans la même règle fourre-tout, et il serait
// facile d'en casser une en réglant l'autre :
//
//  - `index.html` ne doit JAMAIS être servi depuis un cache. Il l'a été après
//    un déploiement, et un visiteur qui revenait recevait un HTML nu pointant
//    des fichiers disparus (incident du 2026-09-12). D'où `no-store` sur tout
//    ce qui n'est pas un asset versionné.
//  - `/sitemap.xml` GAGNE à être mis en cache : servi par l'API depuis le
//    2026-09-25, chaque passage de robot réveille sinon un serveur endormi.
describe("vercel.json — politique de cache", () => {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  const regleDe = (chemin) => config.headers.find((h) => {
    const rx = new RegExp("^" + h.source.replace("/((?!", "(?!").replace(").*)", ").*$"));
    return rx.test(chemin) || h.source === `/${chemin}`;
  });
  const valeur = (chemin) =>
    (regleDe(chemin)?.headers || []).find((x) => x.key.toLowerCase() === "cache-control")?.value || "";

  it("interdit toujours le cache de index.html et des pages", () => {
    for (const chemin of ["index.html", "", "catalogue", "vehicle/abc", "p/boyzone-car"]) {
      expect(valeur(chemin), `/${chemin} doit rester non mis en cache`).toMatch(/no-store/);
    }
  });

  it("autorise le cache du sitemap — sinon chaque robot réveille l'API", () => {
    const regle = config.headers.find((h) => h.source === "/sitemap.xml");
    expect(regle, "aucune règle dédiée au sitemap").toBeTruthy();
    const v = regle.headers.find((x) => x.key.toLowerCase() === "cache-control")?.value || "";
    expect(v).toMatch(/max-age=\d{3,}/);
    expect(v).not.toMatch(/no-store/);

    // Et surtout : la règle FOURRE-TOUT ne doit pas l'attraper aussi. Écrite
    // d'abord sans cette vérification, cette garde ne pouvait pas échouer —
    // remettre le sitemap sous `no-store` la laissait verte, puisque la règle
    // dédiée existait toujours. Deux règles qui se contredisent laissent la
    // réponse dépendre d'un ordre de priorité qu'on ne maîtrise pas.
    const fourreTout = config.headers[0];
    const rx = new RegExp("^" + fourreTout.source.replace("/((?!", "(?!").replace(").*)", ").*$"));
    expect(rx.test("sitemap.xml"), "la règle fourre-tout impose aussi no-store au sitemap").toBe(false);
  });

  it("le sitemap est bien relayé vers l'API, avant le repli SPA", () => {
    const i = config.rewrites.findIndex((r) => r.source === "/sitemap.xml");
    const repli = config.rewrites.findIndex((r) => r.destination === "/index.html");
    expect(i, "aucune réécriture pour /sitemap.xml").toBeGreaterThanOrEqual(0);
    expect(i, "la réécriture doit précéder le repli SPA").toBeLessThan(repli);
  });
});
