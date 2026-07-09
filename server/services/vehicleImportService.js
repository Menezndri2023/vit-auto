import ExcelJS from "exceljs";
import dns from "node:dns/promises";
import net from "node:net";
import { parse as parseCsvSync } from "csv-parse/sync";
import logger from "../utils/logger.js";
import Vehicle from "../models/Vehicle.js";
import Notification from "../models/Notification.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import { scoreAnnonce, buildVehicleWhitelist } from "./vehicleScoring.js";
import { dispatch } from "../queue/index.js";
import { uploadImage, isAvailable as imageKitAvailable } from "../config/imagekit.js";

export const MAX_IMPORT_ROWS = 300;

// ── Colonnes du template (ordre = ordre dans le fichier) ────────────────────
export const IMPORT_COLUMNS = [
  { key: "title",                header: "Titre",                 example: "Toyota Corolla 2020 - Automatique" },
  { key: "marque",                header: "Marque",                example: "Toyota" },
  { key: "modele",                header: "Modele",                example: "Corolla" },
  { key: "annee",                 header: "Annee",                 example: 2020 },
  { key: "couleur",               header: "Couleur",               example: "Gris" },
  { key: "kilometrage",           header: "Kilometrage",           example: 45000 },
  { key: "etat",                  header: "Etat",                  example: "Bon état" },
  { key: "type",                  header: "TypeAnnonce",           example: "location" },
  { key: "vehicleType",           header: "CategorieVehicule",     example: "Berline" },
  { key: "carburant",             header: "Carburant",             example: "Essence" },
  { key: "transmission",          header: "Transmission",          example: "Automatique" },
  { key: "nombrePlaces",          header: "NombrePlaces",          example: 5 },
  { key: "nombrePortes",          header: "NombrePortes",          example: 4 },
  { key: "climatisation",         header: "Climatisation",         example: "oui" },
  { key: "withDriver",            header: "AvecChauffeur",         example: "non" },
  { key: "pricePerDay",           header: "PrixParJour",           example: 25000 },
  { key: "priceForSale",          header: "PrixVente",             example: "" },
  { key: "caution",               header: "Caution",               example: 100000 },
  { key: "ageMin",                header: "AgeMinimum",            example: 21 },
  { key: "permisRequis",          header: "PermisRequis",          example: "oui" },
  { key: "assuranceOptionnelle",  header: "AssuranceOptionnelle",  example: "oui" },
  { key: "contactNom",            header: "NomContact",            example: "Jean Kouassi" },
  { key: "contactTel",            header: "TelephoneContact",      example: "0700000000" },
  { key: "ville",                 header: "Ville",                 example: "Abidjan" },
  { key: "adresse",               header: "Adresse",                example: "Cocody, Riviera" },
  { key: "description",           header: "Description",           example: "Véhicule bien entretenu, révisions à jour, climatisation fonctionnelle." },
  { key: "imageUrls",             header: "PhotosURLs",            example: "https://exemple.com/photo1.jpg,https://exemple.com/photo2.jpg" },
];

const BOOLEAN_KEYS = ["climatisation", "withDriver", "permisRequis", "assuranceOptionnelle"];
const NUMBER_KEYS  = ["annee", "kilometrage", "nombrePlaces", "nombrePortes", "pricePerDay", "priceForSale", "caution", "ageMin"];

// Valeurs acceptées par les enums du modèle Vehicle — une saisie CSV/Excel est bien
// moins contrôlée qu'un <select> du formulaire manuel (casse différente, typo...).
// On normalise en comparaison insensible à la casse plutôt que de laisser
// Vehicle.create() planter avec une erreur Mongoose brute.
const ENUM_FIELDS = {
  type:         ["location", "vente"],
  etat:         ["Neuf", "Comme neuf", "Bon état", "À réparer"],
  vehicleType:  ["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"],
  carburant:    ["Essence", "Diesel", "Hybride", "Électrique", "GPL"],
  transmission: ["Automatique", "Manuelle"],
};

