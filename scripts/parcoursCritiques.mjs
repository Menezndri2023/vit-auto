// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS CRITIQUES — scénarios bout en bout dans un vrai navigateur
// ═══════════════════════════════════════════════════════════════════════════
// Complète le balayage de verifierLocalement.mjs (qui vérifie que chaque écran
// se RENDE) par des scénarios qui vérifient que les parcours ABOUTISSENT, sur
// le paquet construit (dist/), sous la CSP de production, contre l'API locale
// semée par server/scripts/apiLocale.mjs. Branché sur le hook pre-push après
// le balayage. Un scénario = une fonction ; en ajouter un = l'ajouter à la
// liste PARCOURS.
//
//   node scripts/parcoursCritiques.mjs http://localhost:4180
//   (VERIF_ADMIN_ID / VERIF_ADMIN_PWD : identifiants de l'admin semé,
//    API_LOCALE_URL : l'API locale, défaut http://localhost:5001)
import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function trouverChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const racine = process.platform === "darwin" ? join(homedir(), "Library", "Caches", "ms-playwright") : join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(racine)) return null;
  for (const d of readdirSync(racine).filter((d) => d.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))) {
    for (const rel of [["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"], ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"], ["chrome-linux", "chrome"]]) {
      const p = join(racine, d, ...rel); if (existsSync(p)) return p;
    }
  }
  return null;
}

const BASE = (process.argv[2] || "http://localhost:4180").replace(/\/$/, "");
const API  = (process.env.API_LOCALE_URL || "http://localhost:5001").replace(/\/$/, "");
const ADMIN_ID = process.env.VERIF_ADMIN_ID, ADMIN_PWD = process.env.VERIF_ADMIN_PWD;
const EXE = trouverChromium();
if (!EXE) { console.error("Chromium introuvable (npx playwright install chromium)"); process.exit(2); }
if (!ADMIN_ID || !ADMIN_PWD) { console.error("VERIF_ADMIN_ID / VERIF_ADMIN_PWD requis (identifiants de l'admin semé)"); process.exit(2); }

const anomalies = [];
const ok = (m) => console.log(`✓ ${m}`);
const ko = (m) => { anomalies.push(m); console.log(`✗ ${m}`); };
const dateISO = (jours) => { const d = new Date(Date.now() + jours * 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

async function apiAdmin() {
  const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ identifier: ADMIN_ID, password: ADMIN_PWD }) });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`connexion admin API impossible (${r.status})`);
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com", Authorization: `Bearer ${d.token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

