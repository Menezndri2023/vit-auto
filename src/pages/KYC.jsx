import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/apiClient";
import { hashDocument } from "../utils/kycEngine.js";
import { extractDocumentOcr, checkDocumentQuality, initOcrWorker } from "../utils/ocrEngine.js";
import { compareFaces, checkSelfieQuality } from "../utils/faceAnalysis.js";
import { validateExpiryDate } from "../utils/idValidation.js";
import styles from "./KYC.module.css";

const DOC_TYPES = [
  { value: "cni",          icon: "🪪", label: "Carte Nationale d'Identité" },
  { value: "passport",     icon: "📘", label: "Passeport" },
  { value: "permis",       icon: "🚗", label: "Permis de conduire" },
  { value: "carte_sejour", icon: "📋", label: "Titre de séjour" },
];

/* ── 4 étapes (permis retiré du flux KYC) ───────────────────────────────── */
const STEPS = [
  { id: 1, label: "Contacts",  icon: "📧" },
  { id: 2, label: "Document",  icon: "📄" },
  { id: 3, label: "Selfie",    icon: "🤳" },
  { id: 4, label: "Résultat",  icon: "🛡️" },
];

const KYC_STATUS = {
  VERIFIE:               { color: "#059669", bg: "#d1fae5", border: "#6ee7b7", emoji: "✅", label: "IDENTITÉ VÉRIFIÉE" },
  EN_ATTENTE:            { color: "#d97706", bg: "#fef3c7", border: "#fcd34d", emoji: "⏳", label: "EN ATTENTE D'EXAMEN" },
  A_REVOIR_MANUELLEMENT: { color: "#2563eb", bg: "#dbeafe", border: "#93c5fd", emoji: "🔍", label: "EXAMEN EN COURS" },
  REFUSE:                { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", emoji: "❌", label: "DOSSIER REFUSÉ" },
};

export default function KYC() {
  const { user, token, updateUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/dashboard";

  const [step, setStep] = useState(1);

  /* ── STEP 1 ─────────────────────────────────────────────────────────── */
  const [emailVerified,   setEmailVerified]   = useState(user?.emailVerified || false);
  const [phoneVerified,   setPhoneVerified]   = useState(user?.phoneVerified || false);
  const [phoneNumber,     setPhoneNumber]     = useState(user?.phone || "");
  const [otpSent,         setOtpSent]         = useState(false);
  const [otpCode,         setOtpCode]         = useState("");
  const [otpBtnLoading,   setOtpBtnLoading]   = useState(false);
  const [otpVerifLoading, setOtpVerifLoading] = useState(false);
  const [otpError,        setOtpError]        = useState("");
  const [otpSuccess,      setOtpSuccess]      = useState("");
  const [devOtp,          setDevOtp]          = useState("");
  const [emailResent,     setEmailResent]     = useState(false);
  const [emailError,      setEmailError]      = useState("");
  // Tant qu'aucun provider SMS réel n'est configuré côté serveur, la vérification
  // téléphone ne doit pas bloquer la suite du KYC (voir smsAvailable dans la réponse
  // de /api/kyc/status). Défaut à true pour ne pas relâcher la contrainte avant
  // d'avoir la confirmation du serveur (évite un flash "autorisé" → "bloqué").
  const [smsAvailable,    setSmsAvailable]    = useState(true);

  /* ── STEP 2 — Document + OCR ─────────────────────────────────────────── */
  const [docType,         setDocType]         = useState("cni");
  const [docFrontUrl,     setDocFrontUrl]     = useState(null);
  const [docBackUrl,      setDocBackUrl]      = useState(null);
  const [docHash,         setDocHash]         = useState(null);
  const [docBackHash,     setDocBackHash]     = useState(null);
  const [docBackOk,       setDocBackOk]       = useState(false); // verso CNI
  const [docQuality,      setDocQuality]      = useState(null);
  const [docQualityError, setDocQualityError] = useState("");
  const [ocrRunning,      setOcrRunning]      = useState(false);
  const [ocrProgress,     setOcrProgress]     = useState(0);
  const [ocrData,         setOcrData]         = useState(null);
  const [ocrError,        setOcrError]        = useState("");
  const [docImageOk,      setDocImageOk]      = useState(false);
  const [expiryValid,     setExpiryValid]     = useState({ ok: null, message: "" });
  const frontRef = useRef(null);
  const backRef  = useRef(null);

  /* ── STEP 3 — Selfie ─────────────────────────────────────────────────── */
  const [selfieUrl,        setSelfieUrl]        = useState(null);
  const [selfieOk,         setSelfieOk]         = useState(false);
  const [selfieError,      setSelfieError]      = useState("");
  const [cameraActive,     setCameraActive]     = useState(false);
  const [cameraError,      setCameraError]      = useState("");
  const [videoReady,       setVideoReady]       = useState(false);
  const [faceMatchScore,   setFaceMatchScore]   = useState(null);
  const [faceMatchLoading, setFaceMatchLoading] = useState(false);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  /* ── STEP 4 — Soumission ─────────────────────────────────────────────── */
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [kycResult,   setKycResult]   = useState(null);

  useEffect(() => { initOcrWorker().catch(() => {}); }, []);

  useEffect(() => {
    if (!token) return;
    api.get("/api/kyc/status")
      .then((d) => {
        if (!d) return;
        setEmailVerified(d.emailVerified);
        setPhoneVerified(d.phoneVerified);
        if (typeof d.smsAvailable === "boolean") setSmsAvailable(d.smsAvailable);
        if (d.kycStatus && d.kycStatus !== "EN_ATTENTE" && d.kycSubmittedAt) {
          setKycResult(d); setSubmitted(true); setStep(4);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  // Guard APRÈS tous les hooks — redirige vers login si non connecté
  if (!token) {
    const kycSearch = returnTo !== "/dashboard" ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    return <Navigate to="/login" state={{ from: { pathname: "/kyc", search: kycSearch } }} replace />;
  }

  /* ════════ STEP 1 ════════════════════════════════════════════════════════ */
  const handleResendEmail = async () => {
    setEmailError(""); setEmailResent(false);
    try {
      await api.post("/api/auth/resend-verification", { email: user?.email });
      setEmailResent(true);
    } catch (err) { setEmailError(err.message || "Erreur d'envoi."); }
  };

  const handleSendPhoneOtp = async () => {
    if (!phoneNumber.trim()) { setOtpError("Saisissez votre numéro."); return; }
    setOtpBtnLoading(true); setOtpError(""); setOtpSuccess(""); setDevOtp(""); setOtpSent(false); setOtpCode("");
    try {
      const d = await api.post("/api/auth/send-phone-otp", { phone: phoneNumber.trim(), userId: user?.id || user?._id });
      if (d.alreadyVerified) { setPhoneVerified(true); setOtpSuccess("Téléphone déjà vérifié."); return; }
      setOtpSent(true); setOtpSuccess(d.message || "Code envoyé par SMS.");
      if (d.devOtp) setDevOtp(d.devOtp);
    } catch (err) { setOtpError(err.message || "Erreur SMS."); }
    finally { setOtpBtnLoading(false); }
  };

  const handleVerifyPhoneOtp = async () => {
    if (otpCode.trim().length !== 6) { setOtpError("Code à 6 chiffres requis."); return; }
    setOtpVerifLoading(true); setOtpError("");
    try {
      const d = await api.post("/api/auth/verify-phone-otp", { phone: phoneNumber.trim(), userId: user?.id || user?._id, otp: otpCode.trim() });
      setPhoneVerified(true); setOtpSuccess("Téléphone vérifié !"); setDevOtp("");
      if (d.token) updateUser({ ...(d.user || {}), phoneVerified: true, phone: phoneNumber });
      else         updateUser({ phoneVerified: true, phone: phoneNumber });
    } catch (err) { setOtpError(err.message || "Code incorrect ou expiré."); }
    finally { setOtpVerifLoading(false); }
  };

  /* ════════ STEP 2 — Document + OCR ══════════════════════════════════════ */
  const resetDocument = useCallback(() => {
    setDocFrontUrl(null); setDocBackUrl(null); setDocHash(null); setDocBackHash(null);
    setDocBackOk(false);
    setDocImageOk(false); setOcrData(null); setOcrError("");
    setDocQualityError(""); setDocQuality(null); setOcrProgress(0);
    setExpiryValid({ ok: null, message: "" });
  }, []);

  const processDocumentImage = useCallback(async (file, side) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setDocQualityError("Format non autorisé. Utilisez JPG, PNG ou WebP."); return; }
    if (file.size > 15 * 1024 * 1024) { setDocQualityError("Fichier trop volumineux (max 15 Mo)."); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target.result;
      if (side === "back") {
        setDocBackUrl(url);
        const bh = await hashDocument(url);
        setDocBackHash(bh);
        // Contrôle qualité du verso aussi
        const bq = await checkDocumentQuality(url);
        setDocBackOk(bq.ok);
        return;
      }
      // Recto
      setDocFrontUrl(url); setDocImageOk(false); setOcrData(null);
      setOcrError(""); setDocQualityError(""); setDocQuality(null);

      const quality = await checkDocumentQuality(url);
      setDocQuality(quality);
      if (!quality.ok) { setDocQualityError(quality.message); return; }

      const h = await hashDocument(url);
      setDocHash(h);

      // Lancer OCR — montrer la barre immédiatement
      setOcrRunning(true);
      setOcrProgress(5);
      try {
        const extracted = await extractDocumentOcr(url, docType, (p) => setOcrProgress(Math.max(5, p)));
        if (!extracted.success || extracted.ocrConfidence < 20) {
          // OCR trop faible → accepter quand même mais signaler
          setOcrData({
            ...extracted,
            ocrConfidence: extracted.ocrConfidence || 0,
            _lowQuality: true,
          });
          setDocImageOk(true);
          return;
        }
        if (extracted.expiryDate) {
          const ev = validateExpiryDate(extracted.expiryDate);
          setExpiryValid(ev);
          if (ev.expired) { setOcrError(ev.message); return; }
        }
        setOcrData(extracted);
        setDocImageOk(true);
      } catch {
        setOcrError("Erreur OCR. Réessayez avec une image plus nette.");
      } finally {
        setOcrRunning(false);
        setOcrProgress(100);
      }
    };
    reader.readAsDataURL(file);
  }, [docType]);

  /* ════════ STEP 3 — Selfie ═══════════════════════════════════════════════ */
  const handleStopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setCameraActive(false); setVideoReady(false);
  }, []);

  const processSelfie = useCallback(async (url, frontUrl) => {
    setSelfieError(""); setSelfieOk(false); setFaceMatchScore(null);
    const quality = await checkSelfieQuality(url);
    if (!quality.ok) { setSelfieError(quality.message); return; }
    setSelfieUrl(url); setSelfieOk(true);
    const docUrl = frontUrl || docFrontUrl;
    if (docUrl) {
      setFaceMatchLoading(true);
      try { const m = await compareFaces(docUrl, url); setFaceMatchScore(m.score); }
      catch { setFaceMatchScore(50); }
      finally { setFaceMatchLoading(false); }
    }
  }, [docFrontUrl]);

  const handleStartCamera = useCallback(async () => {
    setCameraError(""); setCameraActive(true); setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current.play().catch(() => {}); setVideoReady(true); };
        videoRef.current.oncanplay = () => setVideoReady(true);
      }
    } catch (err) {
      setCameraError(
        err.name === "NotAllowedError" ? "Accès caméra refusé. Autorisez la caméra dans votre navigateur."
          : err.name === "NotFoundError" ? "Aucune caméra détectée. Importez un selfie depuis votre galerie."
          : "Impossible d'activer la caméra."
      );
      setCameraActive(false);
    }
  }, []);

  const handleCaptureSelfie = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) { setSelfieError("Caméra pas encore prête."); return; }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    handleStopCamera();
    await processSelfie(url, docFrontUrl);
  }, [handleStopCamera, processSelfie, docFrontUrl]);

  const handleSelfieUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => await processSelfie(ev.target.result, docFrontUrl);
    reader.readAsDataURL(file);
  }, [processSelfie, docFrontUrl]);

  /* ════════ STEP 4 — Soumission ═══════════════════════════════════════════ */
  const handleSubmitKyc = async () => {
    setSubmitting(true); setSubmitError("");
    try {
      const data = await api.post("/api/kyc/submit", {
        ocrData:        ocrData || {},
        documentType:   docType,
        frontImageHash: docHash,
        backImageHash:  docBackHash,
        selfieUploaded: selfieOk,
        faceMatchScore: faceMatchScore ?? 0,
        emailVerified,
        phoneVerified,
        frontImageData: docFrontUrl || null,
        backImageData:  docBackUrl  || null,
        selfieData:     selfieUrl   || null,
      });
      setKycResult(data);
      setSubmitted(true);
      updateUser({
        kycStatus:         data.kycStatus,
        kycScore:          data.kycScore,
        kycBadge:          data.kycBadge,
        documentsVerified: data.kycStatus === "VERIFIE",
      });
    } catch (err) { setSubmitError(err.message || "Connexion impossible. Vérifiez votre réseau."); }
    finally { setSubmitting(false); }
  };

  if (!user) {
    return (
      <div className={styles.page}>
        <div className={styles.gateBox}>
          <div className={styles.gateIcon}>🔐</div>
          <h2>Connexion requise</h2>
          <p>Vous devez être connecté pour vérifier votre identité.</p>
          <button className={styles.primaryBtn} onClick={() => navigate("/login")}>Se connecter</button>
        </div>
      </div>
    );
  }

  const statusCfg  = KYC_STATUS[kycResult?.kycStatus] || KYC_STATUS["EN_ATTENTE"];
  // Verso obligatoire pour CNI, permis et carte de séjour
  const versoRequired = ["cni", "permis", "carte_sejour"].includes(docType);
  const canGoStep3 = docImageOk && (!versoRequired || docBackOk);
  const canSubmit  = selfieOk;
  const completedCount = [emailVerified, phoneVerified, docImageOk, selfieOk].filter(Boolean).length;

  return (
    <div className={styles.page}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Vérification d'identité KYC</h1>
          <p className={styles.heroSub}>Complétez votre dossier pour accéder aux réservations VIT AUTO.</p>
        </div>
        <div className={styles.heroProgress}>
          <svg viewBox="0 0 44 44" className={styles.heroProgressCircle}>
            <circle cx="22" cy="22" r="18" fill="none" stroke="#e2e8f0" strokeWidth="4"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="#6366f1" strokeWidth="4"
              strokeDasharray={`${(completedCount / 4) * 113} 113`}
              strokeLinecap="round" transform="rotate(-90 22 22)"/>
          </svg>
          <div className={styles.heroProgressText}>
            <span className={styles.heroProgressNum}>{completedCount}</span>
            <span className={styles.heroProgressMax}>/4</span>
          </div>
        </div>
      </div>

      {/* ── Barre d'étapes ────────────────────────────────────────────── */}
      <div className={styles.stepsBar}>
        {STEPS.map((s, i) => (
          <div key={s.id} className={styles.stepWrapper}>
            <div
              className={[styles.stepDot, step === s.id ? styles.stepDotActive : "", step > s.id ? styles.stepDotDone : ""].filter(Boolean).join(" ")}
              onClick={() => step > s.id && setStep(s.id)}
              role={step > s.id ? "button" : undefined}
            >
              <div className={styles.stepDotCircle}>{step > s.id ? "✓" : s.icon}</div>
              <span className={styles.stepDotLabel}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={[styles.stepLine, step > s.id ? styles.stepLineDone : ""].filter(Boolean).join(" ")} />
            )}
          </div>
        ))}
      </div>

      {/* ══ ÉTAPE 1 — EMAIL + TÉLÉPHONE ════════════════════════════════ */}
      {step === 1 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>📧</span>
            <div>
              <h2 className={styles.cardTitle}>Coordonnées de contact</h2>
              <p className={styles.cardDesc}>Vérifiez votre email et téléphone avant de continuer.</p>
            </div>
          </div>

          {/* Email */}
          <div className={styles.verifySection}>
            <div className={styles.verifyRow}>
              <div className={[styles.verifyDot, emailVerified ? styles.verifyDotOk : styles.verifyDotPending].join(" ")} />
              <div className={styles.verifyInfo}>
                <span className={styles.verifyLabel}>Adresse email</span>
                <span className={styles.verifyValue}>{user.email}</span>
              </div>
              {emailVerified
                ? <span className={styles.badgeOk}>✓ Vérifié</span>
                : <span className={styles.badgePending}>Non confirmé</span>}
            </div>
            {!emailVerified && (
              <div className={styles.verifyAction}>
                {!emailResent
                  ? <button className={styles.actionBtn} onClick={handleResendEmail}>📨 Renvoyer le lien</button>
                  : <div className={styles.infoBox}><strong>Email envoyé !</strong><p>Cliquez sur le lien reçu à <em>{user.email}</em>, puis revenez et actualisez la page.</p></div>
                }
                {emailError && <p className={styles.errorMsg}>{emailError}</p>}
              </div>
            )}
          </div>

          {/* Téléphone */}
          <div className={styles.verifySection}>
            <div className={styles.verifyRow}>
              <div className={[styles.verifyDot, phoneVerified ? styles.verifyDotOk : styles.verifyDotPending].join(" ")} />
              <div className={styles.verifyInfo}>
                <span className={styles.verifyLabel}>Téléphone</span>
                <span className={styles.verifyValue}>{phoneVerified ? (phoneNumber || user.phone || "Vérifié") : "Non vérifié"}</span>
              </div>
              {phoneVerified
                ? <span className={styles.badgeOk}>✓ Vérifié</span>
                : smsAvailable
                  ? <span className={styles.badgePending}>Non vérifié</span>
                  : <span className={styles.badgePending}>Facultatif pour l'instant</span>}
            </div>
            {!phoneVerified && !smsAvailable && (
              <div className={styles.infoBox}>
                <strong>Vérification SMS momentanément indisponible.</strong>
                <p>Vous pouvez continuer votre dossier sans confirmer votre téléphone pour l'instant ; cette étape ne vous bloquera pas.</p>
              </div>
            )}
            {!phoneVerified && smsAvailable && (
              <div className={styles.verifyAction}>
                <div className={styles.phoneRow}>
                  <input type="tel" className={styles.textInput} placeholder="+225 07 00 00 00 00"
                    value={phoneNumber} onChange={(e) => { setPhoneNumber(e.target.value); setOtpSent(false); setOtpError(""); setOtpSuccess(""); }} />
                  <button className={styles.actionBtn} onClick={handleSendPhoneOtp} disabled={otpBtnLoading || !phoneNumber.trim()}>
                    {otpBtnLoading ? "Envoi…" : otpSent ? "Renvoyer" : "Envoyer le code"}
                  </button>
                </div>
                {otpSent && (
                  <div className={styles.otpBlock}>
                    <p className={styles.otpHint}>Code à 6 chiffres envoyé au <strong>{phoneNumber}</strong></p>
                    {devOtp && (
                      <div className={styles.devOtpBox}>
                        <span>Développement — Code :</span>
                        <strong onClick={() => setOtpCode(devOtp)} title="Cliquez pour remplir">{devOtp}</strong>
                      </div>
                    )}
                    <div className={styles.otpRow}>
                      <input type="text" inputMode="numeric"
                        className={[styles.otpInput, otpError ? styles.inputError : ""].join(" ")}
                        placeholder="• • • • • •" value={otpCode} maxLength={6}
                        onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }} />
                      <button className={styles.primaryBtn} onClick={handleVerifyPhoneOtp}
                        disabled={otpVerifLoading || otpCode.length !== 6}>
                        {otpVerifLoading ? "…" : "Vérifier"}
                      </button>
                    </div>
                  </div>
                )}
                {otpError   && <p className={styles.errorMsg}>{otpError}</p>}
                {otpSuccess && !otpError && <p className={styles.successMsg}>{otpSuccess}</p>}
              </div>
            )}
          </div>

          <div className={styles.cardFooter}>
            <div />
            <button className={styles.primaryBtn} onClick={() => setStep(2)} disabled={!emailVerified || (smsAvailable && !phoneVerified)}>
              {(!emailVerified || (smsAvailable && !phoneVerified)) ? "Complétez les vérifications" : "Continuer →"}
            </button>
          </div>
          {(!emailVerified || (smsAvailable && !phoneVerified)) && (
            <p className={styles.gateMsg}>Email et téléphone doivent tous deux être vérifiés pour continuer.</p>
          )}
        </div>
      )}

      {/* ══ ÉTAPE 2 — DOCUMENT + OCR ════════════════════════════════════ */}
      {step === 2 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>📄</span>
            <div>
              <h2 className={styles.cardTitle}>Document d'identité</h2>
              <p className={styles.cardDesc}>Prenez une photo nette. Le système lit automatiquement vos informations.</p>
            </div>
          </div>

          <div className={styles.kycNotice}>
            <span className={styles.kycNoticeIcon}>⚠️</span>
            <span>La photo est <strong>obligatoire</strong>. Les données lues automatiquement par OCR ne peuvent pas être modifiées. En cas de lisibilité insuffisante, votre dossier sera examiné manuellement.</span>
          </div>

          {/* Type de document */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Type de document</label>
            <div className={styles.docTypeGrid}>
              {DOC_TYPES.map((d) => (
                <button key={d.value} type="button"
                  className={[styles.docTypeBtn, docType === d.value ? styles.docTypeBtnActive : ""].join(" ")}
                  onClick={() => { setDocType(d.value); resetDocument(); }}>
                  <span className={styles.docTypeBtnIcon}>{d.icon}</span><span>{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Upload recto */}
          <div className={[styles.uploadBlock, docImageOk ? styles.uploadBlockDone : ""].join(" ")}>
            <div className={styles.uploadBlockHeader}>
              <span>📷 Recto du document</span>
              {docImageOk && <span className={styles.uploadDoneTag}>✓ Analysé</span>}
            </div>
            <p className={styles.uploadHint}>JPG · PNG · WebP — Bonne lumière, document entier visible — Max 15 Mo</p>

            {!docFrontUrl ? (
              <div className={styles.uploadZone} onClick={() => frontRef.current?.click()}>
                <div className={styles.uploadZoneInner}>
                  <span className={styles.uploadZoneIcon}>📷</span>
                  <span className={styles.uploadZoneLabel}>Cliquez pour uploader la photo recto</span>
                  <span className={styles.uploadZoneSub}>Ou glissez-déposez votre image ici</span>
                </div>
              </div>
            ) : (
              <div className={styles.docPreviewBlock}>
                <img src={docFrontUrl} alt="Recto document" className={styles.docPreview} />
                {!ocrRunning && (
                  <button className={styles.retakeBtn} onClick={resetDocument}>🔄 Changer de document</button>
                )}
              </div>
            )}
            <input ref={frontRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: "none" }}
              onChange={(e) => processDocumentImage(e.target.files?.[0], "front")} />

            {/* Barre OCR — visible immédiatement */}
            {ocrRunning && (
              <div className={styles.ocrProgressBlock}>
                <div className={styles.ocrProgressBar}>
                  <div className={styles.ocrProgressFill} style={{ width: `${ocrProgress}%` }} />
                </div>
                <p className={styles.ocrProgressText}>Lecture OCR en cours… {ocrProgress}%</p>
              </div>
            )}

            {docQualityError && <p className={styles.errorMsg}>❌ {docQualityError}</p>}
            {ocrError        && <p className={styles.errorMsg}>❌ {ocrError}</p>}
            {docQuality?.ok && !ocrRunning && !ocrError && (
              <p className={styles.successMsg}>✓ Qualité image acceptable ({docQuality.score}/100)</p>
            )}
          </div>

          {/* Verso — OBLIGATOIRE pour CNI, permis, carte de séjour */}
          {versoRequired && docFrontUrl && docImageOk && (
            <div className={[styles.uploadBlock, docBackOk ? styles.uploadBlockDone : styles.uploadBlockRequired].join(" ")} style={{ marginTop: 12 }}>
              <div className={styles.uploadBlockHeader}>
                <span>📷 Verso — {docType === "cni" ? "CNI" : docType === "permis" ? "Permis de conduire" : "Document"} <span className={styles.requiredTag}>Obligatoire</span></span>
                {docBackOk && <span className={styles.uploadDoneTag}>✓ Verso accepté</span>}
              </div>
              <p className={styles.uploadHint}>
                Le recto seul ne suffit pas. Le verso est obligatoire pour vérifier l'authenticité de votre document.
              </p>
              {!docBackUrl ? (
                <div className={styles.uploadZone} style={{ borderColor: "#fca5a5", background: "#fff7f7" }} onClick={() => backRef.current?.click()}>
                  <div className={styles.uploadZoneInner}>
                    <span className={styles.uploadZoneIcon}>📷</span>
                    <span className={styles.uploadZoneLabel}>Uploader le verso de votre CNI</span>
                    <span className={styles.uploadZoneSub}>JPG · PNG · WebP — Max 15 Mo</span>
                  </div>
                </div>
              ) : (
                <div className={styles.docPreviewBlock}>
                  <img src={docBackUrl} alt="Verso CNI" className={styles.docPreview} style={{ maxHeight: 150 }} />
                  <button className={styles.retakeBtn} onClick={() => { setDocBackUrl(null); setDocBackHash(null); setDocBackOk(false); }}>
                    🔄 Changer le verso
                  </button>
                </div>
              )}
              <input ref={backRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: "none" }}
                onChange={(e) => processDocumentImage(e.target.files?.[0], "back")} />
            </div>
          )}

          {/* Résultats OCR — champs verrouillés */}
          {ocrData && docImageOk && (
            <div className={styles.ocrResultCard}>
              <div className={styles.ocrResultHeader}>
                <span className={styles.ocrResultIcon}>{ocrData._lowQuality ? "⚠️" : "✅"}</span>
                <div className={styles.ocrResultTitles}>
                  <strong>{ocrData._lowQuality ? "Lisibilité faible — examen manuel" : "Données extraites automatiquement"}</strong>
                  <span className={styles.ocrConfBadge}>OCR : {ocrData.ocrConfidence}% de confiance</span>
                </div>
                <span className={styles.ocrLockIcon}>🔒</span>
              </div>

              {/* Afficher seulement les champs réellement extraits */}
              {(ocrData.firstName || ocrData.lastName || ocrData.documentNumber || ocrData.issuingCountry || ocrData.birthDate || ocrData.expiryDate) ? (
                <div className={styles.ocrGrid}>
                  {ocrData.firstName     && <OcrField label="Prénom"        value={ocrData.firstName} />}
                  {ocrData.lastName      && <OcrField label="Nom"           value={ocrData.lastName} />}
                  {ocrData.birthDate     && <OcrField label="Date de naissance" value={new Date(ocrData.birthDate + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} />}
                  {ocrData.gender        && <OcrField label="Sexe"          value={ocrData.gender === "M" ? "Masculin" : "Féminin"} />}
                  {ocrData.documentNumber && <OcrField label="N° Document"   value={ocrData.documentNumber} />}
                  {ocrData.expiryDate    && <OcrField label="Expiration"    value={new Date(ocrData.expiryDate + "T00:00:00").toLocaleDateString("fr-FR")} expired={expiryValid.ok === false} />}
                  {ocrData.issuingCountry && <OcrField label="Pays émetteur" value={ocrData.issuingCountry} />}
                </div>
              ) : (
                <p style={{ fontSize: ".85rem", color: "#92400e", margin: "4px 0 0" }}>
                  Aucune donnée lisible extraite — votre dossier sera examiné manuellement à partir de la photo du document.
                </p>
              )}

              {ocrData.ocrConfidence < 55 && !ocrData._lowQuality && (
                <div className={styles.ocrWarnBox}>
                  Confiance OCR faible ({ocrData.ocrConfidence}%) — votre dossier sera examiné par notre équipe sous 24h.
                </div>
              )}
            </div>
          )}

          <div className={styles.cardFooter}>
            <button className={styles.secondaryBtn} onClick={() => setStep(1)}>← Retour</button>
            <button className={styles.primaryBtn} onClick={() => setStep(3)} disabled={!canGoStep3}>
              {!docImageOk
                ? "Uploadez d'abord le recto"
                : versoRequired && !docBackOk
                ? `Le verso du ${docType === "cni" ? "CNI" : "permis"} est obligatoire`
                : "Continuer → Selfie"}
            </button>
          </div>
        </div>
      )}

      {/* ══ ÉTAPE 3 — SELFIE ════════════════════════════════════════════ */}
      {step === 3 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>🤳</span>
            <div>
              <h2 className={styles.cardTitle}>Selfie de vérification</h2>
              <p className={styles.cardDesc}>Prenez une photo de votre visage. Le système la compare avec votre document.</p>
            </div>
          </div>

          {!selfieOk && !cameraActive && (
            <div className={styles.selfieActions}>
              <button className={styles.cameraBtn} onClick={handleStartCamera}>📷 Prendre un selfie</button>
              <label className={styles.uploadBtnLabel}>
                📎 Importer depuis la galerie
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleSelfieUpload} />
              </label>
            </div>
          )}

          {cameraActive && (
            <div className={styles.cameraBlock}>
              <div className={styles.cameraGuide}>
                <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
                <div className={styles.cameraOval} />
                {!videoReady && (
                  <div className={styles.cameraLoading}>
                    <div className={styles.cameraSpinner} />
                    <span>Activation de la caméra…</span>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} style={{ display: "none" }} />
              {videoReady && <p className={styles.cameraHint}>Centrez votre visage dans le cadre ovale</p>}
              <div className={styles.cameraControls}>
                <button className={styles.captureBtn} onClick={handleCaptureSelfie} disabled={!videoReady}>
                  {videoReady ? "📸 Capturer" : "Chargement…"}
                </button>
                <button className={styles.cancelBtn} onClick={handleStopCamera}>Annuler</button>
              </div>
              {cameraError && <p className={styles.errorMsg}>{cameraError}</p>}
            </div>
          )}

          {selfieOk && selfieUrl && (
            <div className={styles.selfiePreview}>
              <img src={selfieUrl} alt="Selfie" className={styles.selfieImg} />
              <div className={styles.selfieBadge}>✓ Selfie enregistré</div>
              {faceMatchLoading && <p className={styles.ocrProgressText}>Comparaison du visage avec le document…</p>}
              {faceMatchScore !== null && !faceMatchLoading && (
                <div className={[styles.faceMatchResult, faceMatchScore >= 65 ? styles.faceMatchOk : styles.faceMatchWarn].join(" ")}>
                  {faceMatchScore >= 85
                    ? `✅ Correspondance excellente (${faceMatchScore}%)`
                    : faceMatchScore >= 65
                    ? `✓ Correspondance acceptable (${faceMatchScore}%)`
                    : `⚠ Score faible (${faceMatchScore}%) — examen manuel de votre dossier`}
                </div>
              )}
              <button className={styles.retakeBtn} onClick={() => { setSelfieOk(false); setSelfieUrl(null); setFaceMatchScore(null); }}>
                🔄 Reprendre le selfie
              </button>
            </div>
          )}

          {selfieError && <p className={styles.errorMsg}>{selfieError}</p>}

          <div className={styles.selfieRules}>
            <span className={styles.selfieRulesTitle}>Règles :</span>
            <ul>
              <li>✓ Visage entier visible et centré</li>
              <li>✓ Bonne lumière, fond neutre</li>
              <li>✗ Pas de lunettes de soleil ni de masque</li>
              <li>✗ Pas de filtre ni de retouche</li>
            </ul>
          </div>

          <div className={styles.cardFooter}>
            <button className={styles.secondaryBtn} onClick={() => setStep(2)}>← Retour</button>
            <button className={styles.primaryBtn} onClick={() => setStep(4)} disabled={!canSubmit}>
              {canSubmit ? "Continuer → Soumettre mon dossier" : "Prenez votre selfie pour continuer"}
            </button>
          </div>
        </div>
      )}

      {/* ══ ÉTAPE 4 — RÉCAP + SOUMISSION ════════════════════════════════ */}
      {step === 4 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>🛡️</span>
            <div>
              <h2 className={styles.cardTitle}>Dossier KYC VIT AUTO</h2>
              {!submitted && <p className={styles.cardDesc}>Vérifiez votre récapitulatif avant de soumettre.</p>}
            </div>
          </div>

          {!submitted ? (
            <>
              <div className={styles.summaryBlock}>
                <p className={styles.summaryTitle}>Récapitulatif du dossier</p>
                <div className={styles.summaryGrid}>
                  <SummaryItem ok={emailVerified}  label="Email vérifié" />
                  <SummaryItem ok={phoneVerified}  label="Téléphone vérifié" />
                  <SummaryItem ok={docImageOk}     label={`Document scanné (OCR ${ocrData?.ocrConfidence ?? 0}%)`} />
                  <SummaryItem ok={selfieOk}        label="Selfie enregistré" />
                  {faceMatchScore !== null && (
                    <SummaryItem ok={faceMatchScore >= 65} warn={faceMatchScore >= 40 && faceMatchScore < 65}
                      label={`Correspondance visage : ${faceMatchScore}%`} />
                  )}
                </div>
              </div>

              {ocrData && (
                <div className={styles.ocrResultCard} style={{ marginBottom: 16 }}>
                  <div className={styles.ocrResultHeader}>
                    <span className={styles.ocrResultIcon}>📄</span>
                    <div className={styles.ocrResultTitles}><strong>Données soumises</strong></div>
                    <span className={styles.ocrLockIcon}>🔒</span>
                  </div>
                  <div className={styles.ocrGrid}>
                    {ocrData.firstName      && <OcrField label="Prénom"     value={ocrData.firstName} />}
                    {ocrData.lastName       && <OcrField label="Nom"        value={ocrData.lastName} />}
                    {ocrData.documentNumber && <OcrField label="N° Document" value={ocrData.documentNumber} />}
                    {ocrData.issuingCountry && <OcrField label="Pays"       value={ocrData.issuingCountry} />}
                  </div>
                  {(!ocrData.firstName && !ocrData.lastName && !ocrData.documentNumber) && (
                    <p style={{ fontSize: ".83rem", color: "#92400e", margin: "8px 0 0", fontStyle: "italic" }}>
                      La photo du document sera examinée manuellement par notre équipe.
                    </p>
                  )}
                </div>
              )}

              {submitError && <p className={styles.errorMsg}>{submitError}</p>}

              <div className={styles.cardFooter}>
                <button className={styles.secondaryBtn} onClick={() => setStep(3)}>← Retour</button>
                <button className={styles.primaryBtn} onClick={handleSubmitKyc} disabled={submitting}>
                  {submitting ? "Envoi en cours…" : "✅ Soumettre mon dossier KYC"}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.finalResult}>
              <div className={styles.finalCard} style={{ borderColor: statusCfg.border, background: statusCfg.bg }}>
                <div className={styles.finalEmoji}>{statusCfg.emoji}</div>
                <div className={styles.finalStatus} style={{ color: statusCfg.color }}>{statusCfg.label}</div>
                <div className={styles.finalDesc}>
                  {kycResult?.kycStatus === "VERIFIE"               && "Votre identité a été vérifiée. Vous pouvez accéder à toutes les réservations."}
                  {kycResult?.kycStatus === "EN_ATTENTE"            && "Votre dossier a bien été reçu. Notre équipe l'examine et vous notifiera sous 24 à 48h."}
                  {kycResult?.kycStatus === "A_REVOIR_MANUELLEMENT" && "Votre dossier est en cours d'examen approfondi. Résultat attendu sous 24h."}
                  {kycResult?.kycStatus === "REFUSE"                && (kycResult.kycRejectionReason || "Dossier refusé. Contactez notre support.")}
                </div>
                {kycResult?.kycScore !== undefined && (
                  <div className={styles.finalScore}>Score : {kycResult.kycScore} / 100</div>
                )}
              </div>
              <div className={styles.finalActions}>
                {kycResult?.kycStatus === "VERIFIE" && (
                  <button className={styles.primaryBtn} onClick={() => navigate(returnTo)}>
                    🚗 Accéder aux réservations
                  </button>
                )}
                {kycResult?.kycStatus === "REFUSE" && (
                  <button className={styles.secondaryBtn} onClick={() => {
                    setSubmitted(false); setStep(1); setKycResult(null); resetDocument();
                    setSelfieOk(false); setSelfieUrl(null);
                  }}>
                    🔄 Recommencer le dossier
                  </button>
                )}
                {(kycResult?.kycStatus === "EN_ATTENTE" || kycResult?.kycStatus === "A_REVOIR_MANUELLEMENT") && (
                  <button className={styles.primaryBtn} onClick={() => navigate("/dashboard")}>
                    Retour au tableau de bord
                  </button>
                )}
              </div>
              {(kycResult?.kycStatus === "EN_ATTENTE" || kycResult?.kycStatus === "A_REVOIR_MANUELLEMENT") && (
                <div className={styles.pendingInfo}>
                  <p>📨 Notification par email à <strong>{user.email}</strong> dès que votre dossier sera traité.</p>
                  <p>⏱ Délai habituel : <strong>24 à 48 heures</strong> ouvrables.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OcrField({ label, value, expired }) {
  return (
    <div className={styles.ocrField}>
      <label className={styles.ocrFieldLabel}>{label}</label>
      <div className={[styles.ocrFieldValue, expired ? styles.ocrFieldExpired : ""].filter(Boolean).join(" ")}>{value}</div>
    </div>
  );
}

function SummaryItem({ ok, warn, label }) {
  const cls  = ok ? styles.summaryOk : warn ? styles.summaryWarn : styles.summaryKo;
  const icon = ok ? "✅" : warn ? "⚠" : "❌";
  return <div className={[styles.summaryItem, cls].join(" ")}>{icon} {label}</div>;
}
