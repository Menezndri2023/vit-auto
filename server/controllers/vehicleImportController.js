import logger from "../utils/logger.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import PartnerVerification from "../models/PartnerVerification.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { dispatch } from "../queue/index.js";
import {
  MAX_IMPORT_ROWS,
  IMPORT_COLUMNS,
  IE_IMPORT_COLUMNS,
  parseUploadedFile,
  parseGoogleSheetUrl,
  processImportBatch,
  countRecognizedColumns,
  isTypeColumnRecognized,
  buildColumnMappingSuggestion,
} from "../services/vehicleImportService.js";

const requirePartnerRole = (req, res) => {
  if (!["partenaire", "admin"].includes(req.user.role)) {
    res.status(403).json({ message: "Réservé aux partenaires." });
    return false;
  }
  return true;
};

// ── Vérification requise avant import de flotte (même règles que
// vehicleController.createVehicle — voir ce fichier pour l'explication
// complète) ────────────────────────────────────────────────────────────────
// L'import en masse contournait jusqu'ici totalement KYC/certification/
// suspension : un partenaire non vérifié (ou suspendu par un admin) pouvait
// publier des centaines de véhicules d'un coup via un simple upload de
// fichier, alors que la même publication à l'unité (createVehicle) est
// bloquée. Bug réel trouvé en audit — pas seulement un manque de garde-fou
// théorique, un partenaire suspendu pouvait littéralement republier toute sa
// flotte par ce détour tant que l'admin ne le savait pas.
async function checkImportPublishGate(req, res) {
  const isIndividualSeller = req.user.sellerType === "particulier";
  if (req.user.role === "partenaire" && !req.user.isFounder) {
    if (isIndividualSeller) {
      if (req.user.kycStatus !== "VERIFIE") {
        res.status(403).json({
          code:    "KYC_REQUIRED",
          message: "Complétez votre vérification d'identité (pièce d'identité + selfie) avant d'importer une flotte.",
        });
        return false;
      }
    } else if (req.user.certificationBadge === "none") {
      res.status(403).json({
        code:    "CERTIFICATION_REQUIRED",
        message: "Complétez votre vérification partenaire avant d'importer une flotte.",
      });
      return false;
    }
  }

  const suspendedVerif = await PartnerVerification.findOne({
    userId: req.user._id,
    status: { $in: ["suspendu", "rejete"] },
  }).select("status").lean();
  if (suspendedVerif) {
    res.status(403).json({
      code:    "PARTNER_SUSPENDED",
      message: suspendedVerif.status === "suspendu"
        ? "Votre dossier partenaire est suspendu. Contactez le support VIT AUTO."
        : "Votre dossier partenaire a été rejeté. Contactez le support VIT AUTO.",
    });
    return false;
  }

  return true;
}

// ── Parsing partagé fichier/Google Sheet + validations communes ─────────────
// Utilisé par previewImportFile ET createImportBatch — un seul endroit pour
// les règles "méthode valide / fichier lisible / non vide / sous la limite".
// Lève une erreur portant { status, message } plutôt que de répondre
// directement, pour rester utilisable par les deux endpoints.
async function parseRequestFile(req, isExport) {
  const { source, fileBase64, fileName, googleSheetUrl } = req.body;
  if (!["csv", "excel", "google_sheet"].includes(source)) {
    throw { status: 400, message: "Méthode d'import invalide." };
  }

  let rawRows;
  try {
    if (source === "google_sheet") {
      if (!googleSheetUrl) throw { status: 400, message: "Lien Google Sheet requis." };
      rawRows = await parseGoogleSheetUrl(googleSheetUrl);
    } else {
      if (!fileBase64) throw { status: 400, message: "Fichier requis." };
      const base64Data = fileBase64.includes(",") ? fileBase64.split(",").pop() : fileBase64;
      const buffer = Buffer.from(base64Data, "base64");
      rawRows = await parseUploadedFile(buffer, fileName || (source === "csv" ? "import.csv" : "import.xlsx"));
    }
  } catch (parseErr) {
    if (parseErr?.status) throw parseErr;
    throw { status: 400, message: parseErr.message || "Impossible de lire le fichier." };
  }

  if (!rawRows.length) {
    throw { status: 400, message: isExport ? "Aucune ligne d'annonce trouvée dans le fichier." : "Aucune ligne de véhicule trouvée dans le fichier." };
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw { status: 400, message: `Ce fichier contient ${rawRows.length} lignes — maximum ${MAX_IMPORT_ROWS} par import. Divisez votre fichier en plusieurs imports.` };
  }
  return rawRows;
}

