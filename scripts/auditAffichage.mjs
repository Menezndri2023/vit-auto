// ── Audit d'affichage — au-delà de la garde ────────────────────────────────
//
// verifierLocalement.mjs (garde avant push) attrape les plantages, les images
// cassées, les débordements et la police. Cet audit cherche ce qui ne plante
// pas mais gêne l'utilisateur d'une app mobile :
//   - défilement horizontal de la page ;
//   - cibles tactiles < 44 px (liens, boutons, champs) sur écran tactile ;
//   - textes coupés (overflow hidden sans ellipse, ou ellipse sur un titre) ;
//   - contenu cliquable caché sous la barre du bas fixe ;
//   - texte < 11 px sur mobile (minimum des règles Apple) ;
//   - éléments fixes qui se chevauchent (bandeaux, boutons flottants, barre).
// Trois formats de plus que la garde : iPhone SE, iPhone 6,7", iPad portrait.
//
//   node scripts/auditAffichage.mjs [http://localhost:4180] [--json rapport.json]
// Lecture seule : ne modifie rien, sort en code 1 s'il y a des anomalies.
import { chromium } from "playwright-core";
import { readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const racine = join(homedir(), "Library", "Caches", "ms-playwright");
const dossier = readdirSync(racine).filter((x) => x.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))[0];
const EXE = process.env.CHROMIUM_PATH || ["chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"].map((r) => join(racine, dossier, r)).find(existsSync);

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:4180";
const idxJson = process.argv.indexOf("--json");
const JSON_OUT = idxJson !== -1 ? process.argv[idxJson + 1] : null;
const API = process.env.API_LOCALE_URL || "http://localhost:5001";
const COMPTES = {
  client:     { id: process.env.VERIF_CLIENT_ID  || "client@vitauto-fixtures.fr",      pwd: process.env.VERIF_SEME_PWD },
  partenaire: { id: process.env.VERIF_PARTNER_ID || "partenaire1@vitauto-fixtures.fr", pwd: process.env.VERIF_SEME_PWD },
};

const ECRANS = [
  { nom: "se",     width: 375,  height: 667,  scale: 2, mobile: true },
  { nom: "iphone", width: 430,  height: 932,  scale: 3, mobile: true },
  { nom: "ipad",   width: 1024, height: 1366, scale: 2, mobile: true },
  { nom: "bureau", width: 1440, height: 900,  scale: 1, mobile: false },
];

const PUBLIQUES = ["/", "/catalogue", "/catalogue?mode=Acheter", "/catalogue?mode=Autres", "/catalogue?mode=Pieces", "/plans", "/services",
  "/login", "/register", "/pourquoi", "/partenaires", "/faq", "/import-export", "/import-export/listings", "/cgu", "/privacy", "/help"];
const CLIENT = ["/dashboard", "/profile", "/favorites", "/loyalty", "/kyc", "/cart"];
const PARTENAIRE = ["/vendor/dashboard", "/vendor/dashboard?tab=annonces", "/vendor/dashboard?tab=calendrier", "/vendor/pro", "/vendor/publish", "/vendor/submit-activity", "/vendor/submit-part", "/partner-pms", "/partner-onboarding"];

// Pages dynamiques : premières annonces semées par apiLocale.mjs.
async function pagesDynamiques() {
  const pages = [];
  try {
    const v = await (await fetch(`${API}/api/vehicles?limit=1`)).json();
    const id = v.vehicles?.[0]?._id; if (id) { pages.push(`/vehicle/${id}`); pages.push({ chemin: `/booking/${id}`, compte: "client" }); }
  } catch {}
  try {
    const a = await (await fetch(`${API}/api/activities?limit=1`)).json();
    const id = (a.activities || a.data || [])[0]?._id; if (id) pages.push(`/activity/${id}`);
  } catch {}
  try {
    const p = await (await fetch(`${API}/api/parts?limit=1`)).json();
    const id = (p.parts || p.items || p.data || [])[0]?._id; if (id) pages.push(`/pieces/${id}`);
  } catch {}
  return pages;
}

const ETIQUETTE = (e) => `<${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : ""}> « ${(e.innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40)} »`;

