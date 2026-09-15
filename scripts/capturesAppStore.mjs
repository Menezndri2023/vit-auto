import { chromium } from "playwright-core";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const racine = join(homedir(), "Library", "Caches", "ms-playwright");
const d = readdirSync(racine).filter((x) => x.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))[0];
const EXE = ["chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"].map((r) => join(racine, d, r)).find(existsSync);

const SITE = "https://vit-auto.com";
const API = "https://vit-auto-api.onrender.com";
const creds = readFileSync(join(homedir(), "Desktop", "COMPTE-REVIEW-APPLE.txt"), "utf8");
const email = creds.match(/User name : (.*)/)[1].trim();
const password = creds.match(/Password  : (.*)/)[1].trim();
const OUT = join(homedir(), "Desktop", "Captures-App-Store");

// Apple : iPhone 6,7" = 1290×2796 (430×932 @3x) ; iPad 13" = 2064×2752 (1032×1376 @2x)
const APPAREILS = {
  iphone: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VIT-AUTO-iOS" },
  ipad:   { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VIT-AUTO-iOS" },
};

const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: email, password }) });
const session = await r.json();
if (!session.token && !session.accessToken) throw new Error("login échoué : " + JSON.stringify(session).slice(0, 200));

const PAGES = [
  ["01-accueil",        "/",                                  false],
  ["02-catalogue",      "/catalogue",                         false],
  ["03-vehicule",       "/vehicle/6aa3368ab3217dff3efce4f6",  false],
  ["04-import-export",  "/import-export",                     false],
  ["05-reservation",    "/booking/6aa3368ab3217dff3efce4f6",  true],
  ["06-espace-client",  "/dashboard",                         true],
  ["07-verification",   "/kyc",                               true],
];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const [nom, cfg] of Object.entries(APPAREILS)) {
  const ctx = await browser.newContext({ ...cfg, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  // Pas de splash/service worker : on capture le site rendu, comme l'app.
  await ctx.addInitScript(() => { try { localStorage.setItem("vit-auto-splash-seen", "1"); localStorage.setItem("vit-auto-guide-client", "1"); } catch {} });
  const page = await ctx.newPage();
  for (const [fichier, chemin, connecte] of PAGES) {
    if (connecte) {
      await page.goto(SITE + "/", { waitUntil: "domcontentloaded" });
      await page.evaluate((s) => {
        localStorage.setItem("vit-auto-token", s.token || s.accessToken);
        if (s.refreshToken) localStorage.setItem("vit-auto-refresh", s.refreshToken);
        if (s.user) localStorage.setItem("vit-auto-user", JSON.stringify(s.user));
      }, session);
    }
    await page.goto(SITE + chemin, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(chemin === "/catalogue" ? 8000 : 2500);
    // Ferme les bandeaux (cookies, guide) s'ils existent
    for (const t of ["Accepter", "J'ai compris", "Fermer", "Compris"]) {
      const b = page.getByRole("button", { name: t }).first();
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(400); }
    }
    const out = join(OUT, nom, `${fichier}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(nom, fichier, "→", page.url().replace(SITE, ""));
  }
  await ctx.close();
}
await browser.close();
