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
// LE SERVICE WORKER NE DOIT JAMAIS CASSER UNE RÉPONSE VALIDE
// ═══════════════════════════════════════════════════════════════════════════
// Panne du 2026-09-11 : plus aucune image ne s'affichait en production.
// Mesuré sur la page réelle, même navigateur :
//   • service worker bloqué → 8/8 images, 0 échec ;
//   • service worker actif  → 0/8 images, 79 731 requêtes en échec.
//
// Cause : `event.respondWith()` recevait `undefined` sur un chemin d'erreur.
// `respondWith(undefined)` ne « laisse pas passer » la requête — il la fait
// échouer. Une erreur de mise en cache détruisait donc une réponse réseau
// parfaitement bonne, et le quota du Cache Storage, rempli de photos, la
// provoquait pour TOUTES les images d'un coup.
//
// Un service worker ne s'exécute pas dans cette suite : on vérifie donc sa
// SOURCE. C'est grossier, mais cela ferme précisément la porte par laquelle la
// panne est entrée — et aucun autre test du dépôt ne regarde ce fichier.

const BRUT = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

// Les COMMENTAIRES sont retirés avant toute analyse. Sans cela, le test
// échouait sur le commentaire du correctif, qui cite précisément la forme
// fautive pour l'expliquer — un test qui lit la documentation au lieu du code
// se trompe dans les deux sens : faux positif ici, faux négatif si quelqu'un
// écrit la bonne forme dans un commentaire au-dessus de la mauvaise.
const SRC = BRUT
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("Service worker", () => {
  it("ne renvoie jamais une variable qui peut valoir undefined à respondWith", async () => {
    // La forme exacte qui a cassé la production : un `catch` qui retombe sur
    // une variable de cache éventuellement absente.
    expect(SRC).not.toMatch(/catch\(\s*\(\)\s*=>\s*cached\s*\)/);
    expect(SRC).not.toMatch(/catch\(\s*\(\)\s*=>\s*cache\w*\s*\)/);
  });

  it("protège chaque mise en cache — le quota plein ne doit rien casser", async () => {
    // `cache.put()` rejette quand le stockage est saturé, en navigation privée,
    // ou sur une réponse opaque. Chaque appel doit être isolé.
    const appels = SRC.match(/cache\.put\(/g) || [];
    // Un SEUL point d'appel dans tout le fichier, encapsulé dans un helper qui
    // avale l'échec — c'est ce qui rend la garantie vérifiable.
    expect(appels).toHaveLength(1);
    expect(SRC).toMatch(/function mettreEnCache/);
    // Le `.catch` suit la fermeture de `put(...)` : la parenthèse de
    // `response.clone()` interdit un `[^)]*` naïf.
    expect(SRC).toMatch(/cache\.put\(.*\)\s*\.catch\(/);
  });

  it("n'intercepte pas les images d'un autre domaine", async () => {
    // Le CDN les sert déjà avec un cache d'un an. Les recopier dans le Cache
    // Storage n'apporte rien et sature le quota — l'origine de la panne.
    const brancheImage = SRC.slice(SRC.indexOf("destination === 'image'"));
    expect(brancheImage.slice(0, 600)).toMatch(/url\.origin !== self\.location\.origin\)\s*return;/);
  });

  it("ne met en cache que des requêtes GET", async () => {
    // `cache.put()` lève sur toute autre méthode.
    expect(SRC).toMatch(/request\.method !== 'GET'\)\s*return;/);
  });

  it("sert une réponse de repli en navigation hors ligne, jamais undefined", async () => {
    const nav = SRC.slice(SRC.indexOf("request.mode === 'navigate'"));
    expect(nav).toMatch(/new Response\(/);
  });

  it("ne relaie AUCUNE requête vers un autre domaine — polices comprises", async () => {
    // Un `fetch()` exécuté DANS le worker relève de la directive `connect-src`
    // de sa CSP, pas de `font-src`/`img-src` comme la même requête émise par
    // la page. `connect-src` ne liste que notre API : tout ce que le worker
    // relayait vers un tiers était bloqué, et la promesse rejetée faisait
    // échouer la requête. Mesuré en production : Poppins absente sur toute
    // page à partir de la deuxième navigation — la première n'est pas encore
    // contrôlée par le worker, ce qui masquait le défaut à toute vérification
    // faite dans un contexte neuf.
    // La garde doit précéder TOUT respondWith : on vérifie qu'elle apparaît
    // avant le premier, sans condition sur la destination.
    // …et avant la branche image, qui porte SA PROPRE garde d'origine — une
    // garde limitée aux images ne couvre ni les polices ni le reste. Validé à
    // l'envers : la garde générale retirée, celle de la branche image ne doit
    // pas suffire à faire passer ce test.
    const brancheImage = SRC.indexOf("destination === 'image'");
    const avant = SRC.slice(0, brancheImage);
    expect(avant).toMatch(/^  if \(url\.origin !== self\.location\.origin\) return;/m);
  });

  it("change de version de cache pour purger celui qui a causé la panne", async () => {
    // Sans montée de version, le cache saturé des visiteurs survivrait au
    // déploiement et la panne persisterait chez eux.
    const version = SRC.match(/CACHE_NAME\s*=\s*'([^']+)'/)?.[1];
    expect(version).toBeTruthy();
    expect(version).not.toBe("vit-auto-v4"); // la version en panne des images
    expect(version).not.toBe("vit-auto-v5"); // celle qui relayait encore les polices
  });
});

describe("Le service worker ne sert jamais un index.html en cache", () => {
  // Constaté par l'exploitant le 2026-09-12 : une page en HTML nu, sans style
  // ni script. Un index.html mis en cache référence les fichiers JS/CSS à
  // empreinte du déploiement de ce moment-là ; après le déploiement suivant,
  // l'hébergeur ne les sert plus. Servi à la moindre coupure réseau, il donnait
  // exactement ce symptôme — et il y avait eu douze déploiements la veille.
  it("index.html n'est ni précaché ni lu depuis le cache", () => {
    const precache = SRC.match(/STATIC_ASSETS\s*=\s*\[([^\]]*)\]/)?.[1] || "";
    expect(precache).not.toMatch(/'\/'/);
    expect(SRC).not.toMatch(/caches\.match\(\s*'\/'\s*\)/);
    // La branche navigation ne met pas non plus la réponse en cache.
    const debut = SRC.indexOf("mode === 'navigate'");
    const nav = SRC.slice(debut, SRC.indexOf("return;", debut));   // la branche, jusqu'à son return
    expect(nav).not.toMatch(/mettreEnCache|cache\.put/);
  });

  it("le repli hors ligne est une page autonome, sans fichier à empreinte ni script", () => {
    expect(SRC).toMatch(/caches\.match\(\s*'\/offline\.html'\s*\)/);
    const offline = fs.readFileSync(path.join(process.cwd(), "public", "offline.html"), "utf8");
    expect(offline).not.toMatch(/\/assets\//);
    expect(offline).not.toMatch(/<script/i);      // la CSP interdit les scripts en ligne
    expect(offline).toMatch(/href="\/"/);          // un lien pour réessayer
  });

  it("change encore de version de cache : celle qui contenait un index.html périmé doit être purgée", () => {
    const version = SRC.match(/CACHE_NAME\s*=\s*'([^']+)'/)?.[1];
    expect(["vit-auto-v4", "vit-auto-v5", "vit-auto-v6"]).not.toContain(version);
  });
});