const normalizeEnumValue = (value, allowed) => {
  if (value === undefined) return undefined;
  return allowed.find((a) => a.toLowerCase() === String(value).trim().toLowerCase());
};

const parseBool = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  return ["oui", "yes", "true", "1"].includes(String(v).trim().toLowerCase());
};

const parseNumber = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

// ── Génère le classeur template téléchargeable ──────────────────────────────
export async function generateTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Véhicules");
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.addRow(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.example])));
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

// ── Parse un fichier uploadé (CSV ou Excel) en lignes brutes {header: value} ─
export async function parseUploadedFile(buffer, fileName = "") {
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  if (ext === "csv") {
    return parseCsvSync(buffer, { columns: true, skip_empty_lines: true, trim: true });
  }

  // .xlsx / .xls
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1).values; // index 0 vide (ExcelJS 1-based)
  const headers = headerRow.slice(1).map((h) => String(h || "").trim());

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // en-têtes
    const values = row.values.slice(1);
    const isEmpty = values.every((v) => v === null || v === undefined || v === "");
    if (isEmpty) return;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i]; });
    rows.push(obj);
  });
  return rows;
}

// ── Parse une feuille Google Sheet publiée (lien "Anyone with the link") ────
export async function parseGoogleSheetUrl(url) {
  const match = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("URL Google Sheet invalide.");
  const sheetId = match[1];
  const gidMatch = String(url).match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  const res = await fetchWithTimeout(exportUrl, IMAGE_FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error("Impossible de lire la feuille Google Sheet. Vérifiez qu'elle est partagée en \"Lecture pour toute personne disposant du lien\".");
  }
  const text = await res.text();
  return parseCsvSync(text, { columns: true, skip_empty_lines: true, trim: true });
}

// ── Mappe une ligne brute (en-têtes du template) vers les champs Vehicle ────
export function mapRowToVehicleInput(rawRow) {
  const byHeader = {};
  for (const col of IMPORT_COLUMNS) {
    byHeader[col.key] = rawRow[col.header] ?? rawRow[col.key];
  }

  const data = {};
  const rowWarnings = [];
  for (const col of IMPORT_COLUMNS) {
    const key = col.key;
    if (key === "imageUrls") continue;
    let value = byHeader[key];
    if (BOOLEAN_KEYS.includes(key)) value = parseBool(value);
    else if (NUMBER_KEYS.includes(key)) value = parseNumber(value);
    else if (typeof value === "string") value = value.trim();

    if (ENUM_FIELDS[key] && value !== undefined && value !== "") {
      const normalized = normalizeEnumValue(value, ENUM_FIELDS[key]);
      if (!normalized && key !== "type") {
        // Champs secondaires : on ignore la valeur non reconnue plutôt que de faire échouer la ligne
        rowWarnings.push(`Valeur "${value}" non reconnue pour "${col.header}" — ignorée (valeurs acceptées : ${ENUM_FIELDS[key].join(", ")})`);
        value = undefined;
      } else {
        value = normalized; // undefined si "type" invalide → détecté plus bas (champ obligatoire)
      }
    }

    if (value !== undefined && value !== "") data[key] = value;
  }

  const imageUrls = String(byHeader.imageUrls || "")
    .split(/[,;]/)
    .map((u) => u.trim())
    .filter(Boolean);

  return { data, imageUrls, rowWarnings };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const IMAGE_FETCH_TIMEOUT_MS = 10_000;

// Bloque les IP privées/réservées (RFC1918, loopback, link-local incl. 169.254.169.254
// métadonnées cloud) pour empêcher qu'une "URL de photo" fournie dans un import CSV
// serve de primitive SSRF vers le réseau interne.
const isPrivateOrReservedIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true;                     // loopback
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 169 && b === 254) return true;          // link-local (dont métadonnées cloud)
    if (a === 0) return true;                         // 0.0.0.0/8
    if (a >= 224) return true;                        // multicast/réservé
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;                 // loopback
    if (lower.startsWith("fe80:")) return true;        // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
    if (lower.startsWith("::ffff:")) {                 // IPv4 mappée en IPv6
      const mapped = lower.split(":").pop();
      if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true; // ni IPv4 ni IPv6 valide → refuser par prudence
};

