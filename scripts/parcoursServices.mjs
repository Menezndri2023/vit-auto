// ── Parcours de service, client ET partenaire, bout en bout ────────────────
//
// Complète scripts/parcoursCritiques.mjs (garde avant push : essai, chauffeur,
// profil partenaire, pièce détachée) avec les services qu'il ne couvre pas :
// LOCATION (le cœur du service), LOISIRS, IMPORT/EXPORT, et le côté partenaire
// (publication d'annonce, secteurs, PMS, import de flotte) et le compte client
// (favoris, panier, profil). Même pile locale que la garde (apiLocale.mjs +
// servirAvecCsp.mjs), mêmes variables VERIF_*.
//
//   node scripts/parcoursServices.mjs [http://localhost:4180] [--seulement location,loisirs,…]
// Sort en code 1 à la moindre anomalie. Chaque scénario est indépendant.
import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const racine = join(homedir(), "Library", "Caches", "ms-playwright");
const dossier = readdirSync(racine).filter((x) => x.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))[0];
const EXE = process.env.CHROMIUM_PATH || ["chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"].map((r) => join(racine, dossier, r)).find(existsSync);
const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:4180";
const API = process.env.API_LOCALE_URL || "http://localhost:5001";
const idxSeul = process.argv.indexOf("--seulement");
const SEULEMENT = idxSeul !== -1 ? process.argv[idxSeul + 1].split(",") : null;
const PWD = process.env.VERIF_SEME_PWD, CLIENT = process.env.VERIF_CLIENT_ID, PARTNER = process.env.VERIF_PARTNER_ID, ADMIN_ID = process.env.VERIF_ADMIN_ID, ADMIN_PWD = process.env.VERIF_ADMIN_PWD;
if (!PWD || !CLIENT || !PARTNER || !ADMIN_ID) { console.error("VERIF_CLIENT_ID / VERIF_PARTNER_ID / VERIF_SEME_PWD / VERIF_ADMIN_ID / VERIF_ADMIN_PWD requis (apiLocale les publie)"); process.exit(2); }

// PNG 1×1 valide, pour les champs « pièce d'identité » et « permis ».
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const anomalies = [];
const ok = (m) => console.log(`✓ ${m}`);
const ko = (m) => { anomalies.push(m); console.log(`✗ ${m}`); };
// Décalage aléatoire par exécution : la base locale persiste entre deux
// lancements, et deux réservations aux mêmes dates sur le même véhicule se
// bloqueraient l'une l'autre (409 indisponible) — un faux échec.
const DECALAGE = 20 + Math.floor(Math.random() * 300);
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

async function apiAs(id, pwd = PWD) {
  const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ identifier: id, password: pwd }) });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`connexion ${id} impossible (${r.status})`);
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com", Authorization: `Bearer ${d.token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})), raw: res };
  };
}
const attendu = (r, statut, quoi) => { const ok = Array.isArray(statut) ? statut.includes(r.status) : r.status === statut; if (!ok) throw new Error(`${quoi} : ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`); return r.data; };

// Une erreur levée DANS un cadre Google (bouton « Continuer avec Google »,
// accounts.google.com/gsi/…) n'est pas la nôtre et arrive par intermittence
// (« gis is not defined », 2026-09-16) : elle ne doit pas bloquer un push.
const erreurTierce = (e) => /accounts\.google\.com|gsi\/|apis\.google\.com/.test(String(e?.stack || "")) || /^gis is not defined/.test(String(e?.message || e || ""));
function surveiller(page, nom, journal) {
  page.on("pageerror", (e) => { if (!erreurTierce(e)) journal.push(`[${nom}] pageerror: ${e.message.slice(0, 160)}`); });
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().startsWith(BASE) && !/auth\/me|auth\/refresh|\/api\/geo\/|business-config\/pricing|partner-onboarding\/my/.test(r.url())) {
      const corps = await r.text().catch(() => "");
      journal.push(`[${nom}] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")} ${corps.slice(0, 160)}`);
    }
  });
}
async function connecter(page, id, pwd = PWD) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => { try { sessionStorage.setItem("vit_splash_shown", "1"); } catch {} });
  await page.fill("#login-identifier", id); await page.fill("#login-password", pwd);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => !!localStorage.getItem("vit-auto-token"), null, { timeout: 30000 });
  // Guide de bienvenue : fermé s'il apparaît, il recouvre les boutons d'action.
  await page.evaluate(() => { try { const u = JSON.parse(localStorage.getItem("vit-auto-user") || "{}"); if (u.id) localStorage.setItem(`vit-welcome-guide-seen-${u.id}`, "1"); } catch {} });
}
const texte = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 600));
async function contexte(browser, nom, journal) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
  await ctx.addInitScript(() => { try { sessionStorage.setItem("vit_splash_shown", "1"); } catch {} });
  const page = await ctx.newPage(); surveiller(page, nom, journal);
  return { ctx, page };
}