async function mesurer(page, ecran) {
  return page.evaluate(({ mobile, ETIQ }) => {
    const etiq = new Function("e", `return (${ETIQ})(e)`);
    const visible = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight; };
    const out = { scrollX: 0, cibles: [], coupes: [], caches: [], petits: [], chevauchements: [] };
    const doc = document.scrollingElement || document.documentElement;
    out.scrollX = Math.max(0, doc.scrollWidth - innerWidth);

    const interactifs = [...document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea')].filter(visible);
    if (mobile) {
      for (const e of interactifs) {
        const b = e.getBoundingClientRect();
        // Une cible inline dans un paragraphe (lien dans du texte) est tolérée
        // si elle fait au moins 30 px de haut : Apple tolère les liens en ligne.
        // Lien dans du texte courant (paragraphe, liste…) : exempté, comme le
        // font les règles Apple et WCAG. Lien autonome : hauteur ≥ 44, largeur
        // libre (un mot court reste tapable). Bouton ou champ : 44 × 44.
        const enTexte = e.tagName === "A" && getComputedStyle(e).display === "inline" && e.closest("p, li, td, small, label, dd");
        if (enTexte) continue;
        // Puces du carrousel : la zone tactile de 44 px est portée par un
        // pseudo-élément ::after (HeroSection.module.css), invisible dans la
        // boîte mesurée ici. Bouton Google Sign-In : rendu par Google (40 px
        // maximum), hors de notre contrôle.
        if (/spotDot/.test(e.className) || e.closest(".nsm7Bb-HzV7m-LgbsSe")) continue;
        const lien = e.tagName === "A";
        if (b.height < 43.5 || (!lien && b.width < 43.5)) out.cibles.push(`${Math.round(b.width)}×${Math.round(b.height)} ${etiq(e)}`);
      }
      for (const e of [...document.querySelectorAll("body *")].filter(visible)) {
        const s = getComputedStyle(e);
        const fs = parseFloat(s.fontSize);
        if (fs && fs < 11 && !e.closest('nav[class*="_bar_"]') && (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3))) out.petits.push(`${fs.toFixed(1)}px ${etiq(e)}`);
      }
    }
    // Textes coupés : boîte à overflow hidden dont le contenu dépasse sans ellipse, ou titres en ellipse.
    for (const e of [...document.querySelectorAll("body *")].filter(visible)) {
      const s = getComputedStyle(e);
      if (!/hidden|clip/.test(s.overflowX) && !/hidden|clip/.test(s.overflowY)) continue;
      const texte = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!texte) continue;
      const dx = e.scrollWidth - e.clientWidth, dy = e.scrollHeight - e.clientHeight;
      if (dx > 2 && s.textOverflow !== "ellipsis" && s.whiteSpace === "nowrap") out.coupes.push(`horizontal +${dx}px ${etiq(e)}`);
      if (dy > 4 && !s.webkitLineClamp && s.webkitLineClamp !== "none" ? false : false) {}
      if (dy > 4 && (s.webkitLineClamp === "none" || !s.webkitLineClamp) && s.display !== "-webkit-box") out.coupes.push(`vertical +${dy}px ${etiq(e)}`);
      if (/^H[1-3]$/.test(e.tagName) && s.textOverflow === "ellipsis" && dx > 2) out.coupes.push(`titre en ellipse ${etiq(e)}`);
    }
    // Fixes en bas : contenu cliquable caché dessous, une fois en bas de page.
    const fixes = [...document.querySelectorAll("body *")].filter((e) => { const s = getComputedStyle(e); return (s.position === "fixed" || s.position === "sticky") && visible(e); });
    const basFixes = fixes.filter((e) => { const b = e.getBoundingClientRect(); return b.bottom >= innerHeight - 2 && b.height < innerHeight * 0.5; });
    const hautBarre = basFixes.length ? Math.min(...basFixes.map((e) => e.getBoundingClientRect().top)) : innerHeight;
    if (basFixes.length) {
      // `scroll-behavior: smooth` rend scrollTo asynchrone : mesurer juste après
      // lirait la page en haut. Défilement instantané, puis on relit les positions.
      window.scrollTo({ top: doc.scrollHeight, behavior: "instant" });
      const interactifsBas = [...document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea')].filter(visible);
      for (const e of interactifsBas) {
        if (fixes.some((f) => f === e || f.contains(e))) continue;
        const b = e.getBoundingClientRect();
        if (b.top < innerHeight && b.bottom > hautBarre + 1 && b.top < hautBarre) {
          const pt = document.elementFromPoint(Math.min(innerWidth - 1, b.left + b.width / 2), Math.min(innerHeight - 1, b.bottom - 2));
          if (pt && !e.contains(pt) && !pt.contains(e)) out.caches.push(`${etiq(e)} sous ${etiq(pt)}`);
        }
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    // Chevauchement entre éléments fixes distincts.
    for (let i = 0; i < fixes.length; i++) for (let j = i + 1; j < fixes.length; j++) {
      const a = fixes[i], b = fixes[j]; if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const inter = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)) * Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      if (inter > 400) out.chevauchements.push(`${etiq(a)} × ${etiq(b)} (${Math.round(inter)} px²)`);
    }
    return out;
  }, { mobile: ecran.mobile, ETIQ: ETIQUETTE.toString() });
}

