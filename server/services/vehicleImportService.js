import ExcelJS from "exceljs";
import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { parse as parseCsvSync } from "csv-parse/sync";
import logger from "../utils/logger.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { scoreAnnonce, buildVehicleWhitelist } from "./vehicleScoring.js";
import { dispatch } from "../queue/index.js";
import { uploadImage, isAvailable as imageKitAvailable } from "../config/imagekit.js";
import { ensureImporterProfile } from "../utils/ensureImporterProfile.js";

// Demande explicite : plus de limite significative par import. On garde un
// plafond technique très large (jamais business) plutôt qu'un nombre
// littéralement infini — le corps JSON (20 Mo, voir server.js) et le budget
// de temps de téléchargement d'images du batch (IMAGE_FETCH_BUDGET_MS plus
// bas) restent des contraintes réelles indépendantes de ce chiffre.
export const MAX_IMPORT_ROWS = 5000;

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
  { key: "rentalDurationType",    header: "DureeLocation",         example: "les_deux" },
  { key: "conditionsLocation",    header: "ConditionsLocation",    example: "Kilométrage illimité, plein essence requis au retour." },
  { key: "conditionsVente",       header: "ConditionsVente",       example: "Garantie 3 mois pièces et main d'œuvre." },
  { key: "imageUrls",             header: "PhotosURLs",            example: "https://exemple.com/photo1.jpg,https://exemple.com/photo2.jpg" },
];

const BOOLEAN_KEYS = ["climatisation", "withDriver", "permisRequis", "assuranceOptionnelle"];
const NUMBER_KEYS  = ["annee", "kilometrage", "nombrePlaces", "nombrePortes", "pricePerDay", "priceForSale", "caution", "ageMin"];

// ── Alias d'en-têtes tolérés en plus du nom exact du template ───────────────
// Un partenaire ne recopie pas toujours l'en-tête exact du template (traduit,
// reformulé, avec espaces/apostrophes) — en particulier pour `type`, le SEUL
// champ sans valeur par défaut possible : si sa colonne n'est reconnue sous
// AUCUNE variante, 100% des lignes échouent avec "Type d'annonce manquant",
// symptôme exact remonté en production. Couvre les formulations les plus
// probables plutôt que d'exiger la correspondance exacte du template.
const HEADER_ALIASES = {
  // "Type" seul est délibérément EXCLU : trop générique, il entrait en collision
  // avec une colonne sans rapport dans un vrai fichier partenaire (ex. "Type" de
  // véhicule/carrosserie) — la colonne était alors "reconnue" à tort, mais ses
  // valeurs ne correspondaient jamais à location/vente : 100% des lignes
  // échouaient quand même, sans qu'aucun garde-fou ne le détecte. Bug réel
  // découvert en production, pas une hypothèse.
  type: ["TypeAnnonce", "Type Annonce", "Type d'annonce", "Type d’annonce", "Location/Vente", "Location Vente"],
  vehicleType: ["CategorieVehicule", "Categorie Vehicule", "Catégorie", "Categorie", "Type de véhicule", "Type Vehicule"],
  pricePerDay: ["PrixParJour", "Prix Par Jour", "Prix/Jour", "Prix journalier", "Prix location"],
  priceForSale: ["PrixVente", "Prix Vente", "Prix de vente"],
  ville: ["Ville"],
  adresse: ["Adresse"],
};

// Valeurs acceptées par les enums du modèle Vehicle — une saisie CSV/Excel est bien
// moins contrôlée qu'un <select> du formulaire manuel (casse différente, typo...).
// On normalise en comparaison insensible à la casse plutôt que de laisser
// Vehicle.create() planter avec une erreur Mongoose brute.
const ENUM_FIELDS = {
  type:               ["location", "vente"],
  etat:               ["Neuf", "Comme neuf", "Bon état", "À réparer"],
  vehicleType:        ["SUV", "Berline", "Sportif", "Citadine", "Monospace", "Pick-up", "Cabriolet", "Utilitaire"],
  carburant:          ["Essence", "Diesel", "Hybride", "Électrique", "GPL"],
  transmission:       ["Automatique", "Manuelle"],
  rentalDurationType: ["courte", "longue", "les_deux"],
};

