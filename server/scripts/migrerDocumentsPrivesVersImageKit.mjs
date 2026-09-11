/**
 * Sort les DOCUMENTS PRIVÉS stockés en base64 dans MongoDB vers les dossiers
 * privés d'ImageKit : pièces d'identité et permis (users), pièces
 * justificatives des importateurs, documents d'entreprise de l'onboarding.
 *
 * POURQUOI
 * Mesuré en production le 2026-09-11 : un dossier KYC pèse 8 à 12 Mo, sa
 * lecture depuis Atlas prend 90 à 130 s, et la fiche admin échoue en 500 avant
 * la fin — l'administrateur ne peut examiner AUCUN des dossiers en attente.
 * La collection `users` pèse 43 Mo pour 33 comptes ; ses tris sans index
 * dépassaient déjà le plafond de 32 Mo de MongoDB.
 *
 * PRIVÉ, ET VÉRIFIÉ
 * Ces documents partent dans des dossiers PRIVÉS (`uploadDocument` pose
 * `isPrivateFile`) : ils ne sont lisibles que par URL signée, valable
 * 15 minutes, apposée à la réponse par utils/signerDocuments.js. Le script
 * VÉRIFIE cette propriété pour chaque fichier avant de réécrire la base :
 * l'URL signée doit répondre 200 et l'URL nue doit être refusée. Un fichier
 * qui serait lisible sans signature bloque la migration de son document.
 *
 * CHIFFREMENT
 * `identity.*` et `driverLicenseOcr.*` sont chiffrés au repos (AES-256-GCM,
 * voir utils/fieldEncryption.js). Le script déchiffre pour téléverser, puis
 * stocke l'URL CHIFFRÉE, comme le fait kycController à la soumission. Il exige
 * donc FIELD_ENCRYPTION_KEY = la clé de PRODUCTION ; une valeur qui ne se
 * déchiffre pas est laissée intacte et signalée, jamais écrasée.
 *
 * SÛRETÉ
 *   • originaux écrits sur disque AVANT chaque réécriture (--sauvegarde=) ;
 *   • un document n'est réécrit que si TOUS ses champs ont été téléversés et
 *     vérifiés — jamais partiellement ;
 *   • idempotent : une valeur déjà en URL n'est pas retouchée ;
 *   • un document à la fois — charger 43 Mo d'un coup reproduirait en local
 *     la panne qu'on corrige ;
 *   • simulation par défaut.
 *
 * Usage :
 *   FIELD_ENCRYPTION_KEY=<clé prod> node scripts/migrerDocumentsPrivesVersImageKit.mjs
 *   … --apply            exécution
 *   … --limit=1          un seul document (rodage)
 *   … --cible=users      une seule collection (users | importateurs | onboarding)
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });
dotenv.config();

import { uploadDocument, signedDocumentUrl, isImageKitConfigured, FOLDERS } from "../config/imagekit.js";
import { encryptField, decryptField, isEncrypted } from "../utils/fieldEncryption.js";

const APPLY  = process.argv.includes("--apply");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || Infinity;
const CIBLE  = process.argv.find((a) => a.startsWith("--cible="))?.split("=")[1] || null;
const SAUVEGARDE = process.argv.find((a) => a.startsWith("--sauvegarde="))?.split("=")[1]
  || join(__dirname, `../../sauvegarde-documents-prives-${new Date().toISOString().slice(0, 10)}.jsonl`);

const estBase64 = (v) => typeof v === "string" && v.startsWith("data:");
const Mo = (n) => (n / 1048576).toFixed(1) + " Mo";

// Chaque cible : collection, champs porteurs, dossier ImageKit, chiffrement.
const CIBLES = {
  users: {
    collection: "users",
    champs: ["identity.frontImage", "identity.backImage", "identity.selfie", "driverLicenseOcr.frontImage", "driverLicenseOcr.backImage"],
    dossier: FOLDERS.kyc,
    chiffre: true,
  },
  importateurs: {
    collection: "importerpartnerprofiles",
    champs: ["documents.rccmImage", "documents.taxIdImage", "documents.licenseImage", "documents.companyLogo", "documents.bankStatement", "documents.otherDoc"],
    dossier: FOLDERS.docs,
    chiffre: false,
  },
  onboarding: {
    collection: "partneronboardings",
    champs: ["individualDoc.file", "legalDocs.businessRegistration", "legalDocs.businessLicense", "legalDocs.exportLicense",
             "legalDocs.taxCertificate", "legalDocs.proofOfAddress", "legalDocs.companyPresentation"],
    dossier: FOLDERS.docs,
    chiffre: false,
  },
};

const lire  = (doc, chemin) => chemin.split(".").reduce((o, k) => (o == null ? undefined : o[k]), doc);

// Un fichier privé doit être lisible SIGNÉ et refusé NU. Les deux sont vérifiés :
// le premier prouve que le document est consultable, le second qu'il ne l'est
// que par nous.
async function verifierConfidentialite(url) {
  const [signe, nu] = await Promise.all([
    fetch(signedDocumentUrl(url), { method: "HEAD" }).then((r) => r.status).catch(() => 0),
    fetch(url, { method: "HEAD" }).then((r) => r.status).catch(() => 0),
  ]);
  return { ok: signe === 200 && nu !== 200, signe, nu };
}

async function migrerCible(nom, cfg, db) {
  const coll = db.collection(cfg.collection);
  // Sélection par le préfixe des valeurs : base64 en clair OU chiffré (le
  // chiffré peut contenir n'importe quoi, on tranchera après déchiffrement).
  const filtre = { $or: cfg.champs.flatMap((c) => [{ [c]: /^data:/ }, ...(cfg.chiffre ? [{ [c]: /^enc:v1:/ }] : [])]) };
  const ids = await coll.find(filtre, { projection: { _id: 1 } }).toArray();
  console.log(`\n═══ ${nom} (${cfg.collection}) — ${ids.length} document(s) candidat(s) ═══`);

  let traites = 0, fichiers = 0, octets = 0, intacts = 0;
  for (const { _id } of ids.slice(0, LIMITE === Infinity ? undefined : LIMITE)) {
    const projection = Object.fromEntries(cfg.champs.map((c) => [c, 1]));
    const doc = await coll.findOne({ _id }, { projection: { ...projection, email: 1, companyName: 1 } });
    const libelle = doc.email || doc.companyName || String(_id);
    const maj = {}, original = {};
    let complet = true, poids = 0;

    for (const champ of cfg.champs) {
      const stocke = lire(doc, champ);
      if (!stocke) continue;
      let clair = stocke;
      if (cfg.chiffre && isEncrypted(stocke)) {
        clair = decryptField(stocke);
        if (clair == null) { console.log(`  ⚠️  ${libelle} — ${champ} : indéchiffrable avec cette clé, laissé intact`); complet = false; break; }
      }
      if (!estBase64(clair)) continue;                    // déjà une URL, ou autre chose : intact
      poids += stocke.length;
      original[champ] = stocke;

      if (!APPLY) { maj[champ] = "«téléversement simulé»"; fichiers++; continue; }

      const r = await uploadDocument(clair, cfg.dossier, `${nom}_${_id}_${champ.replace(/\./g, "_")}`);
      if (!r?.url) { console.log(`  ⚠️  ${libelle} — ${champ} : téléversement échoué`); complet = false; break; }
      const conf = await verifierConfidentialite(r.url);
      if (!conf.ok) {
        console.log(`  ⛔ ${libelle} — ${champ} : confidentialité NON vérifiée (signé ${conf.signe}, nu ${conf.nu}) — document laissé intact`);
        complet = false; break;
      }
      maj[champ] = cfg.chiffre ? encryptField(r.url) : r.url;
      fichiers++;
    }

    if (!Object.keys(maj).length) continue;
    if (!complet) { intacts++; continue; }

    if (APPLY) {
      fs.appendFileSync(SAUVEGARDE, JSON.stringify({ collection: cfg.collection, _id: String(_id), champs: original }) + "\n");
      await coll.updateOne({ _id }, { $set: maj });
    }
    traites++; octets += poids;
    console.log(`  ✅ ${libelle.padEnd(36)} ${Object.keys(maj).length} fichier(s)  ${Mo(poids)}`);
  }
  console.log(`  → ${traites} document(s), ${fichiers} fichier(s), ${Mo(octets)} sortis de la base${intacts ? `, ${intacts} laissé(s) intact(s)` : ""}`);
  return { traites, fichiers, octets, intacts };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI absent");
  if (!process.env.FIELD_ENCRYPTION_KEY) throw new Error("FIELD_ENCRYPTION_KEY absente — la clé de PRODUCTION est requise");
  if (APPLY && !isImageKitConfigured()) throw new Error("ImageKit non configuré");
  await mongoose.connect(process.env.MONGO_URI);
  console.log(APPLY ? `MODE RÉEL — originaux sauvegardés dans ${SAUVEGARDE}` : "SIMULATION — aucune écriture");

  const total = { traites: 0, fichiers: 0, octets: 0, intacts: 0 };
  for (const [nom, cfg] of Object.entries(CIBLES)) {
    if (CIBLE && CIBLE !== nom) continue;
    const r = await migrerCible(nom, cfg, mongoose.connection.db);
    for (const k of Object.keys(total)) total[k] += r[k];
  }
  console.log(`\nTOTAL : ${total.traites} document(s), ${total.fichiers} fichier(s), ${Mo(total.octets)} sortis de la base${total.intacts ? `, ${total.intacts} laissé(s) intact(s)` : ""}`);
  if (!APPLY) console.log("Simulation terminée. Relancer avec --apply pour écrire.");
  await mongoose.disconnect();
}

main().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
