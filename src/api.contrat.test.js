import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/* global process */

// ── Le front appelle-t-il des routes qui existent ? ────────────────────────
//
// Une URL mal tapée dans un `fetch` ne casse ni le build, ni le lint, ni les
// tests de rendu : elle rend un 404 au moment précis où un utilisateur clique.
// Rien ne l'attrapait — ni côté front (l'appel est une chaîne), ni côté
// serveur (la route n'a pas conscience de ses appelants).
//
// ⚠️ Ce fichier a été écrit APRÈS s'être trompé trois fois de mesure : la
// première version annonçait 62 routes manquantes, la deuxième 41, toutes
// fausses. Les causes, toutes dans le DÉTECTEUR :
//  · `router.get   ("/x")` avec des espaces d'alignement n'était pas reconnu ;
//  · `/api/x/${id}` était coupé à l'interpolation, donc comparé tronqué ;
//  · `app.get("/api/health", …)` déclaré directement dans server.js, hors
//    routeur, n'était compté nulle part.
// D'où les trois précautions ci-dessous. Une garde qui crie faux est pire
// qu'absente : on apprend à l'ignorer.
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");

const serveur = lire("server/server.js");

/** Toutes les routes réellement servies, préfixe des routeurs compris. */
function routesServeur() {
  const imports = Object.fromEntries(
    [...serveur.matchAll(/import\s+(\w+)\s+from\s+"\.\/routes\/([\w.-]+)"/g)].map((m) => [m[1], m[2]])
  );
  const chemins = [];

  // (1) Routes déclarées DIRECTEMENT sur l'app (santé, webhooks, sitemap…).
  for (const m of serveur.matchAll(/app\.(get|post|patch|put|delete)\s*\(\s*"(\/api[^"]*)"/g)) {
    chemins.push(m[2]);
  }

  // (2) Routes des routeurs montés sous un préfixe.
  for (const m of serveur.matchAll(/app\.use\(\s*"(\/api[^"]*)"\s*,([^)]*)\)/g)) {
    const prefixe = m[1];
    const variable = [...m[2].matchAll(/(\w+)/g)].map((x) => x[1]).pop();
    const fichier = imports[variable];
    if (!fichier) continue;
    let src;
    try { src = lire(join("server/routes", fichier)); } catch { continue; }
    // `\s*` avant la parenthèse : plusieurs fichiers alignent leurs verbes
    // (`router.get   ("/hero", …)`) — sans lui, 123 routes disparaissaient.
    for (const r of src.matchAll(/router\.(get|post|patch|put|delete)\s*\(\s*"([^"]*)"/g)) {
      chemins.push((prefixe + r[2]).replace(/\/+$/, "") || "/");
    }
  }
  return chemins;
}

function fichiersSources(dossier = join(RACINE, "src"), acc = []) {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) fichiersSources(p, acc);
    else if (/\.jsx?$/.test(p) && !/\.test\./.test(p)) acc.push(p);
  }
  return acc;
}

describe("Contrat front ↔ serveur", () => {
  const chemins = routesServeur();
  const motifs = chemins.map((c) => new RegExp("^" + c.replace(/:[^/]+/g, "[^/]+").replace(/\*/g, ".*") + "$"));

  it("le serveur expose un nombre plausible de routes", () => {
    // Filet contre un détecteur qui se casse en silence : s'il ne trouve
    // soudain plus rien, c'est LUI qui est en panne, pas le serveur — et le
    // test ci-dessous passerait alors au vert en ne vérifiant rien.
    expect(chemins.length).toBeGreaterThan(300);
  });

  it("aucun appel du front ne vise une route inexistante", () => {
    const manquants = new Map();
    for (const f of fichiersSources()) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/["'`](\/api\/[^"'`]*)/g)) {
        const brut = m[1];
        // Un chemin interpolé (`/api/x/${id}`) ou une base de constante
        // (`const API = "/api/x"`) ne peut être vérifié qu'en PRÉFIXE : on
        // sait seulement qu'au moins une route doit commencer ainsi.
        const partiel = /[$?#]/.test(brut) || !brut.slice(5).includes("/");
        const chemin = brut.split(/[$?#]/)[0].replace(/\/+$/, "");
        if (chemin === "/api" || chemin.includes("...")) continue;
        const ok = partiel
          ? chemins.some((c) => c.startsWith(chemin))
          : motifs.some((r) => r.test(chemin)) || chemins.some((c) => c.startsWith(chemin + "/"));
        if (ok) continue;
        if (!manquants.has(chemin)) manquants.set(chemin, new Set());
        manquants.get(chemin).add(f.replace(RACINE + "/", ""));
      }
    }
    const rapport = [...manquants].map(([c, fs]) => `  ${c}\n      ← ${[...fs].join(", ")}`).join("\n");
    expect(manquants.size, `Appel(s) front sans route serveur :\n${rapport}`).toBe(0);
  });
});
