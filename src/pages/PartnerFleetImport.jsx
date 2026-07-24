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

  const [step, setStep] = useState(1); // 1: méthode, 2: saisie, "mapping": correspondance colonnes, 3: progression/résultats
  const [method, setMethod] = useState(null);

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Aperçu + mappage colonne-par-colonne (avant l'import réel) ─────────────
  // Deviner le bon en-tête par ressemblance s'est révélé risqué en production
  // (un alias trop générique avait collisionné avec une colonne sans rapport
  // dans un vrai fichier partenaire, provoquant un échec total silencieux) —
  // le partenaire confirme désormais explicitement la correspondance.
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState(null); // { totalRows, detectedHeaders, suggestion, columns }
  const [mapping, setMapping] = useState({});
  const [defaultType, setDefaultType] = useState(""); // "location" | "vente" | "" — si aucune colonne type
  const [pendingBody, setPendingBody] = useState(null);

  const [batchId, setBatchId] = useState(null);
  const [batch, setBatch] = useState(null);

  // ── Entreprise du partenaire (facultatif, multi-entité/multi-pays — voir
  // VendorSubmit.jsx) : son pays prime alors sur celui du compte pour toutes
  // les lignes de ce batch. Non pertinent pour l'export (ImportExportListing
  // n'a pas de notion d'entreprise).
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");

  useEffect(() => {
    if (isExport) return;
    api.get("/api/partner/businesses")
      .then((res) => {
        const list = res.businesses || [];
        setBusinesses(list);
        const def = list.find((b) => b.isDefault);
        if (def) setSelectedBusinessId(def._id);
      })
      .catch(() => {});
  }, [isExport]);

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
    setPreview(null);
    setMapping({});
    setDefaultType("");
  };

  // ── Fichier ──────────────────────────────────────────────────────────────
  const handleFiles = (fileList) => {
    const f = fileList?.[0];
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (ext === "xls") {
      error("Le format .xls (Excel 97-2003) n'est pas pris en charge — réenregistrez votre fichier au format .xlsx (Fichier > Enregistrer sous > Classeur Excel .xlsx) ou en .csv, puis réessayez.");
      return;
    }
    if (!["csv", "xlsx"].includes(ext)) {
      error("Format non supporté. Utilisez un fichier .csv ou .xlsx");
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

  // Redirige vers l'écran de vérification manquant plutôt que d'afficher une
  // simple erreur générique — même logique que VendorSubmit.jsx : un partenaire
  // bloqué par KYC/certification doit être guidé vers la bonne page, pas
  // laissé face à un message sans action possible.
  const handleGateError = (e, fallback) => {
    if (e.code === "KYC_REQUIRED") {
      error("Vérifiez votre identité (pièce d'identité + selfie) pour importer une flotte. Redirection…");
      setTimeout(() => navigate("/kyc"), 1500);
    } else if (e.code === "CERTIFICATION_REQUIRED") {
      error("Terminez votre vérification partenaire pour importer une flotte. Redirection…");
      setTimeout(() => navigate("/partner-onboarding"), 1500);
    } else {
      error(e.message || fallback);
    }
  };

  const startImport = async (body) => {
    setSubmitting(true);
    try {
      const res = await api.post("/api/vehicles/import", {
        ...body,
        targetType: isExport ? "export" : "vehicle",
        businessId: !isExport ? (selectedBusinessId || undefined) : undefined,
      });
      setBatchId(res.batchId);
      setBatch(null);
      setStep(3);
    } catch (e) {
      handleGateError(e, "Erreur lors du démarrage de l'import.");
    } finally {
      setSubmitting(false);
    }
  };

  // Analyse le fichier/la feuille (en-têtes détectées + suggestion de mappage)
  // AVANT de lancer l'import réel sur potentiellement des centaines de lignes.
  const analyzeFile = async (body) => {
    setAnalyzing(true);
    try {
      const res = await api.post("/api/vehicles/import/preview", { ...body, targetType: isExport ? "export" : "vehicle" });
      setPreview(res);
      setMapping(res.suggestion || {});
      setDefaultType("");
      setPendingBody(body);
      setStep("mapping");
    } catch (e) {
      handleGateError(e, "Erreur lors de l'analyse du fichier.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmitFile = async () => {
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    await analyzeFile({ source: ext === "csv" ? "csv" : "excel", fileBase64: base64, fileName: file.name });
  };

  const handleSubmitGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) return;
    await analyzeFile({ source: "google_sheet", googleSheetUrl: googleSheetUrl.trim() });
  };

  const setMappingField = (key, header) => setMapping((p) => ({ ...p, [key]: header || null }));

  const missingTypeMapping = !isExport && !mapping.type && !defaultType;

  const confirmMappingAndImport = async () => {
    if (missingTypeMapping) {
      error("Indiquez quelle colonne distingue location/vente, ou choisissez un type par défaut pour tout l'import.");
      return;
    }
    await startImport({ ...pendingBody, columnMapping: mapping, defaultType: defaultType || undefined });
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
    setPreview(null);
    setMapping({});
    setDefaultType("");
    setPendingBody(null);
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
    setPreview(null);
    setMapping({});
    setDefaultType("");
    setPendingBody(null);
    setBatchId(null);
    setBatch(null);
  };

  const created = batch?.results?.filter((r) => r.status === "created").length || 0;
  const skipped = batch?.results?.filter((r) => r.status === "skipped_duplicate").length || 0;
  const errored = batch?.results?.filter((r) => r.status === "error").length || 0;

  // Regroupe les erreurs identiques — sur un batch de 300 lignes, répéter le même
  // message 300 fois masque la vraie cause ; un résumé groupé la rend évidente
  // d'un coup d'œil (ex. "263 lignes : Type d'annonce manquant").
  const errorGroups = Object.values(
    (batch?.results || [])
      .filter((r) => r.status === "error")
      .flatMap((r) => (r.errors?.length ? r.errors : ["Erreur inconnue"]).map((message) => ({ message, rowIndex: r.rowIndex })))
      .reduce((acc, { message, rowIndex }) => {
        if (!acc[message]) acc[message] = { message, count: 0, firstRow: rowIndex };
        acc[message].count += 1;
        return acc;
      }, {})
  ).sort((a, b) => b.count - a.count);

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
          <p className={styles.hint}>
            Importez directement votre propre fichier (inventaire, export de votre logiciel de gestion...) —
            vous pourrez vérifier/ajuster la correspondance des colonnes à l'étape suivante.
          </p>

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
                <p className={styles.dropSub}>ou cliquez pour sélectionner (.csv ou .xlsx)</p>
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
            disabled={!file || analyzing}
            onClick={handleSubmitFile}
          >
            {analyzing ? "Analyse en cours..." : "Analyser mon fichier →"}
          </button>
        </div>
      )}

      {step === 2 && method === "google_sheet" && (
        <div className={styles.card}>
          <button type="button" className={styles.backBtn} onClick={backToMethods}>← Changer de méthode</button>
          <h2 className={styles.cardTitle}>Google Sheet</h2>
          <p className={styles.hint}>
            Partagez votre feuille en "Lecture pour toute personne disposant du lien", puis collez son URL ci-dessous —
            la correspondance des colonnes sera à vérifier à l'étape suivante.
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
            disabled={!googleSheetUrl.trim() || analyzing}
            onClick={handleSubmitGoogleSheet}
          >
            {analyzing ? "Analyse en cours..." : "Analyser cette feuille →"}
          </button>
        </div>
      )}

      {step === "mapping" && preview && (
        <div className={styles.card}>
          <button type="button" className={styles.backBtn} onClick={() => setStep(2)}>← Changer de fichier</button>
          <h2 className={styles.cardTitle}>Vérifiez la correspondance des colonnes</h2>
          <p className={styles.hint}>
            {preview.totalRows} véhicule(s) détecté(s). Associez chaque champ VIT AUTO à la colonne correspondante
            de votre fichier — la suggestion automatique n'est pas toujours exacte, vérifiez-la avant de continuer.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {preview.columns.map((col) => (
              <div key={col.key} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label style={{ flex: "0 0 210px", fontSize: ".85rem", fontWeight: 700, color: "#334155" }}>
                  {col.label}{col.required ? " *" : ""}
                </label>
                <select
                  value={mapping[col.key] || ""}
                  onChange={(e) => setMappingField(col.key, e.target.value)}
                  style={{ flex: "1 1 200px", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
                >
                  <option value="">— Aucune colonne (ignorer) —</option>
                  {preview.detectedHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {!isExport && businesses.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <label style={{ display: "block", fontSize: ".85rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Quelle entreprise pour tous les véhicules de cet import ?
              </label>
              <select
                value={selectedBusinessId}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}
              >
                <option value="">Compte personnel (aucune entreprise)</option>
                {businesses.map((b) => (
                  <option key={b._id} value={b._id}>{b.companyName} — {b.ville}, {b.country}</option>
                ))}
              </select>
            </div>
          )}

          {!isExport && !mapping.type && (
            <div style={{ marginTop: 18, padding: "14px 18px", background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: 12 }}>
              <strong style={{ display: "block", fontSize: ".85rem", marginBottom: 8, color: "#1e3a8a" }}>
                Aucune colonne location/vente sélectionnée — quel type pour TOUS les véhicules de cet import ?
              </strong>
              <div style={{ display: "flex", gap: 18 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem" }}>
                  <input type="radio" name="defaultType" checked={defaultType === "location"} onChange={() => setDefaultType("location")} />
                  Location
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".85rem" }}>
                  <input type="radio" name="defaultType" checked={defaultType === "vente"} onChange={() => setDefaultType("vente")} />
                  Vente
                </label>
              </div>
            </div>
          )}

          <button
            type="button"
            className={styles.primaryBtn}
            style={{ marginTop: 18 }}
            disabled={submitting || missingTypeMapping}
            onClick={confirmMappingAndImport}
          >
            {submitting ? "Import en cours..." : `Importer ${preview.totalRows} véhicule(s) →`}
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

              {errorGroups.length > 0 && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                  <strong style={{ display: "block", color: "#991b1b", fontSize: ".88rem", marginBottom: 8 }}>
                    Motifs d'erreur les plus fréquents :
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {errorGroups.slice(0, 5).map((g) => (
                      <li key={g.message} style={{ color: "#991b1b", fontSize: ".82rem", marginBottom: 4 }}>
                        <strong>{g.count} ligne{g.count > 1 ? "s" : ""}</strong> : {g.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