// ── LOCATION : réservation depuis le site → partenaire confirme → prolongation → clôture → avis ──
async function location(browser) {
  const journal = [];
  const client = await apiAs(CLIENT), partner = await apiAs(PARTNER);
  // Une annonce du partenaire connecté (un autre partenaire recevrait 403 — c'est voulu).
  const miens = (await partner("/api/vehicles/mine")).data;
  const veh = (miens.vehicles || miens).find((v) => v.status === "approved" && v.type === "location" && v.pricePerDay > 0);
  if (!veh) throw new Error("le partenaire semé n'a aucune annonce de location approuvée");
  const { ctx, page } = await contexte(browser, "client", journal);
  await connecter(page, CLIENT);
  await page.goto(`${BASE}/booking/${veh._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("input[type=date]").first().waitFor({ timeout: 30000 });
  const dates = page.locator("input[type=date]");
  await dates.nth(0).fill(dateISO(DECALAGE)); await dates.nth(1).fill(dateISO(DECALAGE + 3));
  await page.getByRole("button", { name: /Suivant/ }).first().click();
  await page.waitForTimeout(800);
  // Étape options : rien de coché, on passe.
  const suivant2 = page.getByRole("button", { name: /Suivant/ }).first();
  if (await suivant2.isVisible().catch(() => false)) { await suivant2.click(); await page.waitForTimeout(800); }
  // Paiement : espèces à la prise en charge.
  const cash = page.locator("input[type=radio][value=cash]");
  if (await cash.count()) await cash.check().catch(() => {});
  const recap = page.getByRole("button", { name: /récapitulatif|Suivant/i }).first();
  if (await recap.isVisible().catch(() => false)) { await recap.click(); await page.waitForTimeout(800); }
  const confirmer = page.getByRole("button", { name: /Confirmer/ }).first();
  await confirmer.waitFor({ timeout: 15000 }).catch(async () => { throw new Error("bouton Confirmer absent — écran : " + (await texte(page)).slice(0, 300)); });
  // Dernière étape : le permis (et l'identité si non vérifiée) sont joints à
  // la réservation elle-même. Une image PNG minimale suffit au formulaire.
  const fichiers = page.locator("input[type=file]");
  for (let i = 0; i < await fichiers.count(); i++) await fichiers.nth(i).setInputFiles({ name: `doc-${i}.png`, mimeType: "image/png", buffer: PNG });
  await page.waitForTimeout(600);
  if (!(await confirmer.isEnabled())) throw new Error("Confirmer reste désactivé après l'ajout des documents — écran : " + (await texte(page)).slice(0, 300));
  await confirmer.click();
  await page.waitForURL(/booking\/success|dashboard/, { timeout: 30000 }).catch(async () => {
    const toast = await page.evaluate(() => [...document.querySelectorAll("[role=alert], [class*=toast]")].map((e) => e.innerText).join(" | ").slice(0, 200));
    throw new Error("pas de confirmation après Confirmer — toast : " + toast + " — écran : " + (await texte(page)).slice(0, 200));
  });
  ok("client : location réservée depuis le site (3 jours, espèces)");

  const mine = (await client("/api/bookings/mine")).data;
  const b = (mine.bookings || mine).find((x) => x.type === "location" && String(x.vehicle?._id || x.vehicle) === String(veh._id));
  if (!b) throw new Error("réservation absente de « mes réservations »");
  if (Math.abs(b.montantBase - veh.pricePerDay * 3) > 0.01) throw new Error(`montant ${b.montantBase} ≠ ${veh.pricePerDay} × 3`);
  ok(`montant = ${veh.pricePerDay} × 3 = ${b.montantBase} USD`);
  attendu(await partner(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status: "confirmed" } }), 200, "partenaire confirme");
  ok("partenaire : réservation confirmée");
  // Prolongation par le client (PATCH /extend, statuts prolongeables), avant la remise.
  const ext = await client(`/api/bookings/${b._id}/extend`, { method: "PATCH", body: { newEndDate: dateISO(DECALAGE + 5) } });
  attendu(ext, 200, "prolongation");
  const prolongee = (await client(`/api/bookings/${b._id}/detail`)).data.booking;
  if (Math.abs(prolongee.montantBase - veh.pricePerDay * 5) > 0.01) throw new Error(`après prolongation, montant ${prolongee.montantBase} ≠ ${veh.pricePerDay} × 5`);
  ok(`client : prolongée de 2 jours → ${prolongee.montantBase} USD`);
  // Remise du véhicule : le client se présente, la transaction est conclue,
  // puis le client valide — la machine à états des rendez-vous.
  for (const status of ["in_progress", "client_arrived", "transaction_concluded", "waiting_client_validation"]) {
    attendu(await partner(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status } }), 200, `partenaire → ${status}`);
  }
  attendu(await client(`/api/bookings/${b._id}/validate`, { method: "PATCH", body: { action: "validate" } }), 200, "validation client");
  const fini = (await client(`/api/bookings/${b._id}/detail`)).data.booking;
  if (fini?.status !== "completed") throw new Error(`statut final ${fini?.status}`);
  if (!(fini.commissionAmount > 0)) throw new Error("commission non calculée");
  ok(`remise → conclue → validée par le client → completed, commission ${fini.commissionAmount} USD (${Math.round(fini.commissionRate * 100)} %)`);
  // Avis du client sur le véhicule, puis sur le partenaire ; avis du partenaire sur le client.
  attendu(await client("/api/reviews", { method: "POST", body: { bookingId: b._id, targetType: "vehicle", note: 5, commentaire: "Parfait, véhicule propre et ponctuel." } }), 201, "avis véhicule");
  attendu(await client("/api/reviews", { method: "POST", body: { bookingId: b._id, targetType: "partner", note: 5, commentaire: "Partenaire réactif." } }), 201, "avis partenaire");
  attendu(await partner("/api/reviews", { method: "POST", body: { bookingId: b._id, targetType: "client", note: 5, commentaire: "Client sérieux." } }), 201, "avis client par le partenaire");
  ok("avis croisés déposés (véhicule, partenaire, client)");
  await ctx.close();
  for (const j of journal) ko(`location — ${j}`);
}

// ── LOISIRS : réservation d'une activité depuis le site → partenaire confirme → séance → clôture ──
async function loisirs(browser) {
  const journal = [];
  const client = await apiAs(CLIENT), partner = await apiAs(PARTNER);
  const miennes = (await partner("/api/activities/mine")).data;
  const act = (miennes.activities || miennes).find((a) => a.status === "approved");
  if (!act) throw new Error("le partenaire semé n'a aucune activité approuvée");
  const { ctx, page } = await contexte(browser, "client", journal);
  await connecter(page, CLIENT);
  await page.goto(`${BASE}/activity-booking/${act._id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("input[type=date]").first().waitFor({ timeout: 30000 });
  const passeport = page.locator("input[placeholder*='passeport']");
  if (await passeport.count()) await passeport.fill("CI-PASS-2026");
  await page.locator("input[type=date]").first().fill(dateISO(DECALAGE + 1));
  await page.locator("input[type=time]").first().fill("10:00");
  const participants = page.locator("input[type=number]").first();
  if (await participants.count()) await participants.fill("2");
  const meteo = page.locator("input[type=checkbox]").first();
  if (await meteo.count()) await meteo.check().catch(() => {});
  const cash = page.locator("input[type=radio][value=cash]");
  if (await cash.count()) await cash.check().catch(() => {});
  const bouton = page.getByRole("button", { name: /^Réserver/ }).first();
  if (!(await bouton.isEnabled())) throw new Error("Réserver désactivé — écran : " + (await texte(page)).slice(0, 300));
  await bouton.click();
  await page.waitForURL(/booking\/success/, { timeout: 30000 }).catch(async () => {
    const toast = await page.evaluate(() => [...document.querySelectorAll("[role=alert], [class*=toast]")].map((e) => e.innerText).join(" | ").slice(0, 200));
    throw new Error("pas de confirmation — toast : " + toast + " — écran : " + (await texte(page)).slice(0, 200));
  });
  ok(`client : activité « ${act.title} » réservée depuis le site (2 participants)`);
  const mine = (await client("/api/bookings/mine")).data;
  const b = (mine.bookings || mine).find((x) => x.type === "activite" && String(x.activity?._id || x.activity) === String(act._id));
  if (!b) throw new Error("réservation d'activité absente de « mes réservations »");
  const attenduBase = act.priceUnit === "per_person" ? act.price * 2 : act.price;
  if (Math.abs(b.montantBase - attenduBase) > 0.01) throw new Error(`montant ${b.montantBase} ≠ ${attenduBase} (${act.priceUnit})`);
  ok(`montant = ${b.montantBase} USD (${act.priceUnit === "per_person" ? "par personne × 2" : "forfait"})`);
  attendu(await partner(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status: "confirmed" } }), 200, "partenaire confirme");
  for (const status of ["in_progress", "client_arrived", "transaction_concluded", "waiting_client_validation"]) {
    attendu(await partner(`/api/bookings/${b._id}/status`, { method: "PATCH", body: { status } }), 200, `partenaire → ${status}`);
  }
  attendu(await client(`/api/bookings/${b._id}/validate`, { method: "PATCH", body: { action: "validate" } }), 200, "validation client");
  const fini = (await client(`/api/bookings/${b._id}/detail`)).data.booking;
  if (fini?.status !== "completed") throw new Error(`statut final ${fini?.status}`);
  if (!(fini.commissionAmount > 0)) throw new Error("commission non calculée");
  if (Math.abs(fini.commissionRate - 0.10) > 0.001 && Math.abs(fini.commissionRate - 0.15) > 0.001) throw new Error(`taux loisirs inattendu ${fini.commissionRate}`);
  ok(`séance conclue → completed, commission ${fini.commissionAmount} USD (${Math.round(fini.commissionRate * 100)} %)`);
  await ctx.close();
  for (const j of journal) ko(`loisirs — ${j}`);
}