// Ne fetch que des URLs http/https dont le nom d'hôte résout vers une IP publique.
// Note : vérification faite au moment du fetch (pas de pinning de l'IP résolue),
// donc une protection complète contre le DNS rebinding nécessiterait une lib dédiée.
const isFetchableUrl = async (url) => {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const hostname = u.hostname;
  if (net.isIP(hostname)) return !isPrivateOrReservedIp(hostname);

  try {
    const { address } = await dns.lookup(hostname);
    return !isPrivateOrReservedIp(address);
  } catch {
    return false; // hôte non résolvable → refuser par prudence
  }
};

// Suit les redirections manuellement en revalidant chaque URL intermédiaire via
// isFetchableUrl — fetch() en mode "follow" suivrait un 3xx vers une IP privée
// sans jamais repasser par la vérification DNS/IP (bypass du filtre SSRF ci-dessus).
async function fetchWithTimeout(url, timeoutMs, maxRedirects = 5) {
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isFetchableUrl(currentUrl))) {
      throw new Error("URL non autorisée (IP privée/réservée ou hôte non résolvable).");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(currentUrl, { signal: controller.signal, redirect: "manual" });
    } finally {
      clearTimeout(timer);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error("Trop de redirections.");
}

// Budget global pour le téléchargement d'images sur un batch entier — évite qu'un
// import de 300 lignes x 8 images distantes lentes ne bloque un worker (ou la requête
// HTTP synchrone en fallback sans Redis) pendant des heures.
const IMAGE_FETCH_BUDGET_MS = 5 * 60 * 1000;

