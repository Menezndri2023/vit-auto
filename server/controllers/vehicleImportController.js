import logger from "../utils/logger.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import { dispatch } from "../queue/index.js";
import {
  MAX_IMPORT_ROWS,
  generateTemplateWorkbook,
  parseUploadedFile,
  parseGoogleSheetUrl,
  processImportBatch,
  countRecognizedColumns,
} from "../services/vehicleImportService.js";

const requirePartnerRole = (req, res) => {
  if (!["partenaire", "admin"].includes(req.user.role)) {
    res.status(403).json({ message: "Réservé aux partenaires." });
    return false;
  }
  return true;
};

// ── Télécharger le template Excel ────────────────────────────────────────────
// ?type=export → template Import/Export (Founding Partners) ; sinon véhicules classiques.
export const downloadTemplate = async (req, res) => {
  try {
    const isExport = req.query.type === "export";
    const workbook = await generateTemplateWorkbook(isExport ? "export" : "vehicle");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${isExport ? "vitauto_import_export.xlsx" : "vitauto_import_vehicules.xlsx"}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error("downloadTemplate:", err);
    res.status(500).json({ message: "Erreur génération du template." });
  }
};

// ── Créer un batch d'import (fichier ou Google Sheet) ────────────────────────
// targetType "export" = annonces Import/Export, réservé aux Founding Partners.
export const createImportBatch = async (req, res) => {
  try {
    if (!requirePartnerRole(req, res)) return;

    const { source, fileBase64, fileName, googleSheetUrl, targetType } = req.body;
    const isExport = targetType === "export";
    if (isExport && !req.user.isFounder) {
      return res.status(403).json({
        code:    "FOUNDING_PARTNER_REQUIRED",
        message: "Devenez Founding Partner pour importer des annonces d'export.",
      });
    }
    if (!["csv", "excel", "google_sheet"].includes(source)) {
      return res.status(400).json({ message: "Méthode d'import invalide." });
    }

    let rawRows;
    try {
      if (source === "google_sheet") {
        if (!googleSheetUrl) return res.status(400).json({ message: "Lien Google Sheet requis." });
        rawRows = await parseGoogleSheetUrl(googleSheetUrl);
      } else {
        if (!fileBase64) return res.status(400).json({ message: "Fichier requis." });
        const base64Data = fileBase64.includes(",") ? fileBase64.split(",").pop() : fileBase64;
        const buffer = Buffer.from(base64Data, "base64");
        rawRows = await parseUploadedFile(buffer, fileName || (source === "csv" ? "import.csv" : "import.xlsx"));
      }
    } catch (parseErr) {
      return res.status(400).json({ message: parseErr.message || "Impossible de lire le fichier." });
    }

    if (!rawRows.length) {
      return res.status(400).json({ message: isExport ? "Aucune ligne d'annonce trouvée dans le fichier." : "Aucune ligne de véhicule trouvée dans le fichier." });
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        message: `Ce fichier contient ${rawRows.length} lignes — maximum ${MAX_IMPORT_ROWS} par import. Divisez votre fichier en plusieurs imports.`,
      });
    }

    // ── Garde-fou en-têtes ───────────────────────────────────────────────────
    // Si aucune colonne attendue n'est reconnue (mauvais template, en-têtes
    // renommés, ou — pour un CSV — séparateur différent mal interprété), mieux
    // vaut UN message clair immédiat que des dizaines/centaines de lignes en
    // erreur cryptique après traitement complet du batch.
    const { recognized } = countRecognizedColumns(rawRows, isExport ? "export" : "vehicle");
    if (recognized === 0) {
      return res.status(400).json({
        message: "Aucune colonne du template n'a été reconnue dans ce fichier. Téléchargez le template ci-dessus et remplissez-le sans renommer les colonnes (pour un CSV exporté depuis Excel, vérifiez aussi le séparateur : virgule ou point-virgule).",
      });
    }

    const batch = await VehicleImportBatch.create({
      owner: req.user._id,
      targetType: isExport ? "export" : "vehicle",
      source,
      originalFileName: fileName || "",
      googleSheetUrl: googleSheetUrl || "",
      totalRows: rawRows.length,
      status: "processing",
      pendingRows: rawRows,
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
