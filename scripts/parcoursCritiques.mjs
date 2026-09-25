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

// Clic robuste : attend la fin des animations d'entrée finies de la page
// (rise/slideIn — un clic pendant l'animation échoue « not stable ») avec un
// plafond de 3 s, puis clique. Deux refus de la garde le 2026-09-17 sur ce
// seul motif, sans défaut de code (rejoués verts en local).
async function clicStable(locator, options = {}) {
  await locator.waitFor({ timeout: options.timeout || 30000 });
  await locator.page().evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => { const t = a.effect?.getTiming?.(); return t && t.iterations !== Infinity; }).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 3000)),
  ]));
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: options.timeout || 30000 });
}

async function apiAdmin() {
  const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ identifier: ADMIN_ID, password: ADMIN_PWD }) });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`connexion admin API impossible (${r.status})`);
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com", Authorization: `Bearer ${d.token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

// Une erreur levée DANS un cadre Google (bouton « Continuer avec Google »,
// accounts.google.com/gsi/…) n'est pas la nôtre et arrive par intermittence
// (« gis is not defined », 2026-09-16) : elle ne doit pas bloquer un push.
const erreurTierce = (e) => /accounts\.google\.com|gsi\/|apis\.google\.com/.test(String(e?.stack || "")) || /^gis is not defined/.test(String(e?.message || e || ""));
function surveiller(page, nom, journal) {
  page.on("pageerror", (e) => { if (!erreurTierce(e)) journal.push(`[${nom}] pageerror: ${e.message.slice(0, 160)}`); });
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
  // Tout service exige un compte (règle de l'exploitant, 2026-09-14) : le
  // client se connecte d'abord — un visiteur est renvoyé vers la connexion.
  const PWD = process.env.VERIF_SEME_PWD, CLIENT = process.env.VERIF_CLIENT_ID;
  if (!PWD || !CLIENT) throw new Error("VERIF_CLIENT_ID / VERIF_SEME_PWD requis");
  await pc.goto(`${BASE}/vehicle/${vehicule._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pc.getByRole("button", { name: /Demander un essai|Request a test drive/i }).click({ timeout: 60000 });
  await pc.getByRole("link", { name: /Se connecter/ }).first().waitFor({ timeout: 30000 });
  ok("visiteur : la demande d'essai renvoie vers la connexion");
  await connecter(pc, CLIENT, PWD);
  await pc.goto(`${BASE}/vehicle/${vehicule._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pc.getByRole("button", { name: /Demander un essai|Request a test drive/i }).click({ timeout: 60000 });
  // Saisie puis VÉRIFICATION de chaque valeur : sous charge (build ou tests
  // en parallèle), une frappe peut être perdue et le bouton reste désactivé
  // sans qu'on sache quel champ manque — on relit le formulaire avant d'envoyer.
  const telephone = `+212600${String(Date.now()).slice(-6)}`;
  const saisir = async (selector, valeur) => {
    for (let essai = 0; essai < 3; essai++) {
      await pc.fill(selector, valeur);
      if ((await pc.inputValue(selector)) === valeur) return;
    }
    throw new Error(`saisie perdue : ${selector}`);
  };
  await saisir("input[autocomplete=given-name]", "Parcours");
  await saisir("input[autocomplete=tel]", telephone);
  await saisir("input[autocomplete=address-level2]", "Casablanca");
  await saisir("input[type=date]", dateISO(3));
  await pc.getByRole("radio", { name: "Matin" }).click();
  await pc.getByRole("checkbox").last().check(); // consentement (le premier est « même numéro WhatsApp »)
  const envoyer = pc.getByRole("button", { name: /Envoyer ma demande d'essai/ });
  try {
    await envoyer.waitFor({ state: "visible", timeout: 10000 });
    await pc.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => /Envoyer ma demande/.test(x.textContent)); return b && !b.disabled; }, null, { timeout: 15000 });
  } catch {
    const etat = await pc.evaluate(() => ({
      prenom: document.querySelector("input[autocomplete=given-name]")?.value, tel: document.querySelector("input[autocomplete=tel]")?.value,
      date: document.querySelector("input[type=date]")?.value, creneau: document.querySelector("[role=radio][aria-checked=true]")?.textContent,
      consentement: [...document.querySelectorAll("input[type=checkbox]")].map((c) => c.checked),
    }));
    throw new Error(`bouton d'envoi toujours désactivé — état du formulaire : ${JSON.stringify(etat)}`);
  }
  await clicStable(envoyer);
  await pc.getByText(/Demande d'essai envoyée/).first().waitFor({ timeout: 30000 });
  const ref = (await pc.locator("strong").filter({ hasText: /VA-LEAD-/ }).first().textContent()).trim();
  ok(`demande d'essai créée (${ref})`);
  await clicStable(pc.getByRole("link", { name: /Suivre ma demande/ }));
  await pc.getByText(/Qualification en cours|Transmise au vendeur/).first().waitFor({ timeout: 30000 });

  // Admin : qualifie et transmet depuis l'onglet Leads vente.
  const lead = (await admin(`/api/sales-leads/admin?search=${ref}`)).data.leads?.[0];
  if (!lead) throw new Error("lead absent de la liste admin");
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pa = await ctxA.newPage(); surveiller(pa, "admin", journal);
  await connecter(pa, ADMIN_ID, ADMIN_PWD);
  await pa.goto(`${BASE}/admin?tab=sales_leads&lead=${lead._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Transmission directe (2026-09-14) : le lead est déjà chez le vendeur,
  // quel que soit son niveau — l'admin le voit transmis, sans rien à valider.
  if (lead.status !== "SENT_TO_PARTNER") throw new Error(`lead non transmis directement au vendeur (statut ${lead.status})`);
  await pa.locator("aside").filter({ hasText: "VA-LEAD-" }).getByText("Transmise au vendeur").first().waitFor({ timeout: 30000 });
  ok("admin : lead déjà transmis au vendeur (transmission directe), visible dans l'onglet Leads vente");

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

// ── Parcours 2 : chauffeur — mission à la journée puis embauche CDD ────────
// Client (UI) → réservation d'une mission → validation auto → partenaire
// accepte → mission → client confirme l'arrivée et clôt → commission.
// Puis proposition d'embauche (UI) → admin transmet → partenaire accepte →
// contrat PDF téléchargeable par l'employeur.
async function chauffeur(browser) {
  const journal = [];
  const admin = await apiAdmin();
  const PWD = process.env.VERIF_SEME_PWD, CLIENT = process.env.VERIF_CLIENT_ID, PARTNER = process.env.VERIF_PARTNER_ID;
  if (!PWD || !CLIENT || !PARTNER) throw new Error("VERIF_CLIENT_ID / VERIF_PARTNER_ID / VERIF_SEME_PWD requis (apiLocale les publie)");
  const apiAs = async (id) => {
    const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ identifier: id, password: PWD }) });
    const d = await r.json().catch(() => ({}));
    if (!d.token) throw new Error(`connexion ${id} impossible (${r.status})`);
    return async (path, { method = "GET", body } = {}) => {
      const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com", Authorization: `Bearer ${d.token}` }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, data: await res.json().catch(() => ({})), raw: res };
    };
  };
  const partner = await apiAs(PARTNER);
  const client = await apiAs(CLIENT);
  // Le chauffeur du partenaire connecté (un autre partenaire recevrait 403 — c'est voulu).
  const miens = (await partner("/api/drivers/mine")).data;
  const chauffeurDoc = (miens.drivers || miens).find((d) => d.status === "approved" && d.tarif > 0);
  if (!chauffeurDoc) throw new Error("le partenaire semé n'a aucun chauffeur avec tarif journée");

  // 1. Client : réservation d'une mission à la JOURNÉE (2 jours) depuis la page.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pc = await ctx.newPage(); surveiller(pc, "client", journal);
  await connecter(pc, CLIENT, PWD);
  await pc.goto(`${BASE}/driver-booking/${chauffeurDoc._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pc.getByRole("button", { name: /Journée complète/ }).click({ timeout: 60000 });
  await pc.fill("input[type=number]", "2");
  await pc.fill("input[type=date]", dateISO(5));
  await pc.fill("input[type=time]", "08:00");
  await pc.fill("input[placeholder*='Aéroport']", "Gare de Casa-Voyageurs");
  await pc.getByRole("button", { name: /Réserver ce chauffeur/ }).click();
  await pc.waitForURL(/booking\/success/, { timeout: 30000 });
  ok("client : mission chauffeur réservée (journée × 2) depuis le site");

  const mine = (await client("/api/bookings/mine")).data;
  const booking = (mine.bookings || mine).find((b) => b.type === "chauffeur");
  if (!booking) throw new Error("réservation chauffeur absente de « mes réservations »");
  if (booking.chauffeur?.unite !== "journee" || booking.chauffeur?.quantite !== 2 || booking.chauffeur?.heures !== 48) throw new Error(`unité/quantité inattendues : ${JSON.stringify(booking.chauffeur)}`);
  if (Math.abs(booking.montantBase - chauffeurDoc.tarif * 2) > 0.01) throw new Error(`montant ${booking.montantBase} ≠ tarif journée × 2 (${chauffeurDoc.tarif * 2})`);
  ok(`montant = tarif journée × 2 = ${booking.montantBase} USD, 48 h bloquées`);

  // 2. Transmission DIRECTE (2026-09-14) : aucune validation admin, le
  //    partenaire voit la mission immédiatement et l'accepte.
  const detail = (await admin(`/api/bookings/${booking._id}/detail`)).data.booking || booking;
  if (detail.adminValidation?.status !== "approved") throw new Error(`mission chauffeur non transmise au partenaire (adminValidation ${detail.adminValidation?.status})`);
  if (detail.adminValidation?.validatedByType !== "SYSTEM") throw new Error(`transmission attendue par le SYSTÈME, obtenue ${detail.adminValidation?.validatedByType}`);
  if (!detail.partnerNotifiedAt) throw new Error("partnerNotifiedAt absent : le délai de réponse partenaire ne court pas");
  ok("mission transmise directement au partenaire (sans validation admin)");
  let r = await partner(`/api/bookings/${booking._id}/status`, { method: "PATCH", body: { status: "confirmed" } });
  if (r.status !== 200) throw new Error(`partenaire confirme : ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  r = await partner(`/api/bookings/${booking._id}/status`, { method: "PATCH", body: { status: "in_progress" } });
  if (r.status !== 200) throw new Error(`in_progress : ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  ok("partenaire : mission acceptée puis démarrée");
  r = await client(`/api/bookings/${booking._id}/driver-arrived`, { method: "PATCH" });
  if (r.status !== 200) throw new Error(`driver-arrived : ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  r = await client(`/api/bookings/${booking._id}/complete-mission`, { method: "PATCH" });
  if (r.status !== 200) throw new Error(`complete-mission : ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  const fini = (await client(`/api/bookings/${booking._id}/detail`)).data.booking;
  if (fini?.status !== "completed") throw new Error(`statut final ${fini?.status}`);
  if (!(fini.commissionAmount > 0)) throw new Error("commission non calculée");
  ok(`client : arrivée confirmée, mission clôturée → completed, commission ${fini.commissionAmount} USD (${Math.round(fini.commissionRate * 100)} %)`);

  // 3. Embauche CDD depuis la page employeur.
  await pc.goto(`${BASE}/driver-employment/${chauffeurDoc._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pc.locator("input[type=radio][value=cdd]").check();
  const dates = pc.locator("input[type=date]");
  await dates.nth(1).waitFor({ timeout: 10000 });
  await dates.nth(0).fill(dateISO(10));
  await dates.nth(1).fill(dateISO(100));
  await pc.fill("input[type=number]", "4000");
  await pc.locator("select[aria-label='Devise du salaire']").selectOption("MAD");
  await pc.fill("input[placeholder*='Casablanca']", "Casablanca");
  await pc.getByRole("button", { name: /Envoyer la proposition|Proposer|Envoyer/ }).first().click();
  await pc.getByText(/Proposition envoyée/).first().waitFor({ timeout: 30000 });
  ok("employeur : proposition CDD envoyée (4 000 MAD/mois)");
  const reqs = (await client("/api/driver-employment/mine")).data.requests || [];
  const dem = reqs[0];
  if (!dem || dem.currency !== "MAD" || dem.proposedSalary !== 4000) throw new Error(`demande d'embauche inattendue : ${JSON.stringify(dem).slice(0, 160)}`);
  // Le partenaire ne doit rien voir avant la validation admin.
  // Transmission directe (2026-09-14) : le partenaire voit la demande à
  // l'instant ; « forward » admin n'a plus d'objet (409).
  const recu = (await partner("/api/driver-employment/received")).data.requests || [];
  if (!recu.some((x) => x._id === dem._id)) throw new Error("le partenaire ne voit pas la demande d'embauche transmise directement");
  r = await admin(`/api/driver-employment/${dem._id}/admin-review`, { method: "PATCH", body: { action: "forward" } });
  if (r.status !== 409) throw new Error(`admin-review forward attendu 409 (déjà transmise), obtenu ${r.status}`);
  r = await partner(`/api/driver-employment/${dem._id}/respond`, { method: "PATCH", body: { action: "accept" } });
  if (r.status !== 200) throw new Error(`respond : ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
  const pdf = await client(`/api/driver-employment/${dem._id}/contract-pdf`);
  if (pdf.status !== 200 || !(pdf.raw.headers.get("content-type") || "").includes("pdf")) throw new Error(`contrat PDF : ${pdf.status} ${pdf.raw.headers.get("content-type")}`);
  ok("demande transmise directement → partenaire accepte → contrat PDF servi à l'employeur");
  await ctx.close();
  for (const j of journal) ko(`chauffeur — ${j}`);
}

// ── Profil partenaire : présentation publique rédigée depuis /profile,
//    visible par un visiteur sur /partner/:id avec les annonces (2026-09-14).
async function profilPartenaire(browser) {
  const journal = [];
  const PWD = process.env.VERIF_SEME_PWD, PARTNER = process.env.VERIF_PARTNER_ID;
  if (!PWD || !PARTNER) throw new Error("VERIF_PARTNER_ID / VERIF_SEME_PWD requis");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pp = await ctx.newPage(); surveiller(pp, "partenaire", journal);
  await connecter(pp, PARTNER, PWD);
  await pp.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const texte = `Centre de démonstration — vérification ${Date.now()}`;
  await pp.fill("input[placeholder='Ex : NEMO Diving']", "Atlas Loisirs Démo");
  await pp.fill("input[placeholder='Ex : Fnideq']", "Marrakech");
  await pp.fill("textarea[placeholder*='Décrivez votre activité']", texte);
  await pp.fill("input[type=url]", "https://exemple.test/atlas");
  await pp.getByRole("button", { name: /Enregistrer|Sauvegarder|Save/i }).first().click();
  await pp.getByText(/Profil mis à jour/).first().waitFor({ timeout: 30000 }); // toast + bouton « ✓ »
  await pp.getByText(/Erreur/).first().waitFor({ timeout: 1500 }).then(() => { throw new Error("la sauvegarde du profil a échoué"); }, () => {});
  ok("partenaire : présentation publique enregistrée depuis la page profil");

  const moi = await (await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ identifier: PARTNER, password: PWD }) })).json();
  const id = moi.user?._id || moi.user?.id;
  if (!id) throw new Error("identifiant du partenaire introuvable après connexion");
  const pub = await (await fetch(`${API}/api/users/${id}/public`)).json();
  if (pub.business?.description !== texte || pub.defaultLocation?.city !== "Marrakech") throw new Error(`profil public incomplet : ${JSON.stringify(pub).slice(0, 200)}`);
  if (pub.business?.website !== undefined) throw new Error("le site web du partenaire est exposé au public");

  const pv = await ctx.newPage(); surveiller(pv, "visiteur", journal);
  await pv.goto(`${BASE}/partner/${id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pv.getByText(texte).waitFor({ timeout: 30000 });
  await pv.getByRole("heading", { name: /Atlas Loisirs Démo/ }).first().waitFor({ timeout: 30000 });
  await pv.getByText(/Activités & loisirs \(\d+\)/).waitFor({ timeout: 30000 });
  const reserver = await pv.getByRole("link", { name: /Réserver/ }).count();
  if (reserver < 1) throw new Error("aucune activité réservable sur la page publique du partenaire");
  if (await pv.getByText(/exemple\.test/).count()) throw new Error("le site web du partenaire apparaît sur la page publique");
  ok(`visiteur : page publique avec présentation (sans site web) et ${reserver} annonce(s) réservable(s)`);

  // ── Le lien de vitrine partageable (2026-09-25) ──────────────────────────
  // Consigne de l'exploitant : chaque partenaire dispose d'un lien qu'il peut
  // partager, ne contenant QUE ses annonces. Vérifié de bout en bout parce que
  // les trois maillons peuvent casser séparément : l'écran qui DONNE le lien,
  // la résolution du nom en identifiant, et la réécriture SPA de /p/:slug —
  // cette dernière n'existe que dans vercel.json, invisible aux tests unitaires.
  await pp.goto(`${BASE}/vendor/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const champLien = pp.getByLabel(/Adresse courte de la vitrine|Adresse complète de la vitrine/).first();
  await champLien.waitFor({ timeout: 30000 });
  const lienVitrine = await champLien.inputValue();
  if (!lienVitrine) throw new Error("le tableau de bord partenaire n'affiche aucun lien de vitrine");
  ok(`partenaire : lien de vitrine proposé au partage (${lienVitrine})`);

  // On ne suit pas le lien tel quel — il porte le domaine de production. C'est
  // son CHEMIN qui doit fonctionner sur l'aperçu local, avec ses en-têtes.
  const chemin = new URL(lienVitrine).pathname;
  const pl = await ctx.newPage(); surveiller(pl, "vitrine", journal);
  await pl.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pl.getByRole("heading", { name: /Atlas Loisirs Démo/ }).first().waitFor({ timeout: 30000 });
  ok(`visiteur : ${chemin} ouvre bien la vitrine du partenaire`);

  await ctx.close();
  for (const j of journal) ko(`profil partenaire — ${j}`);
}

// ── Parcours 4 : pièce détachée — commande livrée, de la fiche au « reçu » ──
// Client (UI) → commande d'une pièce en stock avec adresse → transmise au
// vendeur → vendeur confirme, prépare, expédie (suivi), livre → client
// confirme la réception → completed, commission sur la pièce seule.
async function pieceDetachee(browser) {
  const journal = [];
  const PWD = process.env.VERIF_SEME_PWD, CLIENT = process.env.VERIF_CLIENT_ID, PARTNER = process.env.VERIF_PARTNER_ID;
  if (!PWD || !CLIENT || !PARTNER) throw new Error("VERIF_CLIENT_ID / VERIF_PARTNER_ID / VERIF_SEME_PWD requis");
  const apiAs = async (id) => {
    const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ identifier: id, password: PWD }) });
    const d = await r.json().catch(() => ({}));
    if (!d.token) throw new Error(`connexion ${id} impossible (${r.status})`);
    return async (path, { method = "GET", body } = {}) => {
      const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com", Authorization: `Bearer ${d.token}` }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };
  };
  const partner = await apiAs(PARTNER);
  const client = await apiAs(CLIENT);
  const miennes = (await partner("/api/parts/mine")).data.parts || [];
  const piece = miennes.find((p) => p.status === "approved" && p.saleMode === "direct" && p.stock > 0);
  if (!piece) throw new Error("le partenaire semé n'a aucune pièce en stock approuvée");
  const stockAvant = piece.stock;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pc = await ctx.newPage(); surveiller(pc, "client", journal);
  await connecter(pc, CLIENT, PWD);
  await pc.goto(`${BASE}/part/${piece._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pc.getByRole("button", { name: /Commander cette pièce/ }).waitFor({ timeout: 60000 });
  await pc.fill("input[autocomplete=street-address]", "12 rue des Orangers, résidence Yasmine");
  await pc.fill("input[autocomplete=address-level2]", "Marrakech");
  await pc.locator("select").filter({ hasText: "Pays" }).selectOption("MA");
  await pc.fill("input[type=number]", "2");
  await pc.getByText(/Total estimé/).waitFor({ timeout: 30000 });
  await pc.getByRole("button", { name: /Commander cette pièce/ }).click();
  await pc.waitForURL(/booking\/success/, { timeout: 30000 });
  ok("client : pièce commandée (×2, livraison) depuis le site");

  const mine = (await client("/api/bookings/mine")).data;
  const cmd = (mine.bookings || mine).find((b) => b.type === "piece");
  if (!cmd) throw new Error("commande pièce absente de « mes réservations »");
  if (cmd.piece?.quantity !== 2 || Math.abs(cmd.montantBase - piece.price * 2) > 0.01) throw new Error(`quantité/montant inattendus : ${JSON.stringify(cmd.piece)} ${cmd.montantBase}`);
  if (cmd.adminValidation?.status !== "approved") throw new Error("commande non transmise directement au vendeur");
  const apres = (await partner("/api/parts/mine")).data.parts.find((p) => p._id === piece._id);
  if (apres.stock !== stockAvant - 2) throw new Error(`stock non réservé : ${stockAvant} → ${apres.stock}`);
  ok(`montant = prix × 2 + livraison = ${cmd.montantTotal} USD, stock ${stockAvant} → ${apres.stock}, transmise au vendeur`);

  let r;
  for (const [status, extra] of [["confirmed", {}], ["preparing", {}], ["in_progress", { tracking: { carrier: "Amana", trackingNumber: "AM-VERIF-1" } }], ["waiting_client_validation", {}]]) {
    r = await partner(`/api/bookings/${cmd._id}/status`, { method: "PATCH", body: { status, ...extra } });
    if (r.status !== 200) throw new Error(`vendeur → ${status} : ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  }
  ok("vendeur : confirmée → préparée → expédiée (suivi Amana) → livrée");
  r = await client(`/api/bookings/${cmd._id}/validate`, { method: "PATCH", body: { action: "validate" } });
  if (r.status !== 200) throw new Error(`réception : ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  const fini = (await client(`/api/bookings/${cmd._id}/detail`)).data.booking;
  if (fini?.status !== "completed") throw new Error(`statut final ${fini?.status}`);
  if (Math.abs(fini.commissionAmount - fini.montantBase * fini.commissionRate) > 0.01) throw new Error(`commission ${fini.commissionAmount} ≠ pièce × taux`);
  ok(`client : réception confirmée → completed, commission ${fini.commissionAmount} USD (${Math.round(fini.commissionRate * 100)} % de la pièce seule)`);
  await ctx.close();
  for (const j of journal) ko(`pièce détachée — ${j}`);
}

const PARCOURS = [["Vente par demande d'essai", demandeEssai], ["Chauffeur — mission et embauche", chauffeur], ["Profil partenaire — présentation publique", profilPartenaire], ["Pièce détachée — commande livrée", pieceDetachee]];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const [nom, fn] of PARCOURS) {
  console.log(`── ${nom} ──`);
  try { await fn(browser); } catch (err) { ko(`${nom} : ${err.message}`); }
}
await browser.close();
console.log(anomalies.length ? `\n✗ ${anomalies.length} anomalie(s) dans les parcours critiques — NE PAS pousser.` : "\n✓ Parcours critiques aboutis.");
process.exit(anomalies.length ? 1 : 0);