// ── Colonnes du template — Import/Export (Founding Partners) ────────────────
// Champs et en-têtes distincts du template véhicules classique : destinés à
// ImportExportListing (pays source, disponibilité livraison, devise...) plutôt
// qu'au catalogue location/vente (Vehicle).
export const IE_IMPORT_COLUMNS = [
  { key: "title",         header: "Titre",              example: "Toyota Land Cruiser V8 Import Dubaï" },
  { key: "make",          header: "Marque",              example: "Toyota" },
  { key: "model",         header: "Modele",              example: "Land Cruiser" },
  { key: "year",          header: "Annee",               example: 2021 },
  { key: "mileage",       header: "Kilometrage",         example: 30000 },
  { key: "condition",     header: "Etat",                example: "occasion" },
  { key: "fuelType",      header: "Carburant",           example: "essence" },
  { key: "transmission",  header: "Transmission",        example: "automatique" },
  { key: "bodyType",      header: "Carrosserie",         example: "SUV" },
  { key: "color",         header: "Couleur",             example: "Blanc perle" },
  { key: "sourceCountry", header: "PaysOrigine",         example: "Émirats Arabes Unis" },
  { key: "sourceCity",    header: "VilleOrigine",        example: "Dubaï" },
  { key: "availableIn",   header: "DisponiblePourLivraison", example: "Côte d'Ivoire,Sénégal" },
  { key: "price",         header: "Prix",                example: 25000 },
  { key: "currency",      header: "Devise",              example: "EUR" },
  { key: "negotiable",    header: "PrixNegociable",      example: "non" },
  { key: "stockQty",      header: "Stock",               example: 1 },
  { key: "description",   header: "Description",         example: "Véhicule bien entretenu, révisions à jour, prêt à l'export." },
  { key: "imageUrls",     header: "PhotosURLs",          example: "https://exemple.com/photo1.jpg,https://exemple.com/photo2.jpg" },
];

const IE_BOOLEAN_KEYS = ["negotiable"];
const IE_NUMBER_KEYS  = ["year", "mileage", "price", "stockQty"];
const IE_LIST_KEYS    = ["availableIn"];

// Valeurs acceptées par les enums du modèle ImportExportListing.
const IE_ENUM_FIELDS = {
  fuelType:     ["essence", "diesel", "hybride", "hybride_rechargeable", "electrique", "gpl", "gaz", "autre"],
  transmission: ["manuelle", "automatique", "cvt", "semi_automatique"],
  condition:    ["neuf", "occasion", "reconditionne"],
};

// Valeurs alternatives tolérées pour `type` — LE champ obligatoire (aucune
// valeur par défaut possible) le plus susceptible d'être rempli en texte libre
// par un partenaire plutôt qu'avec l'exact "location"/"vente" attendu. Sans
// ceci, une ligne "Louer"/"À vendre"/"Rent"/"Sale" échoue avec "Type d'annonce
// manquant" — un chiffre significatif d'un batch en erreur peut venir de là
// plutôt que d'un en-tête de colonne mal reconnu (déjà couvert par HEADER_ALIASES).
const VALUE_ALIASES = {
  type: {
    location: ["location", "louer", "à louer", "a louer", "loue", "rent", "renting", "for rent", "to rent", "location courte durée", "location longue durée"],
    vente: ["vente", "vendre", "à vendre", "a vendre", "achat", "sale", "for sale", "to sell"],
  },
};