// ── Traite une ligne du batch et retourne l'entrée de résultat à enregistrer ─
async function processImportRow(batch, rawRow, rowIndex, budgetDeadline) {
  let vehicleLabel = "";
  try {
    const { data, imageUrls, rowWarnings } = mapRowToVehicleInput(rawRow);
    data.contactTel = data.contactTel ? String(data.contactTel) : data.contactTel;
    vehicleLabel = [data.marque, data.modele, data.annee].filter(Boolean).join(" ") || `Ligne ${rowIndex}`;

    // ── Type d'annonce obligatoire (pas de valeur par défaut possible) ────
    if (!data.type) {
      return {
        rowIndex, status: "error", vehicleLabel,
        errors: ["Type d'annonce manquant ou invalide (attendu : location ou vente)"],
        warnings: rowWarnings,
      };
    }

    // ── Doublon (même règle que createVehicle) ───────────────────────────
    if (data.marque && data.modele && data.annee) {
      const existing = await Vehicle.findOne({
        owner:  batch.owner,
        marque: new RegExp(`^${escapeRegex(String(data.marque))}$`, "i"),
        modele: new RegExp(`^${escapeRegex(String(data.modele))}$`, "i"),
        annee:  Number(data.annee),
        status: { $ne: "rejected" },
      });
      if (existing) {
        return { rowIndex, status: "skipped_duplicate", vehicleLabel, errors: [], warnings: [`Véhicule déjà existant (annonce ${existing._id})`] };
      }
    }

    // ── Images : upload ImageKit depuis les URLs fournies ────────────────
    const images = [];
    if (imageUrls.length && imageKitAvailable() && Date.now() < budgetDeadline) {
      for (const url of imageUrls.slice(0, 8)) {
        if (Date.now() >= budgetDeadline) {
          rowWarnings.push("Budget de temps d'import dépassé — photos restantes ignorées pour cette ligne.");
          break;
        }
        if (!(await isFetchableUrl(url))) continue;
        try {
          const imgRes = await fetchWithTimeout(url, IMAGE_FETCH_TIMEOUT_MS);
          if (!imgRes.ok) continue;
          // Ne traiter que du contenu réellement identifié comme image par le serveur
          // distant (évite d'exfiltrer/uploader une réponse texte/JSON interne comme
          // si c'était une photo).
          const contentType = (imgRes.headers.get("content-type") || "").split(";")[0].trim();
          if (!contentType.startsWith("image/")) continue;
          const arrayBuf = await imgRes.arrayBuffer();
          if (arrayBuf.byteLength > 8 * 1024 * 1024) continue; // 8 Mo max par image
          const base64 = Buffer.from(arrayBuf).toString("base64");
          const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
          const uploaded = await uploadImage(`data:${contentType};base64,${base64}`, {
            fileName: `partner-import-${Date.now()}-${images.length}.${ext}`,
          });
          if (uploaded?.url) images.push(uploaded.url);
        } catch (imgErr) {
          logger.warn("Import véhicule — échec téléchargement image", { url, error: imgErr.message });
        }
      }
    }
    data.images = images;

    const validation = scoreAnnonce(data);
    validation.warnings = [...rowWarnings, ...validation.warnings];
    const whitelisted = buildVehicleWhitelist(data);

    const vehicle = await Vehicle.create({
      ...whitelisted,
      owner:              batch.owner,
      status:             validation.status,
      available:          validation.status === "approved",
      validationScore:    validation.score,
      validationErrors:   validation.errors,
      validationWarnings: validation.warnings,
      autoValidated:      true,
      rejectionReason:    validation.status === "rejected" ? validation.errors.join(". ") : null,
      vues: 0, noteMoyenne: 0, nombreAvis: 0,
    });

    dispatch.vehicleCreated(vehicle._id.toString()).catch(() => {});

    return {
      rowIndex,
      status: "created",
      vehicleId: vehicle._id,
      vehicleLabel,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  } catch (rowErr) {
    logger.error("Import véhicule — erreur ligne", { rowIndex, error: rowErr.message });
    return { rowIndex, status: "error", vehicleLabel, errors: [rowErr.message || "Erreur inconnue"], warnings: [] };
  }
}

// ── Traite un batch d'import — appelé par le worker ET en fallback synchrone ─
// Idempotent vis-à-vis des retries BullMQ : pendingRows est réduit ligne par ligne,
// donc une reprise après échec ne retraite jamais une ligne déjà enregistrée.
export async function processImportBatch(batchId) {
  const batch = await VehicleImportBatch.findById(batchId);
  if (!batch) return;

  const budgetDeadline = Date.now() + IMAGE_FETCH_BUDGET_MS;

  try {
    while (batch.pendingRows.length > 0) {
      const rawRow = batch.pendingRows[0];
      const rowIndex = batch.processedRows + 1;

      const result = await processImportRow(batch, rawRow, rowIndex, budgetDeadline);

      batch.results.push(result);
      batch.processedRows += 1;
      batch.pendingRows = batch.pendingRows.slice(1);
      await batch.save();
    }

    const hasErrors = batch.results.some((r) => r.status === "error");
    batch.status = hasErrors ? "completed_with_errors" : "completed";
    await batch.save();

    try {
      const created = batch.results.filter((r) => r.status === "created").length;
      const skipped = batch.results.filter((r) => r.status === "skipped_duplicate").length;
      const errored = batch.results.filter((r) => r.status === "error").length;
      await Notification.create({
        user: batch.owner,
        type: "system",
        titre: "📦 Import de flotte terminé",
        message: `${created} véhicule(s) créé(s), ${skipped} doublon(s) ignoré(s), ${errored} erreur(s).`,
        lien: "/vendor/dashboard",
      });
    } catch (notifErr) {
      logger.error("Notification import (non bloquant) :", notifErr.message);
    }
  } catch (fatalErr) {
    logger.error("Import véhicule — échec fatal du batch", { batchId, error: fatalErr.message });
    batch.status = "failed";
    batch.errorMessage = fatalErr.message || "Erreur inconnue pendant le traitement du batch.";
    await batch.save().catch(() => {});
    throw fatalErr;
  }
}
