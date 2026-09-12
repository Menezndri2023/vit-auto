// ═══════════════════════════════════════════════════════════════════════════
// VÉRIFICATION LOCALE AVANT PUBLICATION — dans les conditions de la production
// ═══════════════════════════════════════════════════════════════════════════
// Exerce le paquet CONSTRUIT (dist/) dans un vrai navigateur, servi AVEC les
// en-têtes de vercel.json (CSP comprise) par `npm run preview:csp`. Chaque
// contrôle ci-dessous correspond à un incident réel qu'aucune suite de tests
// ne pouvait voir :
//   • service worker sur une DEUXIÈME navigation — la première n'est jamais
//     sous son contrôle (panne des images, puis des polices) ;
//   • police de la marque réellement chargée (media="print", puis connect-src
//     du worker) ;
//   • requêtes en échec et HTTP ≥ 400, pas seulement les erreurs JS ;
//   • pages CONNECTÉES : KYC (worker OCR sous CSP), espaces client/partenaire,
//     et les 43 onglets d'administration — la sonde publique ne les voit pas ;
//   • contenu coupé mesuré par la position des éléments, pas par scrollWidth,
//     qu'un overflow:hidden rend aveugle.
//
//   npm run build && npm run preview:csp      (dans un terminal)
//   npm run verify:local                      (dans un autre)
//
//   VERIF_ADMIN_ID=… VERIF_ADMIN_PWD=… npm run verify:local
//       → ajoute les pages connectées et le panneau d'administration.
//
// Sort en code 1 à la moindre anomalie. Branché sur le hook pre-push
// (.githooks/pre-push) : rien ne part en production sans être passé ici.
import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function trouverChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const racine = process.platform === "darwin"
    ? join(homedir(), "Library", "Caches", "ms-playwright")
    : join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(racine)) return null;
  const dossiers = readdirSync(racine)
    .filter((d) => d.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dossiers) {
    for (const rel of [
      ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
      ["chrome-linux", "chrome"],
    ]) {
      const p = join(racine, d, ...rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const EXE = trouverChromium();
if (!EXE) {
  console.error("Chromium introuvable. Installez-le : npx playwright install chromium");
  console.error("Ou indiquez son chemin : CHROMIUM_PATH=/chemin/vers/chromium node scripts/verifierLocalement.mjs");
  process.exit(2);
}
const BASE = process.argv[2] || "http://localhost:4180";
const ADMIN_ID = process.env.VERIF_ADMIN_ID, ADMIN_PWD = process.env.VERIF_ADMIN_PWD;

const PAGES_PUBLIQUES = ["/", "/catalogue", "/catalogue?mode=Acheter", "/plans", "/services", "/login", "/register",
  "/pourquoi", "/partenaires", "/faq", "/import-export", "/import-export/listings", "/cgu", "/privacy", "/stats"];
const PAGES_CONNECTEES = ["/dashboard", "/profile", "/favorites", "/loyalty", "/kyc", "/cart", "/vendor/dashboard",
  "/vendor/pro", "/vendor/publish", "/partner-onboarding", "/partner-certification", "/partner-pms", "/importer-dashboard"];
const ECRANS = [
  { nom: "mobile", width: 390, height: 844, mobile: true },
  { nom: "bureau", width: 1440, height: 900, mobile: false },
];
// Bruit connu, sans effet utilisateur : repli géoloc pour une IP non
// localisable, télémétrie, favicon, et le 403 VOULU d'une statistique
// réservée aux abonnés (PLAN_REQUIS) sur /vendor/pro.
// Messages internes du cœur Tesseract en initialisation multilingue, émis en
// console.error, sans effet : reproduits en Node sans navigateur ni CSP, la
// reconnaissance aboutit ensuite (vérifié : « ABC 123 » lu à 81 %).
// Filtrés à l'expression exacte — un vrai échec de chargement (importScripts,
// WebAssembly, 4xx sur le CDN) reste signalé.
// La « langue vide » contient en réalité un caractère de contrôle (U+0012),
// invisible dans un terminal : le motif tolère 0 à 2 caractères entre les
// apostrophes, et rien de plus large.
const BRUIT_COMMUN = /ipapi\.co|sentry|favicon|subscriptions\/insights|Parameter not found:|Error opening data file \.\/.{0,2}\.traineddata|TESSDATA_PREFIX|Failed loading language '.{0,2}'/;
// En local, Google Sign-In refuse l'origine localhost, non enregistrée chez
// Google (« The given origin is not allowed for the given client ID ») —
// artefact du harnais, pas un défaut du site. Jamais ignoré en production.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const BRUIT = LOCAL ? new RegExp(BRUIT_COMMUN.source + "|accounts\\.google\\.com\\/gsi|GSI_LOGGER") : BRUIT_COMMUN;

let anomalies = 0;
const signaler = (ecran, chemin, problemes) => {
  const ok = problemes.length === 0;
  if (!ok) anomalies += 1;
  console.log(`${ok ? "✓" : "✗"} ${ecran.padEnd(7)} ${chemin.padEnd(28)}${ok ? "" : "\n     " + problemes.join("\n     ")}`);
};

function ecouter(page) {
  const js = [], echecs = [], http = [];
  page.on("pageerror", (e) => js.push(String(e).slice(0, 140)));
  // Le message « Failed to load resource » ne contient pas l'URL : elle est
  // dans m.location(). Filtrer sur le seul texte laissait passer le bruit.
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const texte = m.text(), url = m.location()?.url || "";
    if (BRUIT.test(texte) || BRUIT.test(url)) return;
    js.push("console: " + texte.slice(0, 140) + (url ? ` [${url.slice(0, 70)}]` : ""));
  });
  page.on("requestfailed", (r) => { if (!BRUIT.test(r.url())) echecs.push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !BRUIT.test(r.url())) http.push(`${r.status()} ${r.url().slice(0, 90)}`); });
  return { js, echecs, http, vider() { js.length = 0; echecs.length = 0; http.length = 0; } };
}

