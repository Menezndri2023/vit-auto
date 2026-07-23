import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../utils/apiClient";
import styles from "./PartnerFleetImport.module.css";

const METHODS = (isExport) => [
  {
    id: "file",
    icon: "📤",
    title: "Fichier Excel / CSV",
    desc: isExport
      ? "Téléchargez notre template, remplissez vos véhicules à exporter et importez-le."
      : "Téléchargez notre template, remplissez votre inventaire et importez-le.",
  },
  {
    id: "google_sheet",
    icon: "🔗",
    title: "Google Sheet",
    desc: "Collez le lien d'une feuille Google Sheet partagée en lecture publique.",
  },
  {
    id: "api",
    icon: "⚙️",
    title: "API / Webhook",
    desc: "Connectez votre système de gestion de flotte directement.",
    soon: true,
  },
];

const STATUS_CONFIG = {
  created:            { icon: "✅", label: "Créé" },
  skipped_duplicate:  { icon: "⚠️", label: "Doublon ignoré" },
  error:              { icon: "❌", label: "Erreur" },
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const PartnerFleetImport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExport = searchParams.get("type") === "export";
  const { user } = useAuth();
  const { success, error } = useToast();

  const [step, setStep] = useState(1); // 1: méthode, 2: saisie, 3: progression/résultats
  const [method, setMethod] = useState(null);

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [batchId, setBatchId] = useState(null);
  const [batch, setBatch] = useState(null);

  const chooseMethod = (m) => {
    if (m.soon) return;
    setMethod(m.id);
    setStep(2);
  };

  const backToMethods = () => {
    setStep(1);
    setMethod(null);
    setFile(null);
    setGoogleSheetUrl("");
  };

  // ── Fichier ──────────────────────────────────────────────────────────────
  const handleFiles = (fileList) => {
    const f = fileList?.[0];
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      error("Format non supporté. Utilisez un fichier .csv, .xlsx ou .xls");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      error("Fichier trop volumineux (maximum 8 Mo).");
      return;
    }
    setFile(f);
  };

  const handleFileInput = (e) => handleFiles(e.target.files);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(`/api/vehicles/import/template${isExport ? "?type=export" : ""}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = isExport ? "vitauto_import_export.xlsx" : "vitauto_import_vehicules.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      error(e.message || "Erreur lors du téléchargement du template.");
    }
  };

  const startImport = async (body) => {
    setSubmitting(true);
    try {
      const res = await api.post("/api/vehicles/import", { ...body, targetType: isExport ? "export" : "vehicle" });
      setBatchId(res.batchId);
      setBatch(null);
      setStep(3);
    } catch (e) {
      error(e.message || "Erreur lors du démarrage de l'import.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitFile = async () => {
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    await startImport({ source: ext === "csv" ? "csv" : "excel", fileBase64: base64, fileName: file.name });
  };

  const handleSubmitGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) return;
    await startImport({ source: "google_sheet", googleSheetUrl: googleSheetUrl.trim() });
  };

  // ── Suivi de l'import ────────────────────────────────────────────────────
  const pollBatch = useCallback(async (id) => {
    try {
      const res = await api.get(`/api/vehicles/import/${id}`);
      return res.batch;
    } catch (e) {
      error(e.message || "Erreur de suivi de l'import.");
      return null;
    }
  }, [error]);

  useEffect(() => {
    if (!batchId || step !== 3) return undefined;
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      const b = await pollBatch(batchId);
      if (cancelled || !b) return;
      setBatch(b);
      if (b.status === "processing") {
        timer = setTimeout(tick, 2000);
      } else if (b.status === "completed") {
        success("Import terminé avec succès !");
      } else if (b.status === "failed") {
        error(b.errorMessage || "L'import a échoué avant d'avoir pu traiter le fichier.");
      }
    };
    tick();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [batchId, step, pollBatch, success]);

  const resetAll = () => {
    setStep(1);
    setMethod(null);
    setFile(null);
    setGoogleSheetUrl("");
    setBatchId(null);
    setBatch(null);
  };

  // Réessayer = revenir directement à l'étape d'envoi avec la même méthode déjà
  // choisie (fichier/Google Sheet), sans repasser par le choix de méthode — utile
  // après un batch en erreur pour renvoyer rapidement un fichier corrigé.
  const retrySameMethod = () => {
    setStep(2);
    setFile(null);
    setGoogleSheetUrl("");
    setBatchId(null);
    setBatch(null);
  };

  const created = batch?.results?.filter((r) => r.status === "created").length || 0;
  const skipped = batch?.results?.filter((r) => r.status === "skipped_duplicate").length || 0;
  const errored = batch?.results?.filter((r) => r.status === "error").length || 0;

  // L'import en masse d'annonces export est réservé aux Founding Partners
  // (même vérification que la publication manuelle — voir VendorPublish.jsx).
  if (isExport && !user?.isFounder) {
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ textAlign: "center" }}>
          <h2 className={styles.cardTitle}>🔒 Réservé aux Founding Partners</h2>
          <p className={styles.hint}>
            La publication d'annonces Import/Export (manuelle ou en masse) est réservée aux partenaires ayant signé l'Accord Founding Partner.
          </p>
          <Link to="/partner-onboarding" className={styles.primaryBtn} style={{ display: "inline-block", textDecoration: "none", marginTop: 12 }}>
            Devenir Founding Partner →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{isExport ? "📦 Publier mes véhicules à exporter" : "📦 Importer ma flotte"}</h1>
        <p className={styles.subtitle}>
          {isExport
            ? "Ajoutez plusieurs véhicules à exporter d'un coup, sans les saisir un par un."
            : "Ajoutez plusieurs véhicules d'un coup, sans les saisir un par un."}
        </p>
      </div>

      {step === 1 && (
        <div className={styles.methodGrid}>
          {METHODS(isExport).map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.methodCard} ${m.soon ? styles.methodCardSoon : ""}`}
              onClick={() => chooseMethod(m)}
              disabled={m.soon}
            >
              <span className={styles.methodIcon}>{m.icon}</span>
              <strong>
                {m.title}
                {m.soon && <span className={styles.soonBadge}>Bientôt</span>}
              </strong>
              <p>{m.desc}</p>
            </button>
          ))}
        </div>
      )}

      {step === 2 && method === "file" && (
        <div className={styles.card}>
          <button type="button" className={styles.backBtn} onClick={backToMethods}>← Changer de méthode</button>
          <h2 className={styles.cardTitle}>Fichier Excel / CSV</h2>

          <button type="button" className={styles.templateBtn} onClick={handleDownloadTemplate}>
            ⬇️ Télécharger le template
          </button>
          <p className={styles.hint}>Remplissez le template avec vos véhicules (une ligne par véhicule), puis importez-le ci-dessous.</p>

          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <>
                <div className={styles.dropIcon}>📄</div>
                <p className={styles.dropTitle}>{file.name}</p>
                <p className={styles.dropSub}>{(file.size / 1024).toFixed(0)} Ko — cliquez pour changer</p>
              </>
            ) : (
              <>
                <div className={styles.dropIcon}>🖼️</div>
                <p className={styles.dropTitle}>Glissez votre fichier ici</p>
                <p className={styles.dropSub}>ou cliquez pour sélectionner (.csv, .xlsx, .xls)</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileInput}
          />

          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!file || submitting}
            onClick={handleSubmitFile}
          >
            {submitting ? "Import en cours..." : "Importer ce fichier"}
          </button>
        </div>
      )}

      {step === 2 && method === "google_sheet" && (
        <div className={styles.card}>
          <button type="button" className={styles.backBtn} onClick={backToMethods}>← Changer de méthode</button>
          <h2 className={styles.cardTitle}>Google Sheet</h2>
          <p className={styles.hint}>
            Partagez votre feuille en "Lecture pour toute personne disposant du lien", puis collez son URL ci-dessous.
            Les colonnes doivent suivre le même format que <button type="button" className={styles.linkBtn} onClick={handleDownloadTemplate}>le template Excel</button>.
          </p>
          <input
            type="url"
            className={styles.textInput}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={googleSheetUrl}
            onChange={(e) => setGoogleSheetUrl(e.target.value)}
          />
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!googleSheetUrl.trim() || submitting}
            onClick={handleSubmitGoogleSheet}
          >
            {submitting ? "Import en cours..." : "Importer cette feuille"}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className={styles.card}>
          {(!batch || batch.status === "processing") && (
            <>
              <h2 className={styles.cardTitle}>⏳ Import en cours...</h2>
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${batch ? Math.round((batch.processedRows / Math.max(batch.totalRows, 1)) * 100) : 0}%` }}
                  />
                </div>
                <p className={styles.progressLabel}>
                  {batch ? `${batch.processedRows} / ${batch.totalRows} véhicules traités` : "Démarrage..."}
                </p>
              </div>
            </>
          )}

          {batch && batch.status === "failed" && (
            <>
              <h2 className={styles.cardTitle}>❌ L'import a échoué</h2>
              <p className={styles.resultErrorText} style={{ marginTop: 8 }}>
                {batch.errorMessage || "Une erreur inattendue est survenue pendant le traitement du fichier."}
              </p>
              <div className={styles.resultActions}>
                <button type="button" className={styles.secondaryBtn} onClick={resetAll}>
                  Réessayer
                </button>
              </div>
            </>
          )}

          {batch && !["processing", "failed"].includes(batch.status) && (
            <>
              <h2 className={styles.cardTitle}>
                {batch.status === "completed" ? "✅ Import terminé" : "⚠️ Import terminé avec des erreurs"}
              </h2>
              <div className={styles.summaryRow}>
                <span className={styles.summaryCreated}>{created} créé(s)</span>
                <span className={styles.summarySkipped}>{skipped} doublon(s) ignoré(s)</span>
                <span className={styles.summaryError}>{errored} erreur(s)</span>
              </div>

              <ul className={styles.resultList}>
                {(batch.results || []).map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || {};
                  return (
                    <li key={r.rowIndex} className={styles.resultRow}>
                      <span className={styles.resultIcon}>{cfg.icon}</span>
                      <div className={styles.resultInfo}>
                        <strong>{r.vehicleLabel || `Ligne ${r.rowIndex}`}</strong>
                        {(r.errors || []).map((e, i) => <p key={`e${i}`} className={styles.resultErrorText}>❌ {e}</p>)}
                        {(r.warnings || []).map((w, i) => <p key={`w${i}`} className={styles.resultWarningText}>⚠️ {w}</p>)}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.resultActions}>
                {created > 0 && (
                  <button type="button" className={styles.primaryBtn} onClick={() => navigate(isExport ? "/vendor/publish?tab=import-export" : "/vendor/dashboard")}>
                    Voir mes annonces →
                  </button>
                )}
                {errored > 0 && (
                  <button type="button" className={created > 0 ? styles.secondaryBtn : styles.primaryBtn} onClick={retrySameMethod}>
                    🔄 Réessayer
                  </button>
                )}
                <button type="button" className={styles.secondaryBtn} onClick={resetAll}>
                  Nouvel import
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PartnerFleetImport;
