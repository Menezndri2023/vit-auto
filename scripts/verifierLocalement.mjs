// ═══════════════════════════════════════════════════════════════════════════
// VÉRIFICATION LOCALE AVANT PUBLICATION
// ═══════════════════════════════════════════════════════════════════════════
// Exerce le paquet CONSTRUIT (dist/) dans un vrai navigateur, sur plusieurs
// écrans, avant qu'il n'atteigne la production. Ce que les suites de tests ne
// voient pas : le service worker, la politique de sécurité, le rendu réel, les
// images cassées, le défilement horizontal.
//
//   npm run build && npm run preview          (dans un terminal)
//   npm run verify:local                      (dans un autre)
//
// Sort en code 1 si une page présente une anomalie : utilisable tel quel comme
// garde avant publication.
import { chromium } from "playwright-core";
// Chromium de Playwright, cherché dans son cache plutôt que codé en dur : la
// version change à chaque mise à jour, et un chemin figé ferait échouer le
// contrôle chez quelqu'un d'autre — ou ici, au prochain `playwright install`.
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
const BASE = process.argv[2] || "http://localhost:4173";

const PAGES = ["/", "/catalogue", "/catalogue?mode=Autres", "/plans", "/login", "/register", "/pourquoi", "/partenaires"];
const ECRANS = [
  { nom: "mobile",  width: 390, height: 844,  mobile: true },
  { nom: "tablette", width: 768, height: 1024, mobile: true },
  { nom: "bureau",  width: 1280, height: 900, mobile: false },
];
const GRAVE = /before initialization|is not a function|Cannot read propert|is not defined|Rendered (more|fewer) hooks|Maximum update depth|Minified React error/i;

const nav = await chromium.launch({ executablePath: EXE, headless: true });
let anomalies = 0;

for (const e of ECRANS) {
  const ctx = await nav.newContext({
    viewport: { width: e.width, height: e.height },
    isMobile: e.mobile, hasTouch: e.mobile,
  });
  for (const chemin of PAGES) {
    const page = await ctx.newPage();
    const js = [], imgKo = [];
    page.on("pageerror", (x) => { if (GRAVE.test(x.message)) js.push(x.message.slice(0, 110)); });
    page.on("response", (r) => { if (r.request().resourceType() === "image" && !r.ok()) imgKo.push(r.status()); });

    // `domcontentloaded` et non `networkidle` : le websocket Socket.io reste
    // ouvert par conception, `networkidle` n'arrive jamais sur certaines pages.
    await page.goto(BASE + chemin, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(6000);

    const m = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("img")];
      const html = document.documentElement;
      return {
        imgKo: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
        imgOk: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        debordement: Math.max(0, html.scrollWidth - html.clientWidth),
        vide: document.body.innerText.trim().length < 120,
      };
    });

    const souci = m.imgKo > 0 || m.debordement > 2 || m.vide || js.length > 0;
    if (souci) anomalies += 1;
    console.log(
      `${souci ? "✗" : "✓"} ${e.nom.padEnd(9)} ${chemin.padEnd(26)}`
      + ` images ${m.imgOk} ok / ${m.imgKo} cassées`
      + ` | débordement ${m.debordement}px`
      + (m.vide ? " | PAGE VIDE" : "")
      + (js.length ? ` | JS: ${js[0]}` : "")
    );
    await page.close();
  }
  await ctx.close();
}
await nav.close();
console.log(anomalies === 0 ? "\n✓ Aucune anomalie — publication possible." : `\n✗ ${anomalies} page(s) en anomalie — NE PAS pousser.`);
process.exit(anomalies === 0 ? 0 : 1);