async function mesurer(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const coupes = [...document.querySelectorAll("body *")].filter((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 4 || b.right <= window.innerWidth + 2) return false;
      const s = getComputedStyle(e);
      if (["fixed", "sticky"].includes(s.position) || !(e.textContent || "").trim()) return false;
      for (let p = e.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return false;
      return true;
    }).length;
    return {
      sw: !!navigator.serviceWorker?.controller,
      poppins: [...document.fonts].filter((f) => f.family === "Poppins" && f.status === "loaded").length,
      imgKo: [...document.images].filter((i) => i.currentSrc && i.complete && i.naturalWidth === 0 && !/^data:/.test(i.currentSrc)).length,
      coupes,
      vide: (document.body.innerText || "").trim().length < 120,
      boundary: /Une erreur s'est produite/i.test(document.body.innerText || ""),
      racineVide: !document.getElementById("root")?.children.length,
    };
  });
}

function problemesDe(m, e, { exigerSw = true } = {}) {
  const p = [];
  if (m.racineVide) p.push("RACINE VIDE — la page ne s'est pas rendue (fichiers JS/CSS manquants ?)");
  if (m.boundary) p.push("ErrorBoundary déclenché");
  if (m.vide) p.push("page quasi vide");
  if (exigerSw && !m.sw) p.push("service worker non actif sur une navigation suivante");
  if (m.poppins === 0) p.push("police Poppins NON chargée");
  if (m.imgKo) p.push(`${m.imgKo} image(s) cassée(s)`);
  if (m.coupes) p.push(`${m.coupes} élément(s) avec texte coupé(s) à droite`);
  if (e.js.length) p.push("JS : " + [...new Set(e.js)].slice(0, 2).join(" ; "));
  if (e.echecs.length) p.push("requêtes en échec : " + [...new Set(e.echecs)].slice(0, 2).join(" ; "));
  if (e.http.length) p.push("HTTP ≥ 400 : " + [...new Set(e.http)].slice(0, 3).join(" ; "));
  return p;
}

const nav = await chromium.launch({ executablePath: EXE, headless: true });

