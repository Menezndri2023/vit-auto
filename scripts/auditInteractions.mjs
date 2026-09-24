// ── Audit d'interaction — « ce bouton a du mal à s'ouvrir » ────────────────
//
// auditAffichage.mjs mesure la TAILLE des cibles tactiles. Un bouton peut être
// assez grand et rester inatteignable : un bandeau collant le recouvre, un
// dégradé décoratif s'est posé par-dessus, une animation d'entrée laisse un
// calque invisible en travers, ou un élément fixe passe devant après le
// défilement. Le bouton est visible, il fait 44 px, et pourtant le doigt
// n'atteint rien — d'où « il a du mal à s'ouvrir ».
//
// Cet audit ne mesure pas : il VÉRIFIE. Pour chaque élément interactif visible,
// il demande au navigateur qui se trouve réellement au point que l'on touche
// (`elementFromPoint`). Si ce n'est ni le bouton, ni un de ses descendants, ni
// un de ses parents, le clic part ailleurs — et l'audit nomme le coupable.
//
//   node scripts/auditInteractions.mjs [http://localhost:4180] [--json rapport.json]
//
// Lecture seule. Sort en code 1 s'il y a des anomalies.
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

// Le téléphone d'abord : c'est là que les recouvrements se produisent, faute
// de place. Le bureau sert de témoin — une anomalie présente sur les deux vient
// de la mise en page, pas du manque de place.
const ECRANS = [
  { nom: "iphone", width: 430, height: 932, scale: 3, mobile: true },
  { nom: "bureau", width: 1440, height: 900, scale: 1, mobile: false },
];

const PUBLIQUES = ["/", "/catalogue", "/catalogue?mode=Acheter", "/catalogue?mode=Autres",
  "/plans", "/services", "/login", "/register", "/import-export", "/faq"];
const CLIENT = ["/dashboard", "/profile", "/favorites", "/loyalty", "/cart"];
const PARTENAIRE = ["/vendor/dashboard", "/vendor/dashboard?tab=annonces", "/vendor/publish"];

const SELECTEUR = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

async function connecter(page, compte) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  try {
    // Mêmes identifiants de champs que parcoursServices.mjs — les sélecteurs
    // génériques ne correspondent à rien sur ce formulaire.
    await page.evaluate(() => { try { sessionStorage.setItem("vit_splash_shown", "1"); } catch { /* ignore */ } });
    await page.fill("#login-identifier", compte.id);
    await page.fill("#login-password", compte.pwd);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => !!localStorage.getItem("vit-auto-token"), null, { timeout: 30000 });
    // Le guide de bienvenue recouvre les boutons : le marquer comme vu.
    await page.evaluate(() => { try { const u = JSON.parse(localStorage.getItem("vit-auto-user") || "{}"); if (u.id) localStorage.setItem(`vit-welcome-guide-seen-${u.id}`, "1"); } catch { /* ignore */ } });
    return true;
  } catch { return false; }
}

/**
 * Relève les éléments interactifs que le doigt n'atteint pas.
 * Tout se passe DANS la page : un aller-retour par élément serait interminable.
 */
async function releverInatteignables(page) {
  return page.evaluate((selecteur) => {
    const anomalies = [];
    const nom = (el) => {
      const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}${t ? ` « ${t} »` : ""}`;
    };

    for (const el of document.querySelectorAll(selecteur)) {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
      // Rangé, pas inaccessible : un lien dans un accordéon FERMÉ (le pied de
      // page en a deux) n'a pas à être cliquable — l'utilisateur ouvre d'abord.
      // `getComputedStyle` ne le dit pas : <details> masque son contenu sans
      // poser display:none sur les enfants. Première version de cet audit :
      // 18 faux positifs par page, tous des liens de pied de page repliés.
      if (el.closest("details:not([open])")) continue;
      if (typeof el.checkVisibility === "function"
          && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Hors de la fenêtre : ce n'est pas un recouvrement, l'utilisateur fait
      // défiler pour l'atteindre.
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      // Un élément qui tombe sous la barre fixe du bas À CETTE position de
      // défilement n'est pas inatteignable : il suffit de faire défiler. On le
      // ramène donc au MILIEU de la fenêtre avant de juger — sinon l'audit
      // signale tout ce qui passe derrière la barre, ce qui est normal et
      // constant. Seul ce qui reste recouvert au centre est un vrai défaut.
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });

      // Un élément interactif neutralisé ne réagira jamais au doigt.
      if (st.pointerEvents === "none" && !el.disabled) {
        anomalies.push({ type: "neutralisé", cible: nom(el), detail: "pointer-events: none sur un élément interactif" });
        continue;
      }

      // Le point réellement touché : le centre, borné à la fenêtre pour les
      // éléments qui dépassent.
      const r2 = el.getBoundingClientRect();
      const x = Math.min(Math.max(r2.left + r2.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(r2.top + r2.height / 2, 1), innerHeight - 1);
      const touche = document.elementFromPoint(x, y);
      if (!touche) continue;
      // Le clic aboutit si l'on touche l'élément, un de ses descendants (une
      // icône dans un bouton) ou un de ses parents (un lien qui enveloppe).
      if (touche === el || el.contains(touche) || touche.contains(el)) continue;

      anomalies.push({
        type: "recouvert",
        cible: nom(el),
        detail: `recouvert par ${nom(touche)}`,
        coupable: nom(touche),
      });
    }
    return anomalies;
  }, SELECTEUR);
}

const navigateur = await chromium.launch({ executablePath: EXE, headless: true });
let total = 0;
const rapport = [];

try {
  for (const ecran of ECRANS) {
    const ctx = await navigateur.newContext({
      viewport: { width: ecran.width, height: ecran.height },
      deviceScaleFactor: ecran.scale,
      isMobile: ecran.mobile,
      hasTouch: ecran.mobile,
    });
    const page = await ctx.newPage();
    console.log(`\n══ ${ecran.nom} (${ecran.width}×${ecran.height}) ══`);

    for (const [role, chemins] of [[null, PUBLIQUES], ["client", CLIENT], ["partenaire", PARTENAIRE]]) {
      const compte = role ? COMPTES[role] : null;
      if (compte) {
        if (!compte.pwd) { console.log(`  (${role} : VERIF_SEME_PWD absent, lot ignoré)`); continue; }
        if (!(await connecter(page, compte))) { console.log(`  ✗ connexion ${role} impossible`); total++; continue; }
      }

      for (const chemin of chemins) {
        try {
          await page.goto(BASE + chemin, { waitUntil: "networkidle", timeout: 60000 });
        } catch { continue; }
        // Les animations d'entrée durent jusqu'à 2,8 s dans ce projet : mesurer
        // avant leur fin signalerait des recouvrements qui se dissipent seuls.
        await page.waitForTimeout(3000);

        const anomalies = await releverInatteignables(page);
        if (!anomalies.length) { console.log(`  ✓ ${chemin}`); continue; }
        total += anomalies.length;
        console.log(`  ✗ ${chemin} — ${anomalies.length} élément(s) inatteignable(s)`);
        for (const a of anomalies.slice(0, 6)) console.log(`      ${a.cible} → ${a.detail}`);
        rapport.push({ ecran: ecran.nom, chemin, anomalies });
      }
    }
    await ctx.close();
  }
} finally {
  await navigateur.close();
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rapport, null, 2));
console.log(total ? `\n✗ ${total} élément(s) interactif(s) inatteignable(s)` : "\n✓ Tous les éléments interactifs sont atteignables.");
process.exit(total ? 1 : 0);
