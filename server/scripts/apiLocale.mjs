/**
 * API LOCALE POUR LA GARDE AVANT PUSH — aucune dépendance à la production.
 *
 * POURQUOI
 * La garde (`.githooks/pre-push`) exerçait le paquet construit contre l'API
 * de PRODUCTION. Deux défauts constatés le 2026-09-12 :
 *   • le limiteur du catalogue (200 requêtes / 5 min / IP) prend deux
 *     vérifications rapprochées pour du trafic abusif → 429 signalés comme
 *     anomalies, push refusé à tort ;
 *   • un push qui AJOUTE des routes serveur voit des 404 tant que Render n'a
 *     pas redéployé — il fallait pousser en deux fois, serveur puis front.
 * Et, plus fondamental : une vérification ne devrait jamais dépendre de l'état
 * d'un service distant, ni se connecter avec le vrai compte administrateur.
 *
 * CE QUE FAIT CE SCRIPT
 *   1. démarre un MongoDB en mémoire (replica set à un membre, comme les tests :
 *      les transactions des réservations l'exigent) ;
 *   2. y sème un jeu de données MINIMAL mais suffisant pour que chaque écran ait
 *      quelque chose à afficher — un administrateur aux identifiants connus,
 *      deux partenaires, des annonces avec de vraies photos publiques du CDN,
 *      des activités, un client avec une pièce d'identité en attente ;
 *   3. lance `node server.js` en processus enfant, tous les services externes
 *      (Redis, Resend, Stripe, Sentry, Twilio, ImageKit…) désactivés ;
 *   4. attend /api/health, écrit « prêt », et vit jusqu'au SIGTERM.
 *
 * Usage :  node server/scripts/apiLocale.mjs        (port 5001 par défaut)
 *          PORT_API=5002 node server/scripts/apiLocale.mjs
 *
 * Identifiants de l'administrateur semé (fixes, connus, SANS valeur en dehors
 * de cette base jetable) : voir ADMIN ci-dessous — la garde les utilise, elle
 * n'a plus besoin du mot de passe de l'administrateur de production.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RACINE_SERVEUR = join(__dirname, "..");
const PORT = Number(process.env.PORT_API || 5001);

export const ADMIN = { email: "admin@vitauto-fixtures.fr", password: "Verification-Locale-2026!" };

// ── Environnement : rien de réel, tout de vérifiable ──────────────────────
const ENV = {
  ...process.env,
  // "test" : c'est l'environnement de toute la suite serveur — limiteurs de
  // débit désactivés (toutes les requêtes viennent de 127.0.0.1 via le relais),
  // aucun service externe, aucun envoi.
  NODE_ENV: "test",
  PORT: String(PORT),
  JWT_SECRET: "verification-locale-jwt-secret-suffisamment-long-pour-passer-le-controle-de-longueur-64",
  REFRESH_TOKEN_SECRET: "verification-locale-refresh-secret-suffisamment-long-pour-le-controle-64-caracteres",
  FIELD_ENCRYPTION_KEY: "d31b4c3c30b59f3cc420e6d16a5429f3ecf6fdfbbb09e5b1fb95809d5a92e0c6",
  PAYMENTS_ENABLED: "true",
  APP_URL: "https://vit-auto.com",
  CLIENT_URL: "https://vit-auto.com",
  // CORS : le relais du serveur de vérification se présente avec l'origine du
  // site (voir servirAvecCsp.mjs) — la même allowlist qu'en production.
  FRONTEND_URL: "https://vit-auto.com",
};
for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "REDIS_URL", "SENTRY_DSN",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "WHATSAPP_TOKEN", "IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY", "ANTHROPIC_API_KEY",
  "GOOGLE_OAUTH_CLIENT_ID", "FCM_SERVICE_ACCOUNT"]) ENV[k] = "";

// Photos PUBLIQUES du CDN de production : le navigateur de la garde les charge
// depuis ImageKit, pas depuis l'API — aucun appel à la production.
const PHOTOS = [
  "https://ik.imagekit.io/vitauto/vit-auto/vehicles/horent/volkswagentouareg_jWzk7LvCY.jpg",
  "https://ik.imagekit.io/vitauto/vit-auto/vehicles/horent/kiacarens_WM0LwPtgt.jpg",
];
const PHOTOS_LOISIRS = [
  "https://ik.imagekit.io/vitauto/vit-auto/activities/nemo_diving_02_3UoNSpc5c.webp",
  "https://ik.imagekit.io/vitauto/vit-auto/activities/nemo_diving_20_qIi7RxaMW.webp",
];

async function semer(uri) {
  process.env.MONGO_URI = uri;
  Object.assign(process.env, { JWT_SECRET: ENV.JWT_SECRET, REFRESH_TOKEN_SECRET: ENV.REFRESH_TOKEN_SECRET, FIELD_ENCRYPTION_KEY: ENV.FIELD_ENCRYPTION_KEY });
  await mongoose.connect(uri);
  const { createUser, createVehicleDoc, createActivityDoc, makeTestPartnerBusiness } = await import("../tests/helpers/fixtures.js");

  const admin = await createUser({ role: "admin", email: ADMIN.email, password: await bcrypt.hash(ADMIN.password, 10),
    emailVerified: true, firstName: "Admin", lastName: "Vérification", adminScope: ["super_admin"], country: "MA" });

  const partenaires = [];
  for (const [i, nom] of ["Atlas Location", "Médina Cars"].entries()) {
    const p = await createUser({ role: "partenaire", email: `partenaire${i + 1}@vitauto-fixtures.fr`, emailVerified: true,
      firstName: nom, lastName: "SARL", country: "MA", kycStatus: "VERIFIE" });
    try { await makeTestPartnerBusiness(p._id, { companyName: nom }); } catch { /* signature différente : sans entité */ }
    partenaires.push(p);
  }

  const modeles = [["Toyota", "Corolla"], ["Dacia", "Duster"], ["Renault", "Clio"], ["Hyundai", "Tucson"],
    ["Kia", "Sportage"], ["Peugeot", "208"], ["Volkswagen", "Touareg"], ["Mercedes", "Classe C"]];
  const vehicules = [];
  for (const [i, [marque, modele]] of modeles.entries()) {
    vehicules.push(await createVehicleDoc({
      owner: partenaires[i % 2]._id, marque, modele, annee: 2020 + (i % 5), title: `${marque} ${modele} ${2020 + (i % 5)}`,
      type: i < 6 ? "location" : "vente", pricePerDay: i < 6 ? 25 + i * 5 : undefined, priceForSale: i >= 6 ? 12000 + i * 1000 : undefined,
      currency: "MAD", ville: i % 2 ? "Casablanca" : "Marrakech", country: "MA",
      images: [PHOTOS[i % 2], PHOTOS[(i + 1) % 2]], thumbnail: PHOTOS[i % 2], carburant: "Essence", transmission: "Automatique",
      featured: i < 3, description: "Véhicule de démonstration pour la vérification locale.",
    }));
  }

  // Demandes d'essai (vente par prospect, docs/vente-demande-essai.md) à trois
  // stades, pour que « Mes opportunités » (partenaire) et « Leads vente »
  // (admin) ne soient pas vérifiés à vide. Créées par le service lui-même :
  // historique, jalons et commission sont ceux de la production.
  const lead = await import("../services/salesLeadService.js");
  const enVente = vehicules.filter((v) => v.type === "vente");
  const dans = (j) => new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);
  const demande = async (vehicle, extra = {}) => (await lead.createLead({
    vehicleId: vehicle._id.toString(), source: "SYSTEM",
    body: { firstName: "Awa", lastName: "Koné", phone: `+2126000000${extra.n || 1}`, city: "Casablanca", country: "MA",
      date: dans(3), slot: "morning", message: "Disponible le matin.", consent: true, ...extra },
  })).lead;
  // Prix ≥ 15 000 USD → niveau 2, en qualification chez VIT AUTO : le premier
  // y reste (bandeau « À qualifier »), les deux autres sont validés par l'admin.
  await demande(enVente[0], { n: 1 });
  const l2 = await demande(enVente[1], { n: 2 });
  await lead.adminQualify(l2, { actorId: admin._id, transmit: true });
  await lead.partnerAccept(l2, { actorId: partenaires[1]._id, time: "10:00", address: "Agence Médina Cars, Casablanca" });
  const l3 = await demande(enVente[0], { n: 3, firstName: "Yacine", lastName: "B." });
  await lead.adminQualify(l3, { actorId: admin._id, transmit: true });
  await lead.partnerAccept(l3, { actorId: partenaires[0]._id, time: "15:00", address: "Agence Atlas, Marrakech" });
  await lead.reportOutcome(l3, { actorId: partenaires[0]._id, testDrive: "completed", commercial: "negotiation" });
  await lead.declareSale(l3, { actorId: partenaires[0]._id, finalPrice: 17500, currency: "USD" });

  for (let i = 0; i < 4; i++) {
    await createActivityDoc({ owner: partenaires[i % 2]._id, activityType: i % 2 ? "QUAD" : "PLONGEE",
      title: i % 2 ? `Sortie quad ${i + 1}` : `Baptême de plongée ${i + 1}`, price: 40 + i * 10, priceUnit: "per_person",
      images: [PHOTOS_LOISIRS[i % 2]], ville: "Marrakech", country: "MA", description: "Activité de démonstration." });
  }

  await createUser({ role: "client", email: "client@vitauto-fixtures.fr", emailVerified: true, firstName: "Client", lastName: "Démo", country: "CI",
    identity: { type: "cni", number: "CI-DEMO-1", status: "pending", submittedAt: new Date(), frontImage: PHOTOS[0], selfie: PHOTOS[1] } });

  // Configuration tarifaire : document singleton (key "global") que la
  // production possède et que le panneau lit — sans lui, 404 sur l'onglet
  // Configuration métier. Semée depuis la configuration par défaut du dépôt.
  const { default: PricingConfig } = await import("../models/PricingConfig.js");
  const { DEFAULT_PRICING_CONFIG } = await import("../config/defaultPricingConfig.js");
  await PricingConfig.findOneAndUpdate({ key: "global" }, { $setOnInsert: { key: "global", ...DEFAULT_PRICING_CONFIG } }, { upsert: true });

  await mongoose.disconnect();
}