for (const ecran of ECRANS) {
  const ctx = await nav.newContext({ viewport: { width: ecran.width, height: ecran.height }, isMobile: ecran.mobile, hasTouch: ecran.mobile });
  const page = await ctx.newPage();
  const e = ecouter(page);
  // Amorçage : la première navigation n'est jamais contrôlée par le worker.
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  for (const chemin of PAGES_PUBLIQUES) {
    e.vider();
    await page.goto(BASE + chemin, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((x) => e.js.push("navigation : " + x.message.slice(0, 80)));
    await page.waitForTimeout(6000);
    signaler(ecran.nom, chemin, problemesDe(await mesurer(page), e));
  }
  await ctx.close();
}

// ═══ LE VISITEUR QUI REVIENT ═══════════════════════════════════════════════
// Tout ce qui précède est vu par un visiteur neuf. Celui qui REVIENT après un
// déploiement a un service worker installé et une page déjà chargée — c'est
// lui qui a vu du HTML nu le 2026-09-12. Deux situations rejouées :
{
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.goto(BASE + "/plans", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // 1) Réseau coupé : il doit voir la page hors ligne autonome — jamais un
  //    index.html en cache dont les fichiers n'existent plus.
  await ctx.setOffline(true);
  await page.goto(BASE + "/services", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const horsLigne = await page.evaluate(() => ({
    texte: (document.body.innerText || "").slice(0, 200),
    styles: document.styleSheets.length,
    racine: !!document.getElementById("root"),
  }));
  await ctx.setOffline(false);
  const pbHL = [];
  if (!/Connexion indisponible/.test(horsLigne.texte)) pbHL.push("hors ligne : page de repli non servie — " + JSON.stringify(horsLigne.texte.slice(0, 80)));
  if (horsLigne.racine && horsLigne.styles === 0) pbHL.push("hors ligne : index.html servi SANS ses styles (HTML nu)");
  signaler("retour", "réseau coupé", pbHL);

  // 2) Fichier de l'ancienne version manquant après un déploiement : la page
  //    se recharge UNE fois, puis, si le fichier manque toujours, affiche
  //    l'écran d'erreur — sans jamais boucler.
  let chargements = 0;
  page.on("load", () => { chargements++; });
  await page.route(/\/assets\/Plans-[^/]+\.js$/, (r) => r.abort());
  await page.goto(BASE + "/plans", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(9000);
  const apres = await page.evaluate(() => ({
    boundary: /Une erreur s'est produite|Something went wrong/i.test(document.body.innerText || ""),
    drapeau: (() => { try { return !!sessionStorage.getItem("vit-auto-rechargement-apres-deploiement"); } catch { return false; } })(),
  }));
  await page.unroute(/\/assets\/Plans-[^/]+\.js$/);
  const pbDep = [];
  if (!apres.drapeau) pbDep.push("fichier manquant : aucun rechargement tenté");
  if (chargements > 3) pbDep.push(`fichier manquant : ${chargements} chargements — la page BOUCLE`);
  if (!apres.boundary && chargements >= 2) pbDep.push("fichier toujours absent après rechargement : l'écran d'erreur devrait s'afficher");
  signaler("retour", "fichier manquant après déploiement", pbDep);
  await ctx.close();
}

if (ADMIN_ID && ADMIN_PWD) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const e = ecouter(page);
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.fill("#login-identifier", ADMIN_ID); await page.fill("#login-password", ADMIN_PWD);
  await page.click("form button[type=submit]"); await page.waitForTimeout(8000);
  const connecte = await page.evaluate(() => !!localStorage.getItem("vit-auto-token"));
  if (!connecte) { signaler("connecté", "/login", ["connexion impossible avec les identifiants fournis"]); }
  else {
    for (const chemin of PAGES_CONNECTEES) {
      e.vider();
      await page.goto(BASE + chemin, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((x) => e.js.push("navigation : " + x.message.slice(0, 80)));
      await page.waitForTimeout(chemin === "/kyc" ? 12000 : 7000);
      // /kyc : le worker OCR (Tesseract) charge son script, son cœur WASM et
      // ses modèles depuis un CDN — chacun soumis à la CSP. Une erreur
      // importScripts/WebAssembly ici = soumission KYC impossible.
      signaler("connecté", chemin, problemesDe(await mesurer(page), e));
    }

    // Panneau d'administration : chaque entrée du menu, comme un vrai admin.
    e.vider();
    await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(10000);
    const nbOnglets = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => {
      const s = b.querySelectorAll(":scope > span"); return s.length >= 2 && (s[1].textContent || "").trim().length > 2; }).length);
    if (nbOnglets < 40) signaler("admin", "/admin", [`${nbOnglets} onglet(s) trouvé(s), au moins 40 attendus`]);
    for (let i = 0; i < nbOnglets; i++) {
      e.vider();
      const nom = await page.evaluate((idx) => {
        const b = [...document.querySelectorAll("button")].filter((x) => { const s = x.querySelectorAll(":scope > span"); return s.length >= 2 && (s[1].textContent || "").trim().length > 2; })[idx];
        b?.click(); return (b?.textContent || "").trim().slice(0, 28);
      }, i);
      await page.waitForTimeout(3000);
      const m = await mesurer(page);
      signaler("admin", nom, problemesDe({ ...m, coupes: 0 }, e, { exigerSw: false }));
    }

    // Déconnexion PROPRE en fin de vérification : chaque connexion ajoute un
    // appareil à la session du compte, plafonnée à cinq. Sans cela, quelques
    // pushs suffisaient à évincer la session de l'exploitant sur son propre
    // téléphone. Même appel que le bouton « Déconnexion » de l'interface.
    const deconnexion = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/auth/revoke-token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("vit-auto-token")}` },
          body: JSON.stringify({ refreshToken: localStorage.getItem("vit-auto-refresh") }),
        });
        return r.status;
      } catch { return 0; }
    });
    if (deconnexion !== 200) signaler("admin", "déconnexion de la session de vérification", [`HTTP ${deconnexion} — la session restera comptée parmi les cinq appareils`]);
  }
  await ctx.close();
} else {
  console.log("\n(pages connectées et administration non vérifiées : VERIF_ADMIN_ID / VERIF_ADMIN_PWD absents)");
}

await nav.close();
console.log(anomalies === 0 ? "\n✓ Aucune anomalie — publication possible." : `\n✗ ${anomalies} anomalie(s) — NE PAS pousser.`);
process.exit(anomalies === 0 ? 0 : 1);