async function connecter(page, compte) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.fill("#login-identifier", compte.id); await page.fill("#login-password", compte.pwd);
  await page.click("button[type=submit]"); await page.waitForTimeout(2500);
  return page.evaluate(() => !!localStorage.getItem("vit-auto-token"));
}

const rapport = []; let anomalies = 0;
const dyn = await pagesDynamiques();
const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const ecran of ECRANS) {
  const ctx = await browser.newContext({ viewport: { width: ecran.width, height: ecran.height }, deviceScaleFactor: ecran.scale, isMobile: ecran.mobile, hasTouch: ecran.mobile, locale: "fr-FR" });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("vit_splash_shown", "1"); for (const r of ["client", "partenaire", "admin"]) localStorage.setItem(`vit-auto-guide-${r}`, "1"); } catch {} });
  const page = await ctx.newPage();
  const lots = [
    ["public", null, [...PUBLIQUES, ...dyn.filter((p) => typeof p === "string")]],
    ["client", COMPTES.client, [...CLIENT, ...dyn.filter((p) => p.compte === "client").map((p) => p.chemin)]],
    ["partenaire", COMPTES.partenaire, PARTENAIRE],
  ];
  for (const [role, compte, chemins] of lots) {
    if (compte) { if (!compte.pwd) { console.log(`  (${role} : VERIF_SEME_PWD absent, lot ignoré)`); continue; } const ok = await connecter(page, compte); if (!ok) { console.log(`✗ ${ecran.nom} connexion ${role} impossible`); anomalies++; continue; } }
    for (const chemin of chemins) {
      await page.goto(BASE + chemin, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
      for (const t of ["Accepter", "J'ai compris", "Compris", "Fermer le guide"]) { const b = page.getByRole("button", { name: t }).first(); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); } }
      const m = await mesurer(page, ecran).catch((e) => ({ erreur: String(e).slice(0, 120) }));
      const pbs = [];
      if (m.erreur) pbs.push("mesure impossible : " + m.erreur);
      if (m.scrollX > 2) pbs.push(`défilement horizontal de ${m.scrollX}px`);
      for (const c of (m.cibles || []).slice(0, 8)) pbs.push("cible < 44px : " + c);
      if ((m.cibles || []).length > 8) pbs.push(`… ${m.cibles.length - 8} autres cibles < 44px`);
      for (const c of (m.coupes || []).slice(0, 5)) pbs.push("texte coupé : " + c);
      for (const c of (m.caches || []).slice(0, 5)) pbs.push("caché sous un élément fixe : " + c);
      for (const c of (m.petits || []).slice(0, 5)) pbs.push("texte < 11px : " + c);
      if ((m.petits || []).length > 5) pbs.push(`… ${m.petits.length - 5} autres textes < 11px`);
      for (const c of (m.chevauchements || []).slice(0, 3)) pbs.push("fixes qui se chevauchent : " + c);
      if (pbs.length) anomalies++;
      rapport.push({ ecran: ecran.nom, role, chemin, problemes: pbs, brut: m });
      console.log(`${pbs.length ? "✗" : "✓"} ${ecran.nom.padEnd(6)} ${role.padEnd(10)} ${chemin.padEnd(34)}${pbs.length ? "\n     " + pbs.join("\n     ") : ""}`);
    }
  }
  await ctx.close();
}
await browser.close();
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rapport, null, 2));
console.log(`\n${anomalies ? "✗ " + anomalies + " page(s)/écran(s) avec anomalies" : "✓ aucune anomalie d'affichage"}`);
process.exit(anomalies ? 1 : 0);