const normalizeEnumValue = (value, allowed, field) => {
  if (value === undefined) return undefined;
  const raw = String(value).trim().toLowerCase();
  const exact = allowed.find((a) => a.toLowerCase() === raw);
  if (exact) return exact;
  const aliasMap = field && VALUE_ALIASES[field];
  if (aliasMap) {
    for (const canonical of Object.keys(aliasMap)) {
      if (aliasMap[canonical].includes(raw)) {
        return allowed.find((a) => a.toLowerCase() === canonical);
      }
    }
  }
  return undefined;
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

// ── Détecte le séparateur réel d'un CSV ──────────────────────────────────────
// csv-parse suppose la virgule par défaut — mais Excel/LibreOffice en locale
// française (celle de la quasi-totalité de nos partenaires) exporte le CSV
// avec un POINT-VIRGULE (la virgule y étant déjà le séparateur décimal). Sans
// cette détection, un fichier "; "-séparé est lu comme une seule colonne géante
// par ligne : aucun champ ne correspond plus jamais à un en-tête attendu, et
// TOUTES les lignes échouent (ex. "Type d'annonce manquant" sur 100% du batch)
// sans qu'aucun message n'explique pourquoi. On compte les séparateurs candidats
// sur la ligne d'en-tête et on retient le plus fréquent.
function detectCsvDelimiter(text) {
  const firstLine = (text.split(/\r?\n/, 1)[0] || "");
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}

// ── Parse un fichier uploadé (CSV ou Excel) en lignes brutes {header: value} ─
export async function parseUploadedFile(buffer, fileName = "") {
  const ext = (fileName.split(".").pop() || "").toLowerCase();

  if (ext === "csv") {
    const text = buffer.toString("utf8");
    const delimiter = detectCsvDelimiter(text);
    return parseCsvSync(text, { columns: true, skip_empty_lines: true, trim: true, delimiter });
  }

  // ExcelJS ne sait lire QUE le format .xlsx (OOXML, une archive ZIP) — jamais
  // l'ancien format binaire .xls (Excel 97-2003, structure OLE2/CFB, pas un
  // ZIP du tout). Un .xls y échoue avec une erreur JSZip bas niveau ("Can't
  // find end of central directory : is this a zip file ?") totalement opaque
  // pour un partenaire, alors que le formulaire accepte pourtant ".xls" en
  // entrée (voir accept=".csv,.xlsx,.xls" côté frontend). Détecté ici en amont
  // pour un message actionnable immédiat plutôt que ce message technique.
  if (ext === "xls") {
    throw new Error(
      "Le format .xls (Excel 97-2003) n'est pas pris en charge — réenregistrez votre fichier au format .xlsx " +
      "(dans Excel/LibreOffice/Google Sheets : Fichier > Enregistrer sous > Classeur Excel .xlsx) ou en .csv, puis réimportez-le."
    );
  }

  // .xlsx
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    // Cause la plus probable : un fichier renommé en .xlsx sans être un vrai
    // classeur Excel (ex. un .xls simplement renommé), ou un fichier corrompu.
    throw new Error(
      "Impossible de lire ce fichier comme un classeur Excel (.xlsx) valide. Vérifiez qu'il s'agit bien d'un fichier .xlsx " +
      "non corrompu (pas un .xls simplement renommé), ou réexportez-le en .csv."
    );
  }

  // Un fichier peut contenir plusieurs feuilles (onglet vide ajouté par défaut,
  // export multi-feuilles...) — on ne suppose plus que les données utiles sont
  // forcément sur la première : on prend la première feuille qui contient
  // réellement plus d'une ligne (en-tête + au moins une donnée).
  const sheet = workbook.worksheets.find((s) => s.rowCount > 1) || workbook.worksheets[0];
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

// Normalise une clé d'en-tête pour un rapprochement tolérant à la casse, aux
// accents, aux apostrophes et aux espaces superflus (ex. copié-collé depuis un
// autre fichier, en-tête retapé/reformulé à la main plutôt que le template
// téléchargé) — la correspondance stricte précédente faisait échouer TOUTE la
// ligne dès qu'un seul en-tête différait, même par un simple espace ou accent.
const normalizeHeaderKey = (h) => String(h ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents (marques combinantes apres decomposition NFD)
  .toLowerCase()
  .replace(/[^a-z0-9]/g, ""); // espaces, apostrophes, ponctuation

// Toutes les clés normalisées (en-tête + clé technique + alias) acceptées pour
// une colonne donnée — voir HEADER_ALIASES.
function acceptedKeysFor(col) {
  const raw = [col.header, col.key, ...(HEADER_ALIASES[col.key] || [])];
  return raw.map(normalizeHeaderKey);
}

function buildNormalizedRow(rawRow) {
  const normalized = {};
  for (const [k, v] of Object.entries(rawRow)) {
    normalized[normalizeHeaderKey(k)] = v;
  }
  return normalized;
}

// ── Combien de colonnes attendues sont réellement reconnues dans ce fichier —
// sert de garde-fou à l'upload : si 0 colonne ne correspond, mieux vaut un seul
// message clair ("mauvais template/séparateur") que N lignes en erreur cryptique.
export function countRecognizedColumns(rawRows, targetType = "vehicle") {
  const columns = targetType === "export" ? IE_IMPORT_COLUMNS : IMPORT_COLUMNS;
  if (!rawRows.length) return { recognized: 0, expected: columns.length };
  const keys = new Set(Object.keys(rawRows[0]).map(normalizeHeaderKey));
  const recognized = columns.filter((c) => acceptedKeysFor(c).some((k) => keys.has(k))).length;
  return { recognized, expected: columns.length };
}

// ── Détecte si la colonne "type" (location/vente) est reconnue dans ce fichier —
// c'est le SEUL champ obligatoire sans valeur par défaut (voir
// processVehicleImportRow) : si sa colonne n'est reconnue sous aucun alias, 100%
// des lignes échoueront avec "Type d'annonce manquant" sans que ce soit évident
// pour le partenaire. Détecté à part de countRecognizedColumns (qui peut passer
// avec d'autres colonnes reconnues alors que celle-ci, critique, manque).
export function isTypeColumnRecognized(rawRows) {
  if (!rawRows.length) return true; // pas de ligne = pas de faux positif ici, déjà rejeté ailleurs
  const keys = new Set(Object.keys(rawRows[0]).map(normalizeHeaderKey));
  const typeCol = IMPORT_COLUMNS.find((c) => c.key === "type");
  return acceptedKeysFor(typeCol).some((k) => keys.has(k));
}

// ── Suggestion de mappage colonne-par-colonne ───────────────────────────────
// Le partenaire n'utilise pas toujours notre template : deviner le bon en-tête
// par ressemblance (HEADER_ALIASES) reste un pari — parfois faux (voir le bug
// réel découvert : l'alias générique "Type" collisionnait avec une colonne
// sans rapport dans un vrai fichier partenaire). La solution robuste n'est pas
// de deviner mieux, mais de laisser le partenaire CONFIRMER explicitement la
// correspondance avant l'import (voir previewImportFile / columnMapping).
// Cette fonction ne fait que suggérer un pré-remplissage à partir des mêmes
// alias, modifiable par le partenaire dans l'écran de mappage.
// Repli approximatif (sous-chaîne) quand aucune correspondance exacte n'est
// trouvée — UNIQUEMENT sur l'en-tête humain et ses alias, JAMAIS sur la clé
// technique brute (ex. "type", "ville") qui est trop générique pour un
// rapprochement flou sans risquer une collision comme celle découverte en
// production. Reste une suggestion modifiable, jamais utilisée pour deviner
// silencieusement pendant l'import réel (voir mapRowToVehicleInput).
function fuzzyFindHeader(col, byNormalized) {
  const candidates = [col.header, ...(HEADER_ALIASES[col.key] || [])]
    .map(normalizeHeaderKey)
    .filter((c) => c.length >= 4); // évite les faux positifs sur des mots trop courts
  for (const [normHeader, original] of byNormalized) {
    if (candidates.some((c) => normHeader.includes(c) || c.includes(normHeader))) {
      return original;
    }
  }
  return null;
}

export function buildColumnMappingSuggestion(rawRows, targetType = "vehicle") {
  const columns = targetType === "export" ? IE_IMPORT_COLUMNS : IMPORT_COLUMNS;
  const detectedHeaders = rawRows.length ? Object.keys(rawRows[0]) : [];
  const byNormalized = new Map(detectedHeaders.map((h) => [normalizeHeaderKey(h), h]));

  const suggestion = {};
  for (const col of columns) {
    const found = acceptedKeysFor(col).find((k) => byNormalized.has(k));
    suggestion[col.key] = found ? byNormalized.get(found) : fuzzyFindHeader(col, byNormalized);
  }
  return { detectedHeaders, suggestion };
}

// ── Mappe une ligne brute (en-têtes du template OU mappage explicite confirmé
// par le partenaire) vers les champs Vehicle ────────────────────────────────
// `columnMapping` : { [clé technique]: "en-tête exact du fichier du partenaire" }
// — quand fourni (écran de mappage confirmé), prioritaire sur la détection
// automatique par alias, qui reste le repli si un champ n'a pas été mappé.
// `defaultType` : "location" ou "vente" appliqué à TOUTES les lignes quand le
// partenaire a confirmé n'avoir aucune colonne distinguant location/vente
// dans son fichier (flotte 100% location ou 100% vente) — évite de l'obliger
// à ajouter une colonne juste pour répéter la même valeur sur chaque ligne.
export function mapRowToVehicleInput(rawRow, columnMapping = null, defaultType = null) {
  const normalizedRow = buildNormalizedRow(rawRow);
  const byHeader = {};
  for (const col of IMPORT_COLUMNS) {
    // Distinction volontaire entre "clé absente du mappage" (aucun écran de
    // confirmation, ex. appel API direct legacy → on devine par alias) et
    // "clé présente avec valeur null" (le partenaire a confirmé qu'AUCUNE
    // colonne de son fichier ne correspond → on ne doit surtout pas deviner
    // quand même, c'est exactement le bug réel découvert : une colonne "Type"
    // sans rapport dans le fichier du partenaire était acceptée par défaut
    // via la clé technique elle-même).
    const hasMapping = columnMapping && Object.prototype.hasOwnProperty.call(columnMapping, col.key);
    if (hasMapping) {
      const mappedHeader = columnMapping[col.key];
      byHeader[col.key] = mappedHeader ? normalizedRow[normalizeHeaderKey(mappedHeader)] : undefined;
    } else {
      const found = acceptedKeysFor(col).find((k) => normalizedRow[k] !== undefined);
      byHeader[col.key] = found !== undefined ? normalizedRow[found] : undefined;
    }
  }

  const data = {};
  const rowWarnings = [];
  for (const col of IMPORT_COLUMNS) {
    const key = col.key;
    if (key === "imageUrls") continue;
    let value = byHeader[key];
    if (BOOLEAN_KEYS.includes(key)) value = parseBool(value);
    else if (NUMBER_KEYS.includes(key)) value = parseNumber(value);
    // Un champ censé être du texte (ex. "Modele") peut arriver comme Number
    // depuis Excel/ExcelJS quand sa valeur ressemble à un nombre (ex. "308",
    // "500") — sans cette coercition, `.trim()` plus loin (scoring, doublons)
    // plante sur un type qui n'est pas une chaîne. Bug réel constaté en prod.
    else if (value !== undefined && value !== null) value = String(value).trim();

    if (ENUM_FIELDS[key] && value !== undefined && value !== "") {
      const normalized = normalizeEnumValue(value, ENUM_FIELDS[key], key);
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

  if (!data.type && defaultType && ENUM_FIELDS.type.includes(defaultType)) {
    data.type = defaultType;
  }

  // Le champ "Titre" est délibérément optionnel dans l'écran d'aperçu (seul
  // "TypeAnnonce" y est marqué obligatoire) — mais Vehicle.title est requis en
  // base. Un fichier de flotte partenaire n'a quasiment jamais de colonne
  // "Titre" toute faite : on le génère à partir de marque/modèle/année plutôt
  // que de faire échouer chaque ligne qui en est dépourvue (bug réel constaté
  // en prod : 290 lignes sur 299 rejetées pour "title required").
  if (!data.title) {
    const parts = [data.marque, data.modele, data.annee].filter(Boolean);
    if (parts.length) data.title = parts.join(" ");
  }

  const imageUrls = String(byHeader.imageUrls || "")
    .split(/[,;]/)
    .map((u) => u.trim())
    .filter(Boolean);

  return { data, imageUrls, rowWarnings };
}

// ── Mappe une ligne brute vers les champs ImportExportListing ───────────────
export function mapRowToIEListingInput(rawRow, columnMapping = null) {
  const normalizedRow = buildNormalizedRow(rawRow);
  const byHeader = {};
  for (const col of IE_IMPORT_COLUMNS) {
    const hasMapping = columnMapping && Object.prototype.hasOwnProperty.call(columnMapping, col.key);
    if (hasMapping) {
      const mappedHeader = columnMapping[col.key];
      byHeader[col.key] = mappedHeader ? normalizedRow[normalizeHeaderKey(mappedHeader)] : undefined;
    } else {
      const found = acceptedKeysFor(col).find((k) => normalizedRow[k] !== undefined);
      byHeader[col.key] = found !== undefined ? normalizedRow[found] : undefined;
    }
  }

  const data = {};
  const rowWarnings = [];
  for (const col of IE_IMPORT_COLUMNS) {
    const key = col.key;
    if (key === "imageUrls" || IE_LIST_KEYS.includes(key)) continue;
    let value = byHeader[key];
    if (IE_BOOLEAN_KEYS.includes(key)) value = parseBool(value);
    else if (IE_NUMBER_KEYS.includes(key)) value = parseNumber(value);
    // Même coercition que mapRowToVehicleInput : un champ texte (ex. "Modele"
    // = "308") peut arriver comme Number depuis Excel/ExcelJS.
    else if (value !== undefined && value !== null) value = String(value).trim();

    if (IE_ENUM_FIELDS[key] && value !== undefined && value !== "") {
      const normalized = normalizeEnumValue(value, IE_ENUM_FIELDS[key]);
      if (!normalized) {
        rowWarnings.push(`Valeur "${value}" non reconnue pour "${col.header}" — ignorée (valeurs acceptées : ${IE_ENUM_FIELDS[key].join(", ")})`);
        value = undefined;
      } else {
        value = normalized;
      }
    }

    if (value !== undefined && value !== "") data[key] = value;
  }

  for (const key of IE_LIST_KEYS) {
    const raw = byHeader[key];
    if (raw) {
      data[key] = String(raw).split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    }
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
// Sert de filtre rapide avant d'entrer dans la boucle de redirections — la validation
// qui compte réellement (et qui est "pinée") est celle faite dans fetchPinned() ci-dessous.
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

// Résout le DNS une seule fois, valide l'IP obtenue, puis se connecte DIRECTEMENT à
// cette IP (le Host HTTP et le SNI/servername restent sur le nom d'hôte réel, pour le
// virtual hosting et la validation normale du certificat TLS).
//
// Corrige le TOCTOU DNS-rebinding : avec fetch() natif, la vérification DNS/IP et la
// requête HTTP réelle font chacune leur propre résolution — un attaquant contrôlant le
// serveur DNS de l'hôte peut répondre avec une IP publique à la 1ère résolution (celle
// vérifiée) puis avec une IP privée à la 2de (celle utilisée par fetch() en interne pour
// se connecter). Ici il n'y a plus qu'une seule résolution, et la connexion TCP se fait
// explicitement sur l'IP déjà validée — fetch()/le client HTTP ne peut plus re-résoudre.
async function fetchPinned(url, timeoutMs) {
  let u;
  try { u = new URL(url); } catch { throw new Error("URL invalide."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("URL non autorisée (protocole non supporté).");
  }

  const hostname = u.hostname;
  let ip;
  try {
    ip = net.isIP(hostname) ? hostname : (await dns.lookup(hostname)).address;
  } catch {
    throw new Error("URL non autorisée (IP privée/réservée ou hôte non résolvable).");
  }
  if (isPrivateOrReservedIp(ip)) {
    throw new Error("URL non autorisée (IP privée/réservée ou hôte non résolvable).");
  }

  const isHttps = u.protocol === "https:";
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: ip,                                // connexion TCP pinée sur l'IP déjà validée
      port: u.port ? Number(u.port) : (isHttps ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method: "GET",
      headers: { Host: hostname },                  // Host HTTP correct malgré la connexion directe par IP
      servername: isHttps ? hostname : undefined,   // SNI + validation du certificat sur le nom d'hôte réel
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        const status = res.statusCode || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (name) => res.headers[String(name).toLowerCase()] ?? null },
          text: async () => buf.toString("utf8"),
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        });
      });
      res.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    // Délai d'attente strict (identique à l'ancien AbortController + setTimeout) —
    // req.destroy(err) déclenche l'évènement "error" ci-dessous avec ce message.
    const timer = setTimeout(() => req.destroy(new Error("Délai d'attente dépassé.")), timeoutMs);
    req.on("error", (err) => { clearTimeout(timer); reject(err); });
    req.end();
  });
}

// Suit les redirections manuellement en revalidant/re-pinant chaque URL intermédiaire —
// fetch() en mode "follow" suivrait un 3xx vers une IP privée (ou re-résolue entre-temps)
// sans jamais repasser par la vérification DNS/IP (bypass du filtre SSRF ci-dessus).
async function fetchWithTimeout(url, timeoutMs, maxRedirects = 5) {
  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isFetchableUrl(currentUrl))) {
      throw new Error("URL non autorisée (IP privée/réservée ou hôte non résolvable).");
    }
    const res = await fetchPinned(currentUrl, timeoutMs);
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