// ── Aperçu du fichier avant import : en-têtes détectées + suggestion de
// mappage colonne-par-colonne, à confirmer/ajuster par le partenaire ────────
// Le partenaire n'utilise pas toujours notre template — deviner silencieusement
// la bonne colonne (alias) s'est révélé risqué en production (un alias trop
// générique avait collisionné avec une colonne sans rapport dans un vrai
// fichier partenaire, provoquant un échec total sans qu'aucun garde-fou ne le
// détecte). Cet écran rend le mappage explicite et vérifiable avant de lancer
// l'import réel sur potentiellement des centaines de lignes.
export const previewImportFile = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;

    const isExport = req.body.targetType === "export";
    if (isExport && !req.user.isFounder) {
      return res.status(403).json({
        code:    "FOUNDING_PARTNER_REQUIRED",
        message: "Devenez Founding Partner pour importer des annonces d'export.",
      });
    }
    if (!(await checkImportPublishGate(req, res))) return;

    let rawRows;
    try {
      rawRows = await parseRequestFile(req, isExport);
    } catch (e) {
      return res.status(e.status || 400).json({ message: e.message });
    }

    const { detectedHeaders, suggestion } = buildColumnMappingSuggestion(rawRows, isExport ? "export" : "vehicle");
    const columns = (isExport ? IE_IMPORT_COLUMNS : IMPORT_COLUMNS).map((c) => ({
      key:      c.key,
      label:    c.header,
      required: !isExport && c.key === "type",
    }));

    res.json({ totalRows: rawRows.length, detectedHeaders, suggestion, columns });
  } catch (err) {
    logger.error("previewImportFile:", err);
    res.status(400).json({ message: "Erreur lors de l'analyse du fichier." });
  }
};

