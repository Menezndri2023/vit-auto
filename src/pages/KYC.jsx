import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource, CameraDirection } from "@capacitor/camera";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/apiClient";
import { hashDocument } from "../utils/kycEngine.js";
import { extractDocumentOcr, checkDocumentQuality, initOcrWorker } from "../utils/ocrEngine.js";
import { compareFaces, checkSelfieQuality } from "../utils/faceAnalysis.js";
import { validateExpiryDate } from "../utils/idValidation.js";
import { requiresBusinessDocs } from "../constants/partnerTaxonomy";
import styles from "./KYC.module.css";

const DOC_TYPES = [
  { value: "cni",          icon: "🪪", label: "Carte Nationale d'Identité" },
  { value: "passport",     icon: "📘", label: "Passeport" },
  { value: "permis",       icon: "🚗", label: "Permis de conduire" },
  { value: "carte_sejour", icon: "📋", label: "Titre de séjour" },
];

/* ── 4 étapes de base ; une 5e (permis de conduire) est ajoutée dynamiquement
   pour l'activité chauffeur — voir isDriverFlow plus bas. ────────────────── */
const BASE_STEPS = [
  { id: 1, label: "Contacts",  icon: "📧" },
  { id: 2, label: "Document",  icon: "📄" },
  { id: 3, label: "Selfie",    icon: "🤳" },
  { id: 4, label: "Résultat",  icon: "🛡️" },
];
const DRIVER_STEP = { id: 5, label: "Permis",  icon: "🚘" };

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
  // Activité chauffeur (choisie à l'inscription — voir Register.jsx/authController.js)
  // OU redirection explicite ?next=driver-docs (voir src/utils/partnerRequirements.js) :
  // dans les deux cas, une 5e étape "Permis de conduire" s'ajoute, obligatoire
  // avant de pouvoir publier un profil chauffeur (voir driverController.js missingDriverDocs).
  //
  // Bug réel confirmé (base réelle Atlas, 2026-08-02) : ce paramètre d'URL est
  // transitoire — quand l'identité nécessite une revue manuelle admin (le cas
  // courant, pas l'auto-approbation instantanée), le partenaire quitte cette
  // page en attente puis revient PLUS TARD (notification "Identité vérifiée"
  // qui pointe vers /profile, pas vers cette URL avec le paramètre). isDriverFlow
  // redevenait alors faux pour tout partenaire dont l'activité principale
  // n'est pas "chauffeur" — l'étape 5 ne réapparaissait jamais, bloquant la
  // création du profil chauffeur indéfiniment malgré une identité désormais
  // vérifiée (confirmé : plusieurs comptes avec identity.status=verified mais
  // driverLicenseOcr jamais rempli). Flag localStorage posé au moment de la
  // redirection initiale (VendorSubmit.jsx) et lu ici en plus du paramètre
  // d'URL, pour survivre à l'aller-retour KYC admin.
  const driverIntent = (() => {
    try { return localStorage.getItem("vit_driver_intent") === "1"; } catch { return false; }
  })();
  const isDriverFlow = user?.activity === "chauffeur" || searchParams.get("next") === "driver-docs" || driverIntent;
  const STEPS = isDriverFlow ? [...BASE_STEPS, DRIVER_STEP] : BASE_STEPS;

  const [step, setStep] = useState(1);

  /* ── STEP 1 ─────────────────────────────────────────────────────────── */
  const [emailVerified,   setEmailVerified]   = useState(user?.emailVerified || false);
  // La vérification téléphone (OTP SMS) a été retirée du parcours KYC : la
  // délivrabilité n'est pas fiable selon les pays (ex. numéros chinois +86,
  // souvent filtrés par l'opérateur local) et bloquait certains utilisateurs
  // à l'étape 1 sans aucune échappatoire. Seul l'email fait foi désormais ;
  // phoneVerified reste lu/affiché (donnée existante du compte) mais ne
  // conditionne plus rien ici.
  const [phoneVerified,   setPhoneVerified]   = useState(user?.phoneVerified || false);
  const [emailResent,     setEmailResent]     = useState(false);
  const [emailError,      setEmailError]      = useState("");
  // Tant que la délivrabilité en production n'est pas fiable,
  // la vérification email ne doit pas non plus bloquer le KYC (voir
  // emailVerificationRequired dans la réponse de /api/kyc/status).
  const [emailVerifRequired, setEmailVerifRequired] = useState(true);
  // Un compte n'a qu'un seul moyen de contact (email OU téléphone — voir Register.jsx) :
  // on ne doit exiger/afficher que la vérification du canal réellement associé au compte.
  const [hasEmail, setHasEmail] = useState(!!user?.email);
  const [hasPhone, setHasPhone] = useState(!!user?.phone);

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

  /* ── STEP 5 — Permis de conduire (chauffeur uniquement) ───────────────── */
  const [existingLicense,    setExistingLicense]    = useState(null); // driverLicenseOcr déjà en base (voir /api/kyc/status)
  const [licenseFrontUrl,    setLicenseFrontUrl]    = useState(null);
  const [licenseBackUrl,     setLicenseBackUrl]     = useState(null);
  const [licenseOcrData,     setLicenseOcrData]     = useState(null);
  const [licenseNumber,      setLicenseNumber]      = useState("");
  const [licenseCategories,  setLicenseCategories]  = useState("");
  const [licenseSubmitting,  setLicenseSubmitting]  = useState(false);
  const [licenseSubmitted,   setLicenseSubmitted]   = useState(false);
  const [licenseError,       setLicenseError]       = useState("");
  const licenseFrontRef = useRef(null);
  const licenseBackRef  = useRef(null);
  const licenseAlreadyVerified = !!(existingLicense?.licenseNumber && !existingLicense?.isExpired);

  // ── Relance du programme Founding Partner depuis le KYC ──────────────────
  // null = pas encore chargé, [] = aucun dossier. Un dossier par entité (voir
  // server/models/PartnerOnboarding.js businessId) — la plupart des partenaires
  // n'en ont qu'un, mais le CTA doit rester correct même sans en avoir aucun.
  const [myOnboardings, setMyOnboardings] = useState(null);
  useEffect(() => {
    if (!token || !requiresBusinessDocs(user?.entityType)) return;
    api.get("/api/partner-onboarding/my/all")
      .then((d) => setMyOnboardings(d?.onboardings || []))
      .catch(() => setMyOnboardings([]));
  }, [token, user?.entityType]);

  useEffect(() => { initOcrWorker().catch(() => {}); }, []);

  useEffect(() => {
    if (!token) return;
    api.get("/api/kyc/status")
      .then((d) => {
        if (!d) return;
        setEmailVerified(d.emailVerified);
        setPhoneVerified(d.phoneVerified);
        if (typeof d.emailVerificationRequired === "boolean") setEmailVerifRequired(d.emailVerificationRequired);
        if (typeof d.hasEmail === "boolean") setHasEmail(d.hasEmail);
        if (typeof d.hasPhone === "boolean") setHasPhone(d.hasPhone);
        if (d.driverLicenseOcr) setExistingLicense(d.driverLicenseOcr);
        if (d.kycStatus && d.kycStatus !== "EN_ATTENTE" && d.kycSubmittedAt) {
          setKycResult(d); setSubmitted(true); setStep(4);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  /* ════════ STEP 1 ════════════════════════════════════════════════════════ */
  const handleResendEmail = async () => {
    setEmailError(""); setEmailResent(false);
    try {
      await api.post("/api/auth/resend-verification", { email: user?.email });
      setEmailResent(true);
    } catch (err) { setEmailError(err.message || "Erreur d'envoi."); }
  };

  /* ════════ STEP 2 — Document + OCR ══════════════════════════════════════ */
  const resetDocument = useCallback(() => {
    setDocFrontUrl(null); setDocBackUrl(null); setDocHash(null); setDocBackHash(null);
    setDocBackOk(false);
    setDocImageOk(false); setOcrData(null); setOcrError("");
    setDocQualityError(""); setDocQuality(null); setOcrProgress(0);
    setExpiryValid({ ok: null, message: "" });
  }, []);

  const processDocumentImageUrl = useCallback(async (url, side) => {
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
  }, [docType]);

  const processDocumentImage = useCallback(async (file, side) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setDocQualityError("Format non autorisé. Utilisez JPG, PNG ou WebP."); return; }
    if (file.size > 15 * 1024 * 1024) { setDocQualityError("Fichier trop volumineux (max 15 Mo)."); return; }

    const reader = new FileReader();
    reader.onload = (e) => processDocumentImageUrl(e.target.result, side);
    reader.readAsDataURL(file);
  }, [processDocumentImageUrl]);

  // Capture native (iOS/Android) — ouvre directement l'appareil photo/galerie
  // du système au lieu du sélecteur de fichier web (décision produit validée :
  // UI caméra native plutôt que reproduire l'écran web).
  const captureDocumentNative = useCallback(async (side) => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 90,
      });
      if (photo.dataUrl) await processDocumentImageUrl(photo.dataUrl, side);
    } catch { /* utilisateur a annulé */ }
  }, [processDocumentImageUrl]);

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

  // Selfie natif (iOS/Android) — appareil photo frontal natif ou galerie,
  // remplace le flux getUserMedia + cadre ovale custom (natif uniquement).
  const handleNativeSelfie = useCallback(async (source) => {
    setSelfieError("");
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: source === "gallery" ? CameraSource.Photos : CameraSource.Camera,
        direction: CameraDirection.Front,
        quality: 90,
      });
      if (photo.dataUrl) await processSelfie(photo.dataUrl, docFrontUrl);
    } catch { /* utilisateur a annulé */ }
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

  /* ════════ STEP 5 — Permis de conduire ═══════════════════════════════════ */
  // OCR appliqué au permis (documentType="permis", même moteur que l'étape 2)
  // à titre de pré-remplissage uniquement — le numéro reste modifiable et
  // obligatoire à la saisie manuelle : un OCR raté ne doit jamais empêcher un
  // chauffeur de soumettre son permis (contrairement à l'identité, driverController.js
  // missingDriverDocs exige un licenseNumber non vide pour publier).
  const processLicenseImageUrl = useCallback(async (url, side) => {
    setLicenseError("");
    if (side === "back") { setLicenseBackUrl(url); return; }
    setLicenseFrontUrl(url);
    try {
      const extracted = await extractDocumentOcr(url, "permis", () => {});
      setLicenseOcrData(extracted);
      if (extracted?.documentNumber && !licenseNumber) setLicenseNumber(extracted.documentNumber);
    } catch { /* non bloquant, voir commentaire ci-dessus */ }
  }, [licenseNumber]);

  const processLicenseImage = useCallback(async (file, side) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setLicenseError("Format non autorisé. Utilisez JPG, PNG ou WebP."); return; }
    if (file.size > 15 * 1024 * 1024) { setLicenseError("Fichier trop volumineux (max 15 Mo)."); return; }
    const reader = new FileReader();
    reader.onload = (e) => processLicenseImageUrl(e.target.result, side);
    reader.readAsDataURL(file);
  }, [processLicenseImageUrl]);

  const captureLicenseNative = useCallback(async (side) => {
    try {
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, quality: 90 });
      if (photo.dataUrl) await processLicenseImageUrl(photo.dataUrl, side);
    } catch { /* utilisateur a annulé */ }
  }, [processLicenseImageUrl]);

  const handleSubmitLicense = async () => {
    if (!licenseFrontUrl || !licenseBackUrl) { setLicenseError("Le recto et le verso du permis sont obligatoires."); return; }
    if (!licenseNumber.trim()) { setLicenseError("Le numéro de permis est obligatoire."); return; }
    setLicenseSubmitting(true); setLicenseError("");
    try {
      const frontHash = await hashDocument(licenseFrontUrl);
      await api.post("/api/kyc/submit-driver-license", {
        licenseOcrData: {
          licenseNumber:  licenseNumber.trim(),
          expiryDate:     licenseOcrData?.expiryDate || null,
          issuingCountry: licenseOcrData?.issuingCountry || null,
          categories:     licenseCategories.trim() || null,
          rawOcrText:     licenseOcrData?.rawOcrText || null,
        },
        licenseImageHash: frontHash,
        frontImageData: licenseFrontUrl,
        backImageData:  licenseBackUrl,
      });
      setLicenseSubmitted(true);
      try { localStorage.removeItem("vit_driver_intent"); } catch { /* ignore */ }
    } catch (err) {
      setLicenseError(err.message || "Erreur lors de l'enregistrement du permis.");
    } finally {
      setLicenseSubmitting(false);
    }
  };

  // Guards APRÈS tous les hooks (règle React) — redirige vers login si non connecté
  if (!token) {
    const kycSearch = returnTo !== "/dashboard" ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    return <Navigate to="/login" state={{ from: { pathname: "/kyc", search: kycSearch } }} replace />;
  }

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
  // La vérification téléphone n'est plus requise (email uniquement, voir
  // section "Téléphone" plus haut) — exclue du décompte pour que le dossier
  // puisse honnêtement atteindre 100% sans elle.
  const TOTAL_STEPS = 3;
  const completedCount = [emailVerified, docImageOk, selfieOk].filter(Boolean).length;

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
              strokeDasharray={`${(completedCount / TOTAL_STEPS) * 113} 113`}
              strokeLinecap="round" transform="rotate(-90 22 22)"/>
          </svg>
          <div className={styles.heroProgressText}>
            <span className={styles.heroProgressNum}>{completedCount}</span>
            <span className={styles.heroProgressMax}>/{TOTAL_STEPS}</span>
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

          {/* Email — uniquement pour les comptes inscrits par email */}
          {hasEmail && (
            <div className={styles.verifySection}>
              <div className={styles.verifyRow}>
                <div className={[styles.verifyDot, emailVerified ? styles.verifyDotOk : styles.verifyDotPending].join(" ")} />
                <div className={styles.verifyInfo}>
                  <span className={styles.verifyLabel}>Adresse email</span>
                  <span className={styles.verifyValue}>{user.email}</span>
                </div>
                {emailVerified
                  ? <span className={styles.badgeOk}>✓ Vérifié</span>
                  : emailVerifRequired
                    ? <span className={styles.badgePending}>Non confirmé</span>
                    : <span className={styles.badgePending}>Facultatif pour l'instant</span>}
              </div>
              {!emailVerified && (
                <div className={styles.verifyAction}>
                  {!emailResent
                    ? <button className={styles.actionBtn} onClick={handleResendEmail}>📨 Renvoyer le lien</button>
                    : <div className={styles.infoBox}><strong>Email envoyé !</strong><p>Cliquez sur le lien reçu à <em>{user.email}</em>, puis revenez et actualisez la page.</p></div>
                  }
                  {emailError && <p className={styles.errorMsg}>{emailError}</p>}
                  {!emailVerifRequired && (
                    <p style={{ marginTop: 8, fontSize: "0.82rem", color: "#94a3b8" }}>
                      La confirmation par email est momentanément facultative — vous pouvez continuer votre dossier sans attendre le lien.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Téléphone — informatif uniquement. Sur demande explicite, le KYC ne
              conditionne plus rien à une confirmation par SMS (délivrabilité
              peu fiable selon les pays, ex. numéros chinois filtrés par
              l'opérateur local) : seul l'email fait foi pour cette étape. */}
          {hasPhone && (
            <div className={styles.verifySection}>
              <div className={styles.verifyRow}>
                <div className={styles.verifyDot} />
                <div className={styles.verifyInfo}>
                  <span className={styles.verifyLabel}>Téléphone</span>
                  <span className={styles.verifyValue}>{user.phone}</span>
                </div>
                <span className={styles.badgePending}>Non requis pour l'instant</span>
              </div>
              <div className={styles.infoBox}>
                <p>Seule votre adresse email doit être confirmée pour continuer — aucune confirmation par SMS n'est requise pour l'instant.</p>
              </div>
            </div>
          )}

          <div className={styles.cardFooter}>
            <div />
            {/* Seul l'email conditionne la suite — plus d'attente sur une
                confirmation par SMS (voir section Téléphone ci-dessus). */}
            <button className={styles.primaryBtn} onClick={() => setStep(2)}
              disabled={hasEmail && emailVerifRequired && !emailVerified}>
              {(hasEmail && emailVerifRequired && !emailVerified) ? "Complétez la vérification" : "Continuer →"}
            </button>
          </div>
          {(hasEmail && emailVerifRequired && !emailVerified) && (
            <p className={styles.gateMsg}>
              Votre email doit être vérifié pour continuer.
            </p>
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
              <div className={styles.uploadZone} onClick={() => Capacitor.isNativePlatform() ? captureDocumentNative("front") : frontRef.current?.click()}>
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
                <div className={styles.uploadZone} style={{ borderColor: "#fca5a5", background: "#fff7f7" }} onClick={() => Capacitor.isNativePlatform() ? captureDocumentNative("back") : backRef.current?.click()}>
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
              {Capacitor.isNativePlatform() ? (
                <>
                  <button className={styles.cameraBtn} onClick={() => handleNativeSelfie("camera")}>📷 Prendre un selfie</button>
                  <button className={styles.uploadBtnLabel} onClick={() => handleNativeSelfie("gallery")}>📎 Importer depuis la galerie</button>
                </>
              ) : (
                <>
                  <button className={styles.cameraBtn} onClick={handleStartCamera}>📷 Prendre un selfie</button>
                  <label className={styles.uploadBtnLabel}>
                    📎 Importer depuis la galerie
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleSelfieUpload} />
                  </label>
                </>
              )}
            </div>
          )}

          {!Capacitor.isNativePlatform() && cameraActive && (
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
                {kycResult?.kycStatus === "VERIFIE" && isDriverFlow && !licenseAlreadyVerified && (
                  <button className={styles.primaryBtn} onClick={() => setStep(5)}>
                    🚘 Continuer → Permis de conduire
                  </button>
                )}
                {kycResult?.kycStatus === "VERIFIE" && (!isDriverFlow || licenseAlreadyVerified) && (
                  <button className={styles.primaryBtn} onClick={() => navigate(returnTo)}>
                    🚗 Accéder aux réservations
                  </button>
                )}
                {kycResult?.kycStatus === "VERIFIE" && requiresBusinessDocs(user?.entityType) && myOnboardings !== null && (
                  <button className={styles.secondaryBtn} onClick={() => navigate("/partner-onboarding")}>
                    🏢 {myOnboardings.length > 0
                      ? "Reprendre mon dossier Founding Partner"
                      : "Démarrer mon dossier Founding Partner"}
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
              {/* Dossier(s) Founding Partner nécessitant une action — le wizard
                  (PartnerOnboardingPortal.jsx) positionne déjà l'étape correcte
                  selon le statut (STATUS_CONFIG), aucune logique de reprise à
                  dupliquer ici : le lien "Reprendre" ci-dessus suffit. */}
              {myOnboardings?.some((o) => ["rejete", "info_demandee"].includes(o.status)) && (
                <div className={styles.pendingInfo}>
                  {myOnboardings.filter((o) => ["rejete", "info_demandee"].includes(o.status)).map((o) => (
                    <p key={o._id}>
                      {o.status === "rejete" ? "❌ Dossier rejeté" : "📝 Informations complémentaires requises"}
                      {o.businessId?.companyName ? ` (${o.businessId.companyName})` : ""} :{" "}
                      {o.adminReview?.note || o.adminReview?.infoRequested || "Voir votre dossier pour le détail."}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ ÉTAPE 5 — PERMIS DE CONDUIRE (activité chauffeur) ══════════════ */}
      {step === 5 && isDriverFlow && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardHeaderIcon}>🚘</span>
            <div>
              <h2 className={styles.cardTitle}>Permis de conduire</h2>
              <p className={styles.cardDesc}>
                Obligatoire pour publier un profil chauffeur — vérifié une seule fois, valable pour toutes vos annonces.
              </p>
            </div>
          </div>

          {(licenseAlreadyVerified || licenseSubmitted) ? (
            <>
              <div className={styles.finalCard} style={{ borderColor: "#6ee7b7", background: "#d1fae5" }}>
                <div className={styles.finalEmoji}>✅</div>
                <div className={styles.finalStatus} style={{ color: "#059669" }}>
                  {licenseSubmitted ? "Permis enregistré" : "Permis déjà vérifié"}
                </div>
                <div className={styles.finalDesc}>
                  {licenseSubmitted
                    ? "Votre permis a été enregistré. Il sera pris en compte avec votre identité pour valider votre profil chauffeur."
                    : "Votre permis de conduire est déjà enregistré et non expiré."}
                </div>
              </div>
              <div className={styles.cardFooter}>
                <div />
                {/* Bug réel confirmé (compte réel bloqué 5 jours) : ce bouton
                    promettait "Créer mon profil chauffeur" mais renvoyait vers
                    /vendor/dashboard (gestion des annonces déjà publiées), pas
                    vers /vendor (le formulaire de publication qui restaure
                    automatiquement le brouillon chauffeur en attente). Le
                    partenaire atterrissait sur un tableau de bord vide sans
                    que rien ne se publie jamais. */}
                <button className={styles.primaryBtn} onClick={() => navigate("/vendor")}>
                  🚘 Créer mon profil chauffeur →
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={[styles.uploadBlock, licenseFrontUrl ? styles.uploadBlockDone : ""].join(" ")}>
                <div className={styles.uploadBlockHeader}>
                  <span>📷 Recto du permis</span>
                  {licenseFrontUrl && <span className={styles.uploadDoneTag}>✓ Ajouté</span>}
                </div>
                {!licenseFrontUrl ? (
                  <div className={styles.uploadZone} onClick={() => Capacitor.isNativePlatform() ? captureLicenseNative("front") : licenseFrontRef.current?.click()}>
                    <div className={styles.uploadZoneInner}>
                      <span className={styles.uploadZoneIcon}>📷</span>
                      <span className={styles.uploadZoneLabel}>Cliquez pour uploader le recto</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.docPreviewBlock}>
                    <img src={licenseFrontUrl} alt="Recto permis" className={styles.docPreview} />
                    <button className={styles.retakeBtn} onClick={() => { setLicenseFrontUrl(null); setLicenseOcrData(null); }}>🔄 Changer</button>
                  </div>
                )}
                <input ref={licenseFrontRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: "none" }}
                  onChange={(e) => processLicenseImage(e.target.files?.[0], "front")} />
              </div>

              <div className={[styles.uploadBlock, licenseBackUrl ? styles.uploadBlockDone : styles.uploadBlockRequired].join(" ")} style={{ marginTop: 12 }}>
                <div className={styles.uploadBlockHeader}>
                  <span>📷 Verso du permis <span className={styles.requiredTag}>Obligatoire</span></span>
                  {licenseBackUrl && <span className={styles.uploadDoneTag}>✓ Ajouté</span>}
                </div>
                {!licenseBackUrl ? (
                  <div className={styles.uploadZone} style={{ borderColor: "#fca5a5", background: "#fff7f7" }} onClick={() => Capacitor.isNativePlatform() ? captureLicenseNative("back") : licenseBackRef.current?.click()}>
                    <div className={styles.uploadZoneInner}>
                      <span className={styles.uploadZoneIcon}>📷</span>
                      <span className={styles.uploadZoneLabel}>Cliquez pour uploader le verso</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.docPreviewBlock}>
                    <img src={licenseBackUrl} alt="Verso permis" className={styles.docPreview} style={{ maxHeight: 150 }} />
                    <button className={styles.retakeBtn} onClick={() => setLicenseBackUrl(null)}>🔄 Changer</button>
                  </div>
                )}
                <input ref={licenseBackRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: "none" }}
                  onChange={(e) => processLicenseImage(e.target.files?.[0], "back")} />
              </div>

              <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                <label className={styles.fieldLabel}>Numéro de permis *</label>
                <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="Ex : 123456789" className={styles.textInput} />
                {licenseOcrData?.documentNumber && (
                  <p style={{ fontSize: ".78rem", color: "#8493b0", margin: "4px 0 0" }}>
                    Détecté automatiquement — vérifiez et corrigez si besoin.
                  </p>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Catégories (optionnel)</label>
                <input type="text" value={licenseCategories} onChange={(e) => setLicenseCategories(e.target.value)}
                  placeholder="Ex : B, D" className={styles.textInput} />
              </div>

              {licenseError && <p className={styles.errorMsg}>❌ {licenseError}</p>}

              <div className={styles.cardFooter}>
                <div />
                <button className={styles.primaryBtn} onClick={handleSubmitLicense} disabled={licenseSubmitting}>
                  {licenseSubmitting ? "Envoi en cours…" : "✅ Enregistrer mon permis"}
                </button>
              </div>
            </>
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