async function attendre(url, essais = 60) {
  for (let i = 0; i < essais; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = mongod.getUri();
await semer(uri);

const enfant = spawn(process.execPath, ["server.js"], { cwd: RACINE_SERVEUR, env: { ...ENV, MONGO_URI: uri }, stdio: ["ignore", "pipe", "pipe"] });
enfant.stdout.on("data", (d) => { if (process.env.API_LOCALE_VERBEUX) process.stdout.write(d); });
enfant.stderr.on("data", (d) => { if (process.env.API_LOCALE_VERBEUX || /error|Error/.test(String(d))) process.stderr.write(d); });

const arret = async () => { enfant.kill("SIGTERM"); await mongod.stop().catch(() => {}); process.exit(0); };
process.on("SIGTERM", arret); process.on("SIGINT", arret);
enfant.on("exit", (code) => { console.error(`API locale : le serveur s'est arrêté (code ${code})`); mongod.stop().finally(() => process.exit(1)); });

if (await attendre(`http://localhost:${PORT}/api/health`)) {
  console.log(`API locale prête sur ${PORT} — admin : ${ADMIN.email}`);
  // Ligne lisible par la garde (.githooks/pre-push) : les identifiants de
  // l'administrateur SEMÉ, sans valeur hors de cette base jetable.
  console.log(`VERIF_ADMIN_ID=${ADMIN.email} VERIF_ADMIN_PWD=${ADMIN.password}`);
} else {
  console.error("API locale : /api/health ne répond pas après 30 s");
  await arret();
}