// ── Télécharge (SSRF-safe, budgétisé) les photos fournies par URL dans une ligne
// d'import et les upload sur ImageKit — partagé entre l'import véhicules et l'import
// annonces export, seul le préfixe du nom de fichier diffère.
async function downloadImagesForRow(imageUrls, budgetDeadline, rowWarnings, filePrefix) {
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
          fileName: `${filePrefix}-${Date.now()}-${images.length}.${ext}`,
        });
        if (uploaded?.url) images.push(uploaded.url);
      } catch (imgErr) {
        logger.warn("Import — échec téléchargement image", { url, error: imgErr.message });
      }
    }
  }
  return images;
}

// ── Traite une ligne du batch (véhicule catalogue) et retourne le résultat ───
async function processVehicleImportRow(batch, rawRow, rowIndex, budgetDeadline, ownerUser, business) {
  let vehicleLabel = "";
  try {
    const { data, imageUrls, rowWarnings } = mapRowToVehicleInput(rawRow, batch.columnMapping, batch.defaultType);
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

    data.images = await downloadImagesForRow(imageUrls, budgetDeadline, rowWarnings, "partner-import");
    // Déjà une URL légère (ImageKit), pas besoin de recompression — mais sans
    // ce champ, les vues liste (limitVehicleImages) retombaient sur le premier
    // élément de `images` de toute façon : le fixer explicitement documente
    // l'intention et reste cohérent avec la publication manuelle.
    data.thumbnail = data.images[0] || null;

    const validation = scoreAnnonce(data);
    validation.warnings = [...rowWarnings, ...validation.warnings];
    const whitelisted = buildVehicleWhitelist(data);

    const vehicle = await Vehicle.create({
      ...whitelisted,
      owner:              batch.owner,
      business:           business?._id || null,
      country:            business?.country || ownerUser?.country || null,
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

// ── Traite une ligne du batch (annonce Import/Export) et retourne le résultat ─
// Réservé aux Founding Partners — importerProfile auto-provisionné si besoin
// (voir ensureImporterProfile), pas de candidature "Importateur" séparée.
async function processIEImportRow(batch, rawRow, rowIndex, budgetDeadline, ownerUser, importerProfile) {
  let vehicleLabel = "";
  try {
    const { data, imageUrls, rowWarnings } = mapRowToIEListingInput(rawRow, batch.columnMapping);
    vehicleLabel = [data.make, data.model, data.year].filter(Boolean).join(" ") || `Ligne ${rowIndex}`;

    if (!data.title || !data.make || !data.model || !data.year || !data.sourceCountry || !data.price) {
      return {
        rowIndex, status: "error", vehicleLabel,
        errors: ["Champs obligatoires manquants (titre, marque, modèle, année, pays d'origine, prix)"],
        warnings: rowWarnings,
      };
    }

    // ── Doublon (même règle que createListing) ───────────────────────────
    const existing = await ImportExportListing.findOne({
      partner: batch.owner,
      make:    new RegExp(`^${escapeRegex(String(data.make))}$`, "i"),
      model:   new RegExp(`^${escapeRegex(String(data.model))}$`, "i"),
      year:    Number(data.year),
      status:  { $ne: "rejected" },
    });
    if (existing) {
      return { rowIndex, status: "skipped_duplicate", vehicleLabel, errors: [], warnings: [`Annonce déjà existante (${existing._id})`] };
    }

    const images = await downloadImagesForRow(imageUrls, budgetDeadline, rowWarnings, "ie-import");

    const listing = await ImportExportListing.create({
      partner:         batch.owner,
      importerProfile: importerProfile._id,
      title:           data.title,
      make:            data.make,
      model:           data.model,
      year:            Number(data.year),
      mileage:         Number(data.mileage) || 0,
      fuelType:        data.fuelType,
      transmission:    data.transmission,
      bodyType:        data.bodyType,
      color:           data.color,
      condition:       data.condition || "occasion",
      description:     data.description,
      sourceCountry:   data.sourceCountry,
      sourceCity:      data.sourceCity,
      availableIn:     data.availableIn || [],
      price:           Number(data.price),
      currency:        data.currency || "EUR",
      negotiable:      !!data.negotiable,
      stockQty:        Number(data.stockQty) || 1,
      photos:          images,
      mainPhoto:       images[0] || null,
      status:          "pending",
    });

    return {
      rowIndex,
      status: "created",
      listingId: listing._id,
      vehicleLabel,
      errors: [],
      warnings: rowWarnings,
    };
  } catch (rowErr) {
    logger.error("Import export — erreur ligne", { rowIndex, error: rowErr.message });
    return { rowIndex, status: "error", vehicleLabel, errors: [rowErr.message || "Erreur inconnue"], warnings: [] };
  }
}

// ── Traite une ligne du batch et retourne l'entrée de résultat à enregistrer ─
async function processImportRow(batch, rawRow, rowIndex, budgetDeadline, ctx) {
  if (batch.targetType === "export") {
    return processIEImportRow(batch, rawRow, rowIndex, budgetDeadline, ctx.ownerUser, ctx.importerProfile);
  }
  return processVehicleImportRow(batch, rawRow, rowIndex, budgetDeadline, ctx.ownerUser, ctx.business);
}

// ── Traite un batch d'import — appelé par le worker ET en fallback synchrone ─
// Idempotent vis-à-vis des retries BullMQ : pendingRows est réduit ligne par ligne,
// donc une reprise après échec ne retraite jamais une ligne déjà enregistrée.
export async function processImportBatch(batchId) {
  const batch = await VehicleImportBatch.findById(batchId);
  if (!batch) return;

  const budgetDeadline = Date.now() + IMAGE_FETCH_BUDGET_MS;
  const isExport = batch.targetType === "export";

  try {
    // ── Contexte partagé : propriétaire (pour son pays + profil importateur
    // export si besoin) chargé une seule fois pour tout le batch, pas à chaque ligne.
    const ownerUser = await User.findById(batch.owner);
    let ctx = { ownerUser };

    // ── Suspension/rejet Vérification Partenaire ──────────────────────────
    // Vérifiée une seule fois pour tout le batch, comme le rôle/KYC/certification
    // déjà bloqués en amont dans createImportBatch — mais createImportBatch ne
    // couvre pas les anciens batches déjà en file (worker BullMQ) au moment où
    // un admin suspend le partenaire après coup ; ce garde-fou reste donc utile
    // ici aussi, sur les DEUX cibles (vehicle ET export), pas seulement l'export.
    const suspendedVerif = await PartnerVerification.findOne({
      userId: batch.owner,
      status: { $in: ["suspendu", "rejete"] },
    }).select("status").lean();
    if (suspendedVerif) {
      throw new Error("Votre dossier partenaire est suspendu ou rejeté — import annulé.");
    }

    if (isExport) {
      if (!ownerUser?.isFounder) {
        throw new Error("Ce compte n'est plus Founding Partner — import export annulé.");
      }
      ctx.importerProfile = await ensureImporterProfile(ownerUser);
    } else if (batch.business) {
      ctx.business = await PartnerBusiness.findOne({ _id: batch.business, owner: batch.owner }).lean();
    }

    while (batch.pendingRows.length > 0) {
      const rawRow = batch.pendingRows[0];
      const rowIndex = batch.processedRows + 1;

      const result = await processImportRow(batch, rawRow, rowIndex, budgetDeadline, ctx);

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
      const noun = isExport ? "annonce(s) export" : "véhicule(s)";
      await Notification.create({
        user: batch.owner,
        type: "system",
        titre: isExport ? "📦 Import d'annonces export terminé" : "📦 Import de flotte terminé",
        message: `${created} ${noun} créé(s), ${skipped} doublon(s) ignoré(s), ${errored} erreur(s).`,
        lien: isExport ? "/vendor/publish?tab=import-export" : "/vendor/dashboard",
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