function surveiller(page, nom, journal) {
  page.on("pageerror", (e) => journal.push(`[${nom}] pageerror: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !/auth\/me|auth\/refresh|\/api\/geo\/|business-config\/pricing/.test(r.url())) journal.push(`[${nom}] HTTP ${r.status()} ${r.url()}`); });
}

async function connecter(page, id, pwd) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#login-identifier", id); await page.fill("#login-password", pwd);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => !!localStorage.getItem("vit-auto-token"), null, { timeout: 30000 });
}

// ── Parcours 1 : vente par demande d'essai (docs/vente-demande-essai.md) ──
async function demandeEssai(browser) {
  const journal = [];
  const admin = await apiAdmin();
  // Un véhicule en vente semé (prix ≥ 15 000 USD → niveau 2 : passe par la qualification admin).
  const cat = await admin("/api/vehicles?limit=100");
  const vehicule = (cat.data.vehicles || []).find((v) => v.type === "vente" && v.status === "approved");
  if (!vehicule) throw new Error("aucun véhicule en vente semé");

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pc = await ctx.newPage(); surveiller(pc, "client", journal);
  await pc.goto(`${BASE}/vehicle/${vehicule._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pc.getByRole("button", { name: /Demander un essai|Request a test drive/i }).click({ timeout: 60000 });
  await pc.fill("input[autocomplete=given-name]", "Parcours");
  await pc.fill("input[autocomplete=tel]", `+212600${String(Date.now()).slice(-6)}`);
  await pc.fill("input[autocomplete=address-level2]", "Casablanca");
  await pc.fill("input[type=date]", dateISO(3));
  await pc.getByRole("radio", { name: "Matin" }).click();
  await pc.getByText(/J'accepte d'être contacté/).click();
  await pc.getByRole("button", { name: /Envoyer ma demande d'essai/ }).click();
  await pc.getByText(/Demande d'essai envoyée/).first().waitFor({ timeout: 30000 });
  const ref = (await pc.locator("strong").filter({ hasText: /VA-LEAD-/ }).first().textContent()).trim();
  ok(`demande d'essai créée (${ref})`);
  await pc.getByRole("link", { name: /Suivre ma demande/ }).click();
  await pc.getByText(/Qualification en cours|Transmise au vendeur/).first().waitFor({ timeout: 30000 });

  // Admin : qualifie et transmet depuis l'onglet Leads vente.
  const lead = (await admin(`/api/sales-leads/admin?search=${ref}`)).data.leads?.[0];
  if (!lead) throw new Error("lead absent de la liste admin");
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pa = await ctxA.newPage(); surveiller(pa, "admin", journal);
  await connecter(pa, ADMIN_ID, ADMIN_PWD);
  await pa.goto(`${BASE}/admin?tab=sales_leads&lead=${lead._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (lead.status === "QUALIFYING") {
    await pa.getByRole("button", { name: /Valider et transmettre/ }).click({ timeout: 60000 });
    await pa.locator("aside").filter({ hasText: "VA-LEAD-" }).getByText("Transmise au vendeur").first().waitFor({ timeout: 30000 });
    ok("admin : lead qualifié et transmis depuis le site");
  }

  // Vendeur (via API, l'admin peut agir sur le lead) : autre créneau → client accepte sur le site.
  let r = await admin(`/api/sales-leads/${lead._id}/propose-alternative`, { method: "POST", body: { date: dateISO(4), time: "15:00" } });
  if (r.status !== 200) throw new Error(`propose-alternative ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  await pc.reload({ waitUntil: "domcontentloaded" });
  await pc.getByText(/Le vendeur vous propose un nouveau créneau/).first().waitFor({ timeout: 30000 });
  await pc.getByRole("button", { name: "Accepter" }).click();
  await pc.getByText(/Essai confirmé/).first().waitFor({ timeout: 30000 });
  ok("client : autre créneau accepté → essai confirmé");

  r = await admin(`/api/sales-leads/${lead._id}/outcome`, { method: "POST", body: { testDrive: "completed", commercial: "interested" } });
  if (r.status !== 200) throw new Error(`outcome ${r.status}`);
  r = await admin(`/api/sales-leads/${lead._id}/declare-sale`, { method: "POST", body: { finalPrice: 18000, currency: "USD" } });
  const com = r.data.lead?.commission;
  // Grille : 5 % standard, 3 % fondateur — la commission doit être exactement prix × taux.
  if (r.status !== 200 || !com?.rate || Math.abs(com.amountUSD - 18000 * com.rate) > 0.01) throw new Error(`declare-sale ${r.status} commission=${JSON.stringify(com)}`);
  ok(`vendeur : essai réalisé, vente déclarée 18 000 USD → commission ${com.amountUSD} USD (${com.rate * 100} %)`);

  await pa.goto(`${BASE}/admin?tab=sales_leads&lead=${lead._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pa.getByRole("button", { name: /Confirmer la vente/ }).click({ timeout: 60000 });
  await pa.locator("aside").filter({ hasText: "VA-LEAD-" }).getByText("Vente conclue").first().waitFor({ timeout: 30000 });
  ok("admin : vente confirmée depuis le site");
  await pc.reload({ waitUntil: "domcontentloaded" });
  await pc.getByText("Vente conclue").first().waitFor({ timeout: 30000 });
  ok("client : statut final « Vente conclue »");
  await ctx.close(); await ctxA.close();
  for (const j of journal) ko(`demande d'essai — ${j}`);
}

const PARCOURS = [["Vente par demande d'essai", demandeEssai]];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const [nom, fn] of PARCOURS) {
  console.log(`── ${nom} ──`);
  try { await fn(browser); } catch (err) { ko(`${nom} : ${err.message}`); }
}
await browser.close();
console.log(anomalies.length ? `\n✗ ${anomalies.length} anomalie(s) dans les parcours critiques — NE PAS pousser.` : "\n✓ Parcours critiques aboutis.");
process.exit(anomalies.length ? 1 : 0);