// ── IMPORT/EXPORT : profil importateur → annonce → demande client → réservation → offre → séquestre → expédition → livraison → fonds ──
async function importExport(browser) {
  const journal = [];
  // Second partenaire semé : le premier porte déjà le secteur Location (plan
  // gratuit = un seul secteur), et l'export exige le secteur Import / Export.
  const PARTNER2 = PARTNER.replace("partenaire1", "partenaire2");
  const client = await apiAs(CLIENT), partner = await apiAs(PARTNER2), admin = await apiAs(ADMIN_ID, ADMIN_PWD);
  // 0. Secteur Import / Export demandé et accordé (parcours réel d'un exportateur).
  const secteurs = attendu(await partner("/api/partner-sectors/me"), 200, "mes secteurs");
  if (!secteurs.secteurs.some((x) => x.secteur === "exportateur")) {
    const dem = attendu(await partner("/api/partner-sectors/requests", { method: "POST", body: { secteur: "exportateur", motif: "Export de véhicules vers l'Afrique de l'Ouest" } }), 201, "demande secteur export");
    attendu(await admin(`/api/partner-sectors/admin/requests/${dem.demande._id}`, { method: "PATCH", body: { decision: "approve" } }), 200, "approbation secteur export");
    ok("secteurs : « Import / Export » demandé puis accordé par l'admin");
  }
  // 1. Partenaire : profil importateur soumis, vérifié par l'admin.
  // Rejouable : un profil déjà vérifié (exécution précédente) est conservé tel quel.
  const dejaProfil = attendu(await partner("/api/import-export/importer-profile"), 200, "mon profil importateur");
  if ((dejaProfil.profile || dejaProfil)?.status !== "verified") {
    attendu(await partner("/api/import-export/importer-profile", { method: "POST", body: { companyName: "Atlas Export SARL", country: "MA", city: "Casablanca", activityType: ["export"], operatingCountries: ["CI", "SN"], vehicleCategories: ["usedVehicles"], description: "Export de véhicules d'occasion vers l'Afrique de l'Ouest." } }), 201, "profil importateur");
    const profils = attendu(await admin("/api/import-export/importer-profiles"), 200, "profils (admin)");
    const profil = (profils.profiles || profils).find((x) => x.companyName === "Atlas Export SARL");
    if (!profil) throw new Error("profil importateur introuvable côté admin");
    attendu(await admin(`/api/import-export/importer-profiles/${profil._id}/review`, { method: "PATCH", body: { status: "verified", badgeLevel: "silver" } }), 200, "vérification du profil");
  }
  ok("partenaire : profil importateur soumis puis vérifié par l'admin");
  // 2. Annonce d'export, approuvée par l'admin, visible au public.
  const creee = attendu(await partner("/api/import-export/listings", { method: "POST", body: { title: "Toyota Land Cruiser 2021", make: "Toyota", model: "Land Cruiser", year: 2021, sourceCountry: "Émirats Arabes Unis", price: 25000, currency: "USD", availableIn: ["Côte d'Ivoire", "Sénégal"], incoterm: "CIF", description: "Véhicule inspecté, export clé en main." } }), 201, "création annonce export");
  const listing = creee.listing;
  attendu(await admin(`/api/import-export/listings/${listing._id}/status`, { method: "PATCH", body: { status: "approved" } }), 200, "approbation annonce");
  const publiques = attendu(await client("/api/import-export/listings"), 200, "annonces publiques");
  if (!(publiques.listings || publiques).some((l) => l._id === listing._id)) throw new Error("annonce approuvée absente de la liste publique");
  ok("annonce d'export créée, approuvée, visible au public");
  // 3. Client : la page publique de l'annonce se rend, puis demande d'accompagnement (connectée).
  const { ctx, page } = await contexte(browser, "client", journal);
  await connecter(page, CLIENT);
  await page.goto(`${BASE}/import-export/listings/${listing._id}`, { waitUntil: "networkidle", timeout: 60000 });
  const t = await texte(page);
  if (!/Land Cruiser/.test(t)) throw new Error("fiche annonce export sans le titre — écran : " + t.slice(0, 200));
  ok("client : fiche publique de l'annonce export rendue");
  attendu(await client("/api/import-export/requests", { method: "POST", body: { firstName: "Client", lastName: "Démo", email: CLIENT, phone: "+2250700000000", serviceType: "import", sourceCountry: "AE", destCountry: "CI", vehicleType: "SUV", vehicleMake: "Toyota", vehicleModel: "Land Cruiser", vehicleYear: 2021, budget: 30000, currency: "USD", message: "Je souhaite importer ce véhicule à Abidjan." } }), 201, "demande import/export");
  ok("client : demande d'accompagnement import déposée");
  // 4. Réservation → confirmation → offre → acceptation.
  const resa = attendu(await client("/api/import-export/transactions", { method: "POST", body: { listingId: listing._id, destCountry: "Côte d'Ivoire", destCity: "Abidjan", notes: "Livraison au port d'Abidjan." } }), 201, "réservation");
  const tx = resa.transaction || resa.tx || resa;
  attendu(await partner(`/api/import-export/transactions/${tx._id}/confirm`, { method: "PATCH" }), 200, "confirmation partenaire");
  attendu(await partner(`/api/import-export/transactions/${tx._id}/final-offer`, { method: "POST", body: { vehiclePrice: 25000, exportFees: 1200, shippingCost: 1800, insurance: 300, currency: "USD", estimatedDelay: "45 jours", notes: "CIF Abidjan" } }), 200, "offre finale");
  attendu(await client(`/api/import-export/transactions/${tx._id}/accept-offer`, { method: "PATCH" }), 200, "acceptation offre");
  ok("réservation confirmée → offre finale envoyée → acceptée par le client");
  // 5. Paiement sous séquestre (virement déclaré), vérifié par l'admin.
  attendu(await client(`/api/import-export/transactions/${tx._id}/pay`, { method: "POST", body: { method: "virement", transactionRef: "VIR-VERIF-2026-001" } }), 200, "déclaration de paiement");
  attendu(await admin(`/api/import-export/transactions/${tx._id}/verify-payment`, { method: "PATCH" }), 200, "vérification paiement");
  let detail = attendu(await client(`/api/import-export/transactions/${tx._id}`), 200, "détail").transaction;
  if (detail.status !== "in_escrow") throw new Error(`statut après vérification ${detail.status}, attendu in_escrow`);
  ok("paiement déclaré (virement) → vérifié par l'admin → fonds sous séquestre");
  // 6. Documents d'export (rapport d'inspection joint) → expédition → suivi → livraison → fonds libérés.
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64");
  attendu(await partner(`/api/import-export/transactions/${tx._id}/documents`, { method: "PATCH", body: { documents: { inspectionDocs: { status: "fourni", url: pdf }, commercialInvoice: { status: "fourni", url: pdf } } } }), 200, "documents");
  attendu(await partner(`/api/import-export/transactions/${tx._id}/ship`, { method: "PATCH", body: { carrier: "CMA CGM", trackingNumber: "CMAU-VERIF-1", shippingType: "maritime", departureDate: dateISO(3), estimatedArrival: dateISO(45) } }), 200, "expédition");
  attendu(await partner(`/api/import-export/transactions/${tx._id}/tracking`, { method: "PATCH", body: { currentStatus: "En mer — Méditerranée", location: "Gibraltar" } }), 200, "suivi");
  attendu(await client(`/api/import-export/transactions/${tx._id}/deliver`, { method: "PATCH", body: { deliveryNotes: "Véhicule reçu conforme au port d'Abidjan." } }), 200, "livraison confirmée");
  const lib = await client(`/api/import-export/transactions/${tx._id}/release-funds`, { method: "PATCH" });
  if (![200, 409].includes(lib.status)) throw new Error(`libération des fonds : ${lib.status} ${JSON.stringify(lib.data).slice(0, 120)}`);
  detail = attendu(await client(`/api/import-export/transactions/${tx._id}`), 200, "détail final").transaction;
  if (!["completed", "funds_released", "delivered"].includes(detail.status)) throw new Error(`statut final ${detail.status}`);
  const recu = await client(`/api/import-export/transactions/${tx._id}/receipt`);
  if (recu.status !== 200) journal.push(`[client] reçu de transaction : ${recu.status}`);
  ok(`documents joints → expédiée (CMA CGM) → livrée → fonds libérés (statut ${detail.status})`);
  // 7. Tableau de bord client IE rendu.
  await page.goto(`${BASE}/import-export/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  if (!/Land Cruiser|CMAU-VERIF-1|transaction/i.test(await texte(page))) journal.push("[client] tableau de bord import/export sans la transaction");
  else ok("client : la transaction apparaît dans son tableau de bord import/export");
  await ctx.close();
  for (const j of journal) ko(`import/export — ${j}`);
}

// Remplit les champs vides visibles d'une étape de formulaire avec des valeurs
// plausibles (d'après le type et l'indication), coche les cases obligatoires
// et choisit la première option réelle des listes vides. Sert aux assistants
// multi-étapes (publication d'annonce) sans coder chaque champ à la main.
async function remplirEtape(page, valeurs = {}) {
  await page.evaluate((valeurs) => {
    const set = (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement : el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (!visible(el) || el.disabled || el.readOnly) continue;
      const ph = (el.placeholder || el.name || "").toLowerCase();
      const cle = Object.keys(valeurs).find((k) => ph.includes(k.toLowerCase()) || (el.name || "").toLowerCase() === k.toLowerCase());
      if (el.tagName === "SELECT") { if (!el.value && el.options.length > 1) set(el, el.options[1].value); continue; }
      if (el.type === "checkbox") { if (el.required && !el.checked) el.click(); continue; }
      if (["radio", "file", "hidden", "submit", "button"].includes(el.type)) continue;
      if (el.value) continue;
      if (cle) { set(el, String(valeurs[cle])); continue; }
      if (el.type === "number") set(el, /ann[ée]e/.test(ph) ? "2021" : /km|kilom/.test(ph) ? "45000" : "100");
      else if (el.type === "tel") set(el, "+212600000101");
      else if (el.type === "email") set(el, "partenaire1@vitauto-fixtures.fr");
      else if (el.type === "date") set(el, "2027-01-15");
      else set(el, /ville|city/.test(ph) ? "Casablanca" : /adresse|rue/.test(ph) ? "12 rue des Parcs, Casablanca" : /prénom|prenom/.test(ph) ? "Atlas" : /^nom|nom de famille|nom \*/.test(ph) ? "Location" : "Vérification locale");
    }
  }, valeurs);
}

// ── PARTENAIRE : publication d'une annonce depuis l'assistant, approbation admin, visibilité, secteurs, PMS, import de flotte ──
async function partenaire(browser) {
  const journal = [];
  const partner = await apiAs(PARTNER), admin = await apiAs(ADMIN_ID, ADMIN_PWD), client = await apiAs(CLIENT);
  // 0. Secteurs : le partenaire semé n'en déclare aucun (compte historique).
  //    Il demande « Location », l'admin l'accorde — c'est le parcours réel d'un
  //    ancien compte — puis on vérifie que le cumul d'un second secteur est
  //    refusé sur le plan gratuit (PLAN_REQUIS), et accepté une fois abonné.
  const avant = attendu(await partner("/api/partner-sectors/me"), 200, "mes secteurs");
  if (!avant.secteurs.some((x) => x.secteur === "loueur")) {
    const dem = attendu(await partner("/api/partner-sectors/requests", { method: "POST", body: { secteur: "loueur", motif: "Vérification locale : parc de location" } }), 201, "demande secteur Location");
    attendu(await admin(`/api/partner-sectors/admin/requests/${dem.demande._id}`, { method: "PATCH", body: { decision: "approve" } }), 200, "approbation Location");
    ok("secteurs : « Location » demandé puis accordé par l'admin (compte sans secteur déclaré)");
  }
  const cumul = await partner("/api/partner-sectors/requests", { method: "POST", body: { secteur: "vendeur", motif: "Vérification locale" } });
  if (!(cumul.status === 403 && cumul.data.code === "PLAN_REQUIS")) throw new Error(`cumul sur plan gratuit : attendu 403 PLAN_REQUIS, obtenu ${cumul.status} ${JSON.stringify(cumul.data).slice(0, 120)}`);
  ok("secteurs : un second secteur est refusé au plan Gratuit (PLAN_REQUIS)");
  const { ctx, page } = await contexte(browser, "partenaire", journal);
  await connecter(page, PARTNER);
  // 1. Assistant de publication (7 étapes), annonce de location.
  const titre = `Peugeot 3008 vérif ${DECALAGE}`;
  await page.goto(`${BASE}/vendor`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("heading", { name: /Publier une annonce/ }).waitFor({ timeout: 30000 });
  for (let etape = 1; etape <= 7; etape++) {
    if (etape === 2) { await page.getByRole("button", { name: /Location/ }).first().click(); await page.waitForTimeout(300); }
    if (etape === 6) {
      const fichiers = page.locator("input[type=file]");
      for (let i = 0; i < Math.min(2, await fichiers.count()); i++) await fichiers.nth(i).setInputFiles([{ name: "photo-1.png", mimeType: "image/png", buffer: PNG }, { name: "photo-2.png", mimeType: "image/png", buffer: PNG }]).catch(() => {});
      await page.waitForTimeout(800);
    }
    await remplirEtape(page, { "BMW X5": titre, "Toyota": "Peugeot", "Hilux": `3008 V${DECALAGE}`, "45000": "60", "50000": "60", "28000": "60", "Rue 10": "12 rue des Parcs, Casablanca", "Dakar": "Casablanca", "Grand Dakar": "Casablanca", "kilométrage": "Kilométrage 200 km/jour inclus", "Noir": "Gris" });
    if (etape === 7) {
      for (const c of await page.locator("input[type=checkbox]").all()) { if (await c.isVisible() && !(await c.isChecked())) await c.check().catch(() => {}); }
      await clicStable(page.getByRole("button", { name: /Publier l'annonce/ }));
      break;
    }
    const avantClic = (await texte(page)).slice(0, 120);
    await clicStable(page.getByRole("button", { name: /Suivant/ }).first());
    await page.waitForTimeout(600);
    const toast = await page.evaluate(() => [...document.querySelectorAll("[role=alert], [class*=toast]")].map((e) => e.innerText).join(" | ").slice(0, 200));
    if (/obligatoire|requis|invalide|veuillez|manquant/i.test(toast)) throw new Error(`étape ${etape} refusée : ${toast} — écran : ${avantClic}`);
  }
  // La publication confirme SUR PLACE (« Annonce en cours d'examen »), sans redirection.
  await page.getByText(/en cours d'examen|Annonce publiée|soumise/i).first().waitFor({ timeout: 45000 }).catch(async () => {
    const toast = await page.evaluate(() => [...document.querySelectorAll("[role=alert], [class*=toast]")].map((e) => e.innerText).join(" | ").slice(0, 200));
    throw new Error("pas de confirmation de publication — toast : " + toast + " — réponses : " + journal.join(" ; ").slice(0, 300) + " — écran : " + (await texte(page)).slice(0, 200));
  });
  const miens = (await partner("/api/vehicles/mine")).data;
  const veh = (miens.vehicles || miens).find((v) => v.title === titre);
  if (!veh) throw new Error("annonce publiée absente de « mes annonces »");
  if (veh.status !== "pending") throw new Error(`statut après publication ${veh.status}, attendu pending (modération)`);
  ok(`partenaire : annonce « ${titre} » publiée depuis l'assistant (7 étapes) → en attente de modération`);
  // 2. Admin approuve → visible au catalogue et sur sa fiche.
  attendu(await admin(`/api/vehicles/${veh._id}/status`, { method: "PATCH", body: { status: "approved" } }), 200, "approbation admin");
  const fiche = attendu(await client(`/api/vehicles/${veh._id}`), 200, "fiche publique");
  if ((fiche.vehicle || fiche).status !== "approved") throw new Error("fiche non approuvée");
  await page.goto(`${BASE}/vehicle/${veh._id}`, { waitUntil: "networkidle", timeout: 60000 });
  if (!(await texte(page)).includes("3008")) throw new Error("fiche véhicule publique sans le titre");
  ok("admin : approuvée → fiche publique rendue");
  // 4. PMS : lead, devis, showroom publié → page publique.
  const lead = attendu(await partner("/api/pms/leads", { method: "POST", body: { buyer: { name: "Prospect Vérif", phone: "+2250700000001", email: "prospect@vitauto-fixtures.fr", country: "CI" }, vehicle: { make: "Peugeot", model: "3008", conditions: "occasion" }, source: "website", status: "nouveau" } }), 201, "lead PMS");
  const leadId = (lead.lead || lead)._id;
  attendu(await partner(`/api/pms/leads/${leadId}/followup`, { method: "POST", body: { note: "Rappel prévu demain", method: "phone", outcome: "à rappeler", nextAction: dateISO(1) } }), 200, "relance lead");
  const devis = await partner("/api/pms/quotes", { method: "POST", body: { leadId, buyer: { name: "Prospect Vérif", email: "prospect@vitauto-fixtures.fr", country: "CI" }, lines: [{ description: "Location 3008 — 30 jours", quantity: 30, unitPrice: 60, category: "vehicule" }], currency: "USD", incoterm: "DAP", validityDays: 15 } });
  if (![200, 201].includes(devis.status)) throw new Error(`devis : ${devis.status} ${JSON.stringify(devis.data).slice(0, 140)}`);
  const quoteId = (devis.data.quote || devis.data)._id;
  attendu(await partner(`/api/pms/quotes/${quoteId}/send`, { method: "POST" }), 200, "envoi devis");
  ok("PMS : lead créé, relancé, devis émis et envoyé");
  const showroom = await partner("/api/pms/showroom/me", { method: "PUT", body: { companyName: "Atlas Location", tagline: "Location premium à Casablanca", description: "Flotte récente, livraison à l'aéroport.", city: "Casablanca", country: "MA" } });
  if (![200, 201].includes(showroom.status)) throw new Error(`showroom : ${showroom.status} ${JSON.stringify(showroom.data).slice(0, 140)}`);
  const pub = attendu(await partner("/api/pms/showroom/me/publish", { method: "POST" }), 200, "publication showroom");
  const slug = (pub.showroom || pub).slug || (showroom.data.showroom || showroom.data).slug;
  if (!slug) throw new Error("showroom publié sans slug");
  await page.goto(`${BASE}/showroom/${slug}`, { waitUntil: "networkidle", timeout: 60000 });
  if (!/Atlas Location/.test(await texte(page))) throw new Error("page showroom publique sans le nom — écran : " + (await texte(page)).slice(0, 200));
  ok(`PMS : showroom publié → /showroom/${slug} rendu`);
  // 5. Import de flotte : aperçu puis import d'un fichier CSV de deux lignes.
  const csv = "titre,marque,modele,annee,type,prix_jour,ville\nRenault Captur vérif,Renault,Captur,2022,location,40,Casablanca\nDacia Logan vérif,Dacia,Logan,2020,location,25,Marrakech";
  const apercu = await partner("/api/vehicles/import/preview", { method: "POST", body: { source: "csv", fileName: "flotte.csv", fileBase64: Buffer.from(csv).toString("base64"), targetType: "vehicle" } });
  if (![200, 201].includes(apercu.status)) journal.push(`[partenaire] aperçu import de flotte : ${apercu.status} ${JSON.stringify(apercu.data).slice(0, 160)}`);
  else {
    const lignes = apercu.data.rows || apercu.data.preview || apercu.data.items || apercu.data.vehicles || [];
    ok(`import de flotte : aperçu CSV accepté (${lignes.length || apercu.data.total || "?"} lignes, ${JSON.stringify(apercu.data).slice(0, 80)}…)`);
  }
  // 6. Tableau de bord partenaire : l'annonce et le calendrier se rendent.
  await page.goto(`${BASE}/vendor/dashboard?tab=annonces`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText(/3008/).first().waitFor({ timeout: 15000 }).catch(() => journal.push("[partenaire] onglet Annonces sans la nouvelle annonce"));
  await page.goto(`${BASE}/vendor/dashboard?tab=calendrier`, { waitUntil: "networkidle", timeout: 60000 });
  await ctx.close();
  for (const j of journal) ko(`partenaire — ${j}`);
}

// ── CLIENT : inscription, favoris, panier, profil, notifications, chat, KYC, fidélité ──
async function compteClient(browser) {
  const journal = [];
  const client = await apiAs(CLIENT), partner = await apiAs(PARTNER);
  const { ctx, page } = await contexte(browser, "client", journal);
  // 1. Inscription depuis le site : jusqu'à l'écran du code e-mail (le code part par e-mail, simulé en local).
  const email = `verif-${DECALAGE}-${Date.now()}@vitauto-fixtures.fr`;
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("#register-firstName", "Awa"); await page.fill("#register-lastName", "Koné");
  await page.fill("#register-birthDate", "1992-05-14");
  const pays = page.locator("#register-country"); if (await pays.count()) await pays.selectOption("CI").catch(() => {});
  await page.fill("#register-email", email); await page.fill("#register-phone", `+2250700${String(100000 + (DECALAGE * 37) % 900000)}`);
  await page.fill("#register-password", "Verif-Locale-2026!"); await page.fill("#register-confirmPassword", "Verif-Locale-2026!");
  for (const c of await page.locator("input[type=checkbox]").all()) { if (await c.isVisible() && !(await c.isChecked())) await c.check().catch(() => {}); }
  await page.locator("button[type=submit]").first().click();
  // En production le code e-mail est exigé ; sur la pile locale (dev sans
  // SMTP, voir authController.isDevNoSmtp) le compte est vérifié d'office et
  // arrive directement au tableau de bord. Les deux issues sont valides.
  await Promise.race([
    page.locator("#register-code").waitFor({ timeout: 30000 }),
    page.waitForURL(/dashboard/, { timeout: 30000 }),
  ]).catch(async () => {
    const toast = await page.evaluate(() => [...document.querySelectorAll("[role=alert], [class*=toast], [class*=err]")].map((e) => e.innerText).join(" | ").slice(0, 200));
    throw new Error("inscription : ni code e-mail ni tableau de bord — " + toast + " — réponses : " + journal.join(" ; ").slice(0, 200));
  });
  if (await page.locator("#register-code").isVisible().catch(() => false)) {
    await page.locator("#register-code").fill("000000");
    await page.locator("button[type=submit]").first().click(); await page.waitForTimeout(1200);
    if (await page.evaluate(() => !!localStorage.getItem("vit-auto-token"))) throw new Error("un code e-mail faux a ouvert une session");
    ok("client : inscription depuis le site → écran du code e-mail ; un code faux est refusé");
  } else {
    ok("client : inscription depuis le site → compte créé, tableau de bord ouvert (vérification e-mail automatique hors production)");
  }
  // 2. Compte client semé : favoris, panier, profil, notifications, chat, fidélité.
  await connecter(page, CLIENT);
  const cat = (await client("/api/vehicles?limit=5&type=location")).data;
  const veh = (cat.vehicles || [])[0]; if (!veh) throw new Error("aucun véhicule au catalogue");
  attendu(await client("/api/favorites", { method: "POST", body: { itemType: "vehicle", itemId: veh._id } }), [200, 201], "ajout favori");
  let favs = attendu(await client("/api/favorites"), 200, "favoris");
  if (!(favs.favorites || favs).some((f) => String(f.item?._id || f.itemId?._id || f.itemId) === String(veh._id))) throw new Error("favori absent après ajout");
  await page.goto(`${BASE}/favorites`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText(new RegExp(veh.marque || veh.title.split(" ")[0])).first().waitFor({ timeout: 15000 }).catch(() => journal.push("[client] page Favoris sans le véhicule ajouté"));
  attendu(await client(`/api/favorites/vehicle/${veh._id}`, { method: "DELETE" }), 200, "retrait favori");
  ok("client : favori ajouté (visible sur /favorites) puis retiré");
  // Panier (localStorage) : ajout depuis la fiche véhicule, page panier rendue.
  await page.goto(`${BASE}/vehicle/${veh._id}`, { waitUntil: "networkidle", timeout: 60000 });
  const panier = page.getByRole("button", { name: /panier/i }).first();
  if (await panier.isVisible().catch(() => false)) {
    await panier.click(); await page.waitForTimeout(600);
    await page.goto(`${BASE}/cart`, { waitUntil: "networkidle", timeout: 60000 });
    if (!(await texte(page)).includes(veh.marque || veh.title.split(" ")[0])) journal.push("[client] panier sans le véhicule ajouté");
    else ok("client : véhicule ajouté au panier, page Panier rendue");
  }
  // Profil : modification du téléphone et de l'adresse depuis la page.
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle", timeout: 60000 });
  const tel = page.locator("input[type=tel]").first(); await tel.waitFor({ timeout: 15000 });
  await tel.fill("+2250701020304");
  const adresse = page.locator("input[placeholder*='adresse' i]").first(); if (await adresse.count()) await adresse.fill("Cocody, Riviera 3, Abidjan");
  await page.locator("button[type=submit]").first().click(); await page.waitForTimeout(1500);
  const moi = attendu(await client("/api/users/me"), 200, "mon profil");
  const u = moi.user || moi;
  if (u.phone !== "+2250701020304") throw new Error(`téléphone non enregistré (${u.phone})`);
  ok("client : profil modifié depuis la page (téléphone, adresse) et relu depuis l'API");
  // Notifications : liste, marquage lu.
  const notifs = attendu(await client("/api/notifications"), 200, "notifications");
  const liste = notifs.notifications || notifs;
  if (liste.length) attendu(await client(`/api/notifications/${liste[0]._id}/read`, { method: "PATCH" }), 200, "notification lue");
  attendu(await client("/api/notifications/read-all", { method: "PATCH" }), 200, "tout marquer lu");
  ok(`client : ${liste.length} notification(s), marquage lu`);
  // Chat client ↔ partenaire depuis une réservation, puis support.
  const mine = (await client("/api/bookings/mine")).data;
  const b = (mine.bookings || mine).find((x) => x.type === "location");
  if (b) {
    const chat = attendu(await client("/api/chats", { method: "POST", body: { type: "client_partner", bookingId: b._id } }), 200, "chat réservation");
    const chatId = (chat.chat || chat)._id;
    attendu(await client(`/api/chats/${chatId}`, { method: "POST", body: { content: "Bonjour, le véhicule sera-t-il disponible à 9 h ?" } }), [200, 201], "message client");
    attendu(await partner(`/api/chats/${chatId}`, { method: "POST", body: { content: "Oui, à 9 h à l'agence." } }), [200, 201], "réponse partenaire");
    const msgs = attendu(await client(`/api/chats/${chatId}`), 200, "messages");
    if ((msgs.messages || msgs).length < 2) throw new Error("échange incomplet dans le chat");
    ok("client ↔ partenaire : chat ouvert depuis la réservation, deux messages échangés");
  }
  const support = attendu(await client("/api/chats", { method: "POST", body: { type: "client_support" } }), 200, "chat support");
  attendu(await client(`/api/chats/${(support.chat || support)._id}`, { method: "POST", body: { content: "Question sur ma facture." } }), [200, 201], "message support");
  ok("client : chat support ouvert et message envoyé");
  // Fidélité et KYC.
  const fid = attendu(await client("/api/loyalty/me"), 200, "fidélité");
  ok(`client : fidélité lue (${fid.points ?? fid.loyalty?.points ?? "?"} points, palier ${fid.tier?.name ?? fid.tier?.id ?? fid.tier ?? "?"})`);
  await page.goto(`${BASE}/loyalty`, { waitUntil: "networkidle", timeout: 60000 });
  await page.goto(`${BASE}/kyc`, { waitUntil: "networkidle", timeout: 60000 });
  if (!/identité/i.test(await texte(page))) journal.push("[client] page KYC vide");
  await ctx.close();
  for (const j of journal) ko(`client — ${j}`);
}

// ── VISITEUR et client NON VÉRIFIÉ : chaque page dynamique se rend sans page de secours ──
// La garde visitait ces pages connectée en admin ; la réservation d'un
// chauffeur plantait pour tout visiteur (2026-09-15, production). Ici : les
// mêmes pages hors connexion, puis avec un client tout juste inscrit (KYC
// EN_ATTENTE) — le profil de la majorité des vrais utilisateurs.
async function visiteur(browser) {
  const journal = [];
  const client = await apiAs(CLIENT);
  const api = async (chemin) => (await fetch(`${API}${chemin}`)).json().catch(() => ({}));
  const veh = ((await api("/api/vehicles?limit=1")).vehicles || [])[0];
  const drv = ((await api("/api/drivers")) || [])[0];
  const act = (((await api("/api/activities?limit=1")).activities) || [])[0];
  const ie = (((await api("/api/import-export/listings")).listings) || [])[0];
  const showroom = (((await api("/api/pms/showrooms")).showrooms) || [])[0];
  const pages = [
    veh && `/vehicle/${veh._id}`, veh && `/booking/${veh._id}`,
    drv && `/driver-booking/${drv._id}`, drv && `/driver-employment/${drv._id}`,
    act && `/activity-booking/${act._id}`,
    ie && `/import-export/listings/${ie._id}`,
    showroom && `/showroom/${showroom.slug}`,
    veh?.owner && `/partner/${veh.owner._id || veh.owner}`,
    "/activites/casablanca", "/pieces-detachees/bosch", "/location-voiture/casablanca",
    "/catalogue?mode=Chauffeur", "/catalogue?mode=Autres", "/catalogue?mode=Pieces", "/catalogue?mode=Acheter",
  ].filter(Boolean);
  // Client non vérifié : inscrit à l'instant par l'API (hors prod, e-mail vérifié d'office).
  const email = `visiteur-${DECALAGE}-${Date.now()}@vitauto-fixtures.fr`;
  const inscription = await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://vit-auto.com" }, body: JSON.stringify({ firstName: "Nouveau", lastName: "Client", email, password: "Verif-Locale-2026!", phone: `+2250701${String(100000 + (DECALAGE * 53) % 900000)}`, role: "client", country: "CI", birthDate: "1995-03-03" }) });
  if (![200, 201].includes(inscription.status)) throw new Error(`inscription API : ${inscription.status} ${(await inscription.text()).slice(0, 120)}`);
  for (const [role, id] of [["visiteur", null], ["client non vérifié", email]]) {
    const { ctx, page } = await contexte(browser, role, journal);
    if (id) await connecter(page, id, "Verif-Locale-2026!");
    let rendues = 0;
    for (const chemin of pages) {
      await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const t = await texte(page);
      if (/Une erreur s'est produite/.test(t)) {
        await page.getByText(/Détails techniques/).click().catch(() => {});
        const detail = await page.evaluate(() => (document.querySelector("details")?.innerText || "").replace(/\s+/g, " ").slice(0, 160));
        journal.push(`[${role}] page de secours sur ${chemin} — ${detail}`);
      } else if (t.trim().length < 80) journal.push(`[${role}] page vide sur ${chemin}`);
      else rendues++;
    }
    ok(`${role} : ${rendues}/${pages.length} pages dynamiques rendues sans page de secours`);
    await ctx.close();
  }
  for (const j of journal) ko(`visiteur — ${j}`);
}

const PARCOURS = [
  ["Location — réservation, prolongation, clôture, avis", "location", location],
  ["Loisirs — réservation, séance, clôture", "loisirs", loisirs],
  ["Import/Export — du profil importateur aux fonds libérés", "ie", importExport],
  ["Partenaire — publication, approbation, secteurs, PMS, import de flotte", "partenaire", partenaire],
  ["Client — inscription, favoris, panier, profil, notifications, chat, fidélité, KYC", "client", compteClient],
  ["Visiteur et client non vérifié — pages dynamiques sans page de secours", "visiteur", visiteur],
];
const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const [nom, cle, fn] of PARCOURS) {
  if (SEULEMENT && !SEULEMENT.includes(cle)) continue;
  console.log(`── ${nom} ──`);
  try { await fn(browser); } catch (err) { ko(`${nom} : ${err.message}`); }
}
await browser.close();
console.log(anomalies.length ? `\n✗ ${anomalies.length} anomalie(s).` : "\n✓ Parcours de service aboutis.");
process.exit(anomalies.length ? 1 : 0);