// ── Créer un batch d'import (fichier ou Google Sheet) ────────────────────────
// targetType "export" = annonces Import/Export, réservé aux Founding Partners.
export const createImportBatch = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;

    const { source, fileName, googleSheetUrl, targetType, columnMapping, defaultType, businessId } = req.body;
    const isExport = targetType === "export";
    if (isExport && !req.user.isFounder) {
      return res.status(403).json({
        code:    "FOUNDING_PARTNER_REQUIRED",
        message: "Devenez Founding Partner pour importer des annonces d'export.",
      });
    }
    if (!(await checkImportPublishGate(req, res))) return;
    if (defaultType !== undefined && defaultType !== null && !["location", "vente"].includes(defaultType)) {
      return res.status(400).json({ message: "Type par défaut invalide." });
    }

    // ── Entreprise du partenaire (facultatif, comme createVehicle) ─────────
    // Un partenaire multi-entités/multi-pays importe une flotte pour l'une de
    // ses entreprises : son pays prime alors sur celui du compte User pour
    // toutes les lignes du batch (voir processImportBatch/vehicleImportService.js).
    let business = null;
    if (businessId) {
      business = await PartnerBusiness.findOne({ _id: businessId, owner: req.user._id }).lean();
      if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
    }

    let rawRows;
    try {
      rawRows = await parseRequestFile(req, isExport);
    } catch (e) {
      return res.status(e.status || 400).json({ message: e.message });
    }

    // Mappage explicite confirmé par le partenaire à l'écran de prévisualisation
    // (voir previewImportFile) — un objet non vide vaut confirmation qu'il a
    // vérifié la correspondance colonne-par-colonne, donc on fait confiance à
    // ce mappage plutôt qu'à la détection automatique par alias, qui reste le
    // repli uniquement pour un appel direct de l'API sans passer par l'aperçu.
    const hasExplicitMapping = columnMapping && typeof columnMapping === "object" && !Array.isArray(columnMapping)
      && Object.keys(columnMapping).length > 0;

    if (!hasExplicitMapping) {
      const { recognized } = countRecognizedColumns(rawRows, isExport ? "export" : "vehicle");
      if (recognized === 0) {
        const detected = Object.keys(rawRows[0] || {}).join(", ") || "(aucune)";
        return res.status(400).json({
          message: `Aucune colonne du template n'a été reconnue dans ce fichier. En-têtes détectées : ${detected}. Téléchargez le template ci-dessus et remplissez-le sans renommer les colonnes (pour un CSV exporté depuis Excel, vérifiez aussi le séparateur : virgule ou point-virgule).`,
        });
      }
      if (!isExport && !defaultType && !isTypeColumnRecognized(rawRows)) {
        const detected = Object.keys(rawRows[0] || {}).join(", ") || "(aucune)";
        return res.status(400).json({
          message: `La colonne indiquant si chaque véhicule est à louer ou à vendre (en-tête "TypeAnnonce" dans le template) est introuvable dans ce fichier — c'est un champ obligatoire, sans lui toutes les lignes échoueront. En-têtes détectées : ${detected}.`,
        });
      }
    } else if (!isExport && !defaultType && !columnMapping.type) {
      // Mappage confirmé mais la colonne type n'a été ni mappée ni compensée par
      // un type par défaut pour tout l'import — bloquer maintenant plutôt que de
      // laisser échouer chaque ligne individuellement.
      return res.status(400).json({
        message: "Indiquez quelle colonne distingue location/vente, ou choisissez un type par défaut pour tout l'import (si votre flotte n'est que de la location, ou que de la vente).",
      });
    }

    const batch = await VehicleImportBatch.create({
      owner: req.user._id,
      business: business?._id || null,
      targetType: isExport ? "export" : "vehicle",
      source,
      originalFileName: fileName || "",
      googleSheetUrl: googleSheetUrl || "",
      totalRows: rawRows.length,
      status: "processing",
      pendingRows: rawRows,
      columnMapping: hasExplicitMapping ? columnMapping : null,
      defaultType: defaultType || null,
    });

    const jobId = await dispatch.vehicleImportBatchQueued(batch._id.toString());
    if (!jobId) {
      // Pas de Redis disponible — traitement synchrone en fallback (jamais silencieusement ignoré)
      await processImportBatch(batch._id.toString());
    }

    res.status(202).json({ batchId: batch._id, totalRows: batch.totalRows });
  } catch (err) {
    logger.error("createImportBatch:", err);
    res.status(400).json({ message: "Erreur lors du démarrage de l'import." });
  }
};

// ── Statut/progression d'un batch ────────────────────────────────────────────
export const getImportBatch = async (req, res) => {
  try {
    const batch = await VehicleImportBatch.findById(req.params.batchId);
    if (!batch) return res.status(404).json({ message: "Import introuvable." });
    if (String(batch.owner) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé." });
    }
    res.json({ batch });
  } catch (err) {
    logger.error("getImportBatch:", err);
    res.status(400).json({ message: "Erreur récupération import." });
  }
};

// ── Historique des imports du partenaire ─────────────────────────────────────
export const listImportBatches = async (req, res) => {
  try {
    const batches = await VehicleImportBatch.find({ owner: req.user._id })
      .select("-pendingRows")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ batches });
  } catch (err) {
    logger.error("listImportBatches:", err);
    res.status(400).json({ message: "Erreur récupération historique." });
  }
};
