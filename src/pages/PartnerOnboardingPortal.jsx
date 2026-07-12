import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./PartnerOnboardingPortal.module.css";

const API_BASE = "/api/partner-onboarding";

const apiFetch = (path, token, opts = {}) =>
  fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });

// ── Constantes ────────────────────────────────────────────────────────────────
const PARTNER_TYPES = [
  { value: "concessionnaire",         label: "Dealer / Concessionnaire",     icon: "🏢" },
  { value: "agence_location",         label: "Rental Agency",                icon: "🔑" },
  { value: "importateur_exportateur", label: "Importer & Exporter",          icon: "🚢" },
  { value: "chauffeur_professionnel", label: "Professional Driver",           icon: "🧑‍✈️" },
  { value: "expert_auto",             label: "Automotive Expert",             icon: "🔧" },
  { value: "transitaire_logistique",  label: "Freight & Logistics",          icon: "📦" },
  { value: "financement",             label: "Financing Partner",             icon: "🏦" },
  { value: "assurance",               label: "Insurance Partner",             icon: "🛡️" },
  { value: "inspecteur_vehicles",     label: "Vehicle Inspector",             icon: "🔍" },
];

const STATUS_CONFIG = {
  brouillon:     { label: "Draft",              color: "#64748b", bg: "#f8fafc", step: 0 },
  soumis:        { label: "Submitted",          color: "#3b82f6", bg: "#eff6ff", step: 1 },
  en_review:     { label: "Under Review",       color: "#f59e0b", bg: "#fffbeb", step: 1 },
  info_demandee: { label: "Info Required",      color: "#f97316", bg: "#fff7ed", step: 1 },
  loi_envoyee:   { label: "LOI Ready to Sign",  color: "#8b5cf6", bg: "#f5f3ff", step: 2 },
  loi_signee:    { label: "LOI Signed",         color: "#0891b2", bg: "#ecfeff", step: 3 },
  accord_envoye: { label: "Agreement Ready",    color: "#8b5cf6", bg: "#f5f3ff", step: 3 },
  accord_signe:  { label: "Agreement Signed",   color: "#059669", bg: "#ecfdf5", step: 4 },
  actif:         { label: "Active Partner",     color: "#059669", bg: "#ecfdf5", step: 4 },
  rejete:        { label: "Rejected",           color: "#dc2626", bg: "#fef2f2", step: -1 },
};

const STEPS = [
  { id: 0, label: "Type & Info",  icon: "1" },
  { id: 1, label: "Documents",    icon: "2" },
  { id: 2, label: "Business",     icon: "3" },
  { id: 3, label: "Submit",       icon: "4" },
  { id: 4, label: "LOI / Sign",   icon: "5" },
];

// ── Constantes StepBusiness (module-level pour éviter les réallocations) ─────
const VEHICLE_TYPES = [
  { key: "newVehicles",        label: "Véhicules neufs" },
  { key: "usedVehicles",       label: "Véhicules d'occasion" },
  { key: "electricVehicles",   label: "Véhicules électriques" },
  { key: "hybridVehicles",     label: "Hybrides" },
  { key: "luxuryVehicles",     label: "Luxe & Premium" },
  { key: "commercialVehicles", label: "Utilitaires / Commerciaux" },
];

const ENTITY_TYPES = [
  { key: "factory",  label: "🏭 Usine / Fabricant" },
  { key: "dealer",   label: "🏪 Concessionnaire" },
  { key: "exporter", label: "🚢 Exportateur" },
  { key: "importer", label: "📦 Importateur" },
  { key: "agent",    label: "🤝 Agent / Courtier" },
];

const PAYMENT_MODES = [
  { key: "wire_transfer", label: "Virement bancaire" },
  { key: "lc",            label: "L/C (Lettre de crédit)" },
  { key: "tt",            label: "TT (Télégraphic Transfer)" },
  { key: "cash",          label: "Cash" },
  { key: "escrow",        label: "Escrow" },
];

const radioSt = { display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: ".85rem", color: "#374151" };
const inlineRow = { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 };

const toggleArr = (arr, setArr, val) =>
  setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

// ── Helper: field change ──────────────────────────────────────────────────────
function useFormState(initial = {}) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setVal = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));
  const reset = (data) => setForm(data);
  return { form, set, setVal, toggle, reset };
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function PartnerOnboardingPortal() {
  const { user, token } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [signModal, setSignModal] = useState(null); // "loi" | "agreement" | null
  // Message "programme complet" — renvoyé par le backend quand un compte connecté sans
  // dossier existant tente d'en créer un alors que les 20 places sont déjà prises.
  const [onboardingError, setOnboardingError] = useState(null);
  // true si le compte connecté n'a pas encore de dossier — GET /my est en lecture seule
  // (aucune création automatique) ; il faut un clic explicite sur "Commencer ma candidature".
  const [notStarted, setNotStarted] = useState(false);
  const [applying, setApplying] = useState(false);
  // Disponibilité vérifiée AVANT de proposer l'inscription aux visiteurs non connectés
  // (évite de laisser quelqu'un remplir tout le wizard pour se le voir refuser à la fin).
  const [availability, setAvailability] = useState(null);

  const load = useCallback(async () => {
    // Aucun dossier à charger pour un visiteur non connecté — sans ce retour anticipé,
    // `loading` (initialisé à true) ne repassait jamais à false et bloquait la page sur
    // l'écran de chargement indéfiniment (voir la vérification `!token` plus bas, jamais
    // atteinte). L'écran anonyme dépend ensuite uniquement de `availability`.
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setOnboardingError(null);
    setNotStarted(false);
    try {
      const r = await apiFetch("/my", token);
      if (r.ok) {
        const data = await r.json();
        setOnboarding(data.onboarding);
        // Position step selon statut
        const s = STATUS_CONFIG[data.onboarding.status];
        if (s) setActiveStep(Math.max(0, s.step));
      } else {
        const data = await r.json().catch(() => ({}));
        if (data.notStarted) setNotStarted(true);
        else setOnboardingError(data.message || "Impossible de charger votre dossier. Réessayez ou contactez contact@vit-auto.com.");
      }
    } catch (err) {
      console.error(err);
      setOnboardingError("Erreur réseau. Réessayez ou contactez contact@vit-auto.com.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Action explicite : crée le dossier (et promeut le rôle si besoin) — jamais déclenché
  // par un simple chargement de page.
  const applyToProgram = async () => {
    setApplying(true);
    try {
      const r = await apiFetch("/apply", token, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setOnboarding(data.onboarding);
        setNotStarted(false);
        addToast("Candidature démarrée — complétez votre dossier ci-dessous.", "success");
      } else if (data.programFull) {
        setOnboardingError(data.message);
      } else {
        addToast(data.message || "Erreur lors du démarrage de la candidature.", "error");
      }
    } catch {
      addToast("Erreur réseau.", "error");
    } finally {
      setApplying(false);
    }
  };

  // Visiteur non connecté : vérifier qu'il reste des places avant de proposer l'inscription
  useEffect(() => {
    if (token) return;
    fetch("/api/partner-onboarding/availability")
      .then((r) => r.json())
      .then((d) => setAvailability(d))
      .catch(() => setAvailability({ available: true, message: null })); // en cas d'erreur réseau, ne pas bloquer l'inscription — le backend revalidera de toute façon à la création du dossier
  }, [token]);

  const saveSection = async (sectionName, data) => {
    setSaving(true);
    try {
      const r = await apiFetch(`/section/${sectionName}`, token, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (r.ok) {
        setOnboarding(json.onboarding);
        addToast("Enregistré avec succès", "success");
        return true;
      } else {
        addToast(json.message || "Erreur lors de la sauvegarde", "error");
        return false;
      }
    } catch {
      addToast("Erreur réseau", "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setPartnerType = async (type) => {
    setSaving(true);
    try {
      const r = await apiFetch("/partner-type", token, {
        method: "PATCH",
        body: JSON.stringify({ partnerType: type }),
      });
      const json = await r.json();
      if (r.ok) setOnboarding(json.onboarding);
      else addToast(json.message || "Erreur", "error");
    } finally {
      setSaving(false);
    }
  };

  const acceptLegal = async () => {
    try {
      const r = await apiFetch("/accept-legal", token, {
        method: "PATCH",
        body: JSON.stringify({ accepted: true }),
      });
      const json = await r.json();
      if (r.ok) setOnboarding(json.onboarding);
      else addToast(json.message || "Erreur", "error");
    } catch {
      addToast("Erreur réseau", "error");
    }
  };

  const submitApplication = async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/submit", token, { method: "POST" });
      const json = await r.json();
      if (r.ok) {
        addToast(`Candidature soumise ! Réf: ${json.referenceNumber}`, "success");
        await load();
        setActiveStep(1);
      } else {
        addToast(json.message || "Erreur lors de la soumission", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const signDocument = async (type, signerName, signerPosition) => {
    setSaving(true);
    try {
      const r = await apiFetch(`/sign-${type}`, token, {
        method: "POST",
        body: JSON.stringify({ signerName, signerPosition }),
      });
      const json = await r.json();
      if (r.ok) {
        addToast(type === "loi" ? "LOI signée avec succès !" : "🎉 Accord signé — Vous êtes Founding Partner !", "success");
        setSignModal(null);
        await load();
      } else {
        addToast(json.message || "Erreur de signature", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;

  // Écran spécial si non connecté — attend d'abord de savoir s'il reste des places
  if (!token) {
    if (availability === null) return <LoadingScreen />;
    if (!availability.available) return <OnboardingErrorScreen message={availability.message} />;
    return <PublicHero />;
  }

  // Connecté mais sans dossier existant, et programme déjà complet
  if (onboardingError) return <OnboardingErrorScreen message={onboardingError} />;

  // Connecté sans dossier existant : ne rien créer tant que l'utilisateur n'a pas
  // cliqué explicitement — visiter cette page ne doit jamais, à elle seule, créer un
  // dossier ni changer le rôle du compte.
  if (notStarted) return <StartApplicationScreen onStart={applyToProgram} starting={applying} />;

  const status = onboarding?.status || "brouillon";
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.brouillon;
  const completion = onboarding?.completionPercent || 0;

  // Écran succès si accord signé
  if (["accord_signe", "actif"].includes(status)) {
    return <SuccessScreen onboarding={onboarding} onNavigate={() => navigate("/partner-pms")} />;
  }

  return (
    <div className={styles.portal}>
      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroLabel}>VIT-AUTO · FOUNDING PARTNER PROGRAM</div>
          <h1 className={styles.heroTitle}>
            Devenir Partenaire<br />
            <span className={styles.heroAccent}>Fondateur</span>
          </h1>
          <p className={styles.heroSub}>
            Rejoignez les 20 premiers partenaires. Commission réduite, abonnement offert 12 mois, badge exclusif.
          </p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}><span>12 mois</span><small>Abonnement offert</small></div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}><span>-33%</span><small>Sur les commissions</small></div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}><span>20+</span><small>Pays couverts</small></div>
          </div>
        </div>
        {/* Status badge */}
        <div className={styles.statusCard}>
          <div className={styles.statusBadge} style={{ background: statusCfg.bg, color: statusCfg.color }}>
            {statusCfg.label}
          </div>
          {onboarding?.referenceNumber && (
            <div className={styles.refNumber}>Réf. {onboarding.referenceNumber}</div>
          )}
          {/* Progress bar */}
          <div className={styles.progressWrap}>
            <div className={styles.progressLabel}>
              <span>Complétion du dossier</span>
              <span>{completion}%</span>
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${completion}%` }} />
            </div>
          </div>
          {/* Step indicators */}
          <div className={styles.stepTrack}>
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`${styles.stepDot} ${activeStep === s.id ? styles.stepActive : ""} ${activeStep > s.id ? styles.stepDone : ""}`}
                onClick={() => setActiveStep(s.id)}
                title={s.label}
              >
                {activeStep > s.id ? "✓" : s.icon}
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Alertes status ── */}
      {status === "info_demandee" && onboarding?.adminReview?.infoRequested && (
        <div className={styles.alertWarn}>
          <strong>📝 Informations complémentaires requises :</strong>{" "}
          {onboarding.adminReview.infoRequested}
        </div>
      )}
      {status === "rejete" && (
        <div className={styles.alertError}>
          <strong>Candidature non retenue.</strong>{" "}
          {onboarding?.adminReview?.note && `Motif : ${onboarding.adminReview.note}`}
          {" "}Contactez-nous à contact@vit-auto.com pour plus d'informations.
        </div>
      )}
      {["loi_envoyee", "loi_signee", "accord_envoye"].includes(status) && (
        <DocumentSigningBanner
          status={status}
          onboarding={onboarding}
          onSign={(type) => setSignModal(type)}
        />
      )}

      {/* ── Corps principal ── */}
      <div className={styles.body}>
        {/* Sidebar navigation */}
        <nav className={styles.sidebar}>
          {STEPS.map((s) => (
            <button
              key={s.id}
              className={`${styles.sideBtn} ${activeStep === s.id ? styles.sideBtnActive : ""}`}
              onClick={() => setActiveStep(s.id)}
            >
              <span className={styles.sideBtnNum}>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
          {/* Benefits reminder */}
          <div className={styles.benefitsBox}>
            <h4>Avantages Fondateur</h4>
            <ul>
              <li>✓ 12 mois offerts</li>
              <li>✓ Location : 10% (vs 15%)</li>
              <li>✓ Vente : 2% (vs 3%)</li>
              <li>✓ Badge exclusif</li>
              <li>✓ Priorité catalogue</li>
              <li>✓ Accès early features</li>
            </ul>
          </div>
        </nav>

        {/* Content */}
        <div className={styles.content}>
          {activeStep === 0 && (
            <StepTypeInfo
              onboarding={onboarding}
              saving={saving}
              onSaveSection={saveSection}
              onSetType={setPartnerType}
              onNext={() => setActiveStep(1)}
            />
          )}
          {activeStep === 1 && (
            <StepDocuments
              onboarding={onboarding}
              saving={saving}
              onSaveSection={saveSection}
              onNext={() => setActiveStep(2)}
              onBack={() => setActiveStep(0)}
            />
          )}
          {activeStep === 2 && (
            <StepBusiness
              onboarding={onboarding}
              saving={saving}
              onSaveSection={saveSection}
              onNext={() => setActiveStep(3)}
              onBack={() => setActiveStep(1)}
            />
          )}
          {activeStep === 3 && (
            <StepReview
              onboarding={onboarding}
              saving={saving}
              status={status}
              onSubmit={submitApplication}
              onBack={() => setActiveStep(2)}
              onEditStep={setActiveStep}
              onAcceptLegal={acceptLegal}
            />
          )}
          {activeStep === 4 && (
            <StepDocumentSigning
              onboarding={onboarding}
              status={status}
              token={token}
              onSign={(type) => setSignModal(type)}
            />
          )}
        </div>
      </div>

      {/* ── Modal Signature ── */}
      {signModal && (
        <SignatureModal
          type={signModal}
          onboarding={onboarding}
          saving={saving}
          onSign={signDocument}
          onClose={() => setSignModal(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ÉTAPE 0 : Type de partenaire + Informations entreprise
// ════════════════════════════════════════════════════════════════════════════════
function StepTypeInfo({ onboarding, saving, onSaveSection, onSetType, onNext }) {
  const ci = onboarding?.companyInfo || {};
  const { form, set, reset } = useFormState({
    legalName: ci.legalName || "",
    registrationNumber: ci.registrationNumber || "",
    registrationCountry: ci.registrationCountry || "",
    address: ci.address || "",
    website: ci.website || "",
    email: ci.email || "",
    phone: ci.phone || "",
    whatsapp: ci.whatsapp || "",
    wechat: ci.wechat || "",
    mainContact: ci.mainContact || "",
    mainContactPosition: ci.mainContactPosition || "",
    incorporationDate: ci.incorporationDate ? ci.incorporationDate.slice(0, 10) : "",
  });

  useEffect(() => {
    const ci = onboarding?.companyInfo || {};
    reset({
      legalName: ci.legalName || "",
      registrationNumber: ci.registrationNumber || "",
      registrationCountry: ci.registrationCountry || "",
      address: ci.address || "",
      website: ci.website || "",
      email: ci.email || "",
      phone: ci.phone || "",
      whatsapp: ci.whatsapp || "",
      wechat: ci.wechat || "",
      mainContact: ci.mainContact || "",
      mainContactPosition: ci.mainContactPosition || "",
      incorporationDate: ci.incorporationDate ? ci.incorporationDate.slice(0, 10) : "",
    });
  }, [onboarding]);

  const handleSave = async () => {
    const ok = await onSaveSection("company-info", form);
    if (ok) onNext();
  };

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>🏢</div>
        <div>
          <h2>Type de partenaire & Informations entreprise</h2>
          <p>Choisissez votre catégorie et renseignez les informations de votre entreprise (VA-FP-001 — Section 1)</p>
        </div>
      </div>

      {/* Choix du type */}
      <div className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Type de partenaire</h3>
        <div className={styles.typeGrid}>
          {PARTNER_TYPES.map((pt) => (
            <button
              key={pt.value}
              className={`${styles.typeCard} ${onboarding?.partnerType === pt.value ? styles.typeCardActive : ""}`}
              onClick={() => onSetType(pt.value)}
              disabled={saving}
            >
              <span className={styles.typeIcon}>{pt.icon}</span>
              <span>{pt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Informations entreprise */}
      <div className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Informations entreprise</h3>
        <div className={styles.formGrid}>
          <Field label="Nom légal de l'entreprise *" value={form.legalName} onChange={set("legalName")} placeholder="Ex. VIT MOTORS SARL" />
          <Field label="Numéro d'immatriculation *" value={form.registrationNumber} onChange={set("registrationNumber")} placeholder="Ex. RC-2023-12345" />
          <Field label="Pays d'immatriculation *" value={form.registrationCountry} onChange={set("registrationCountry")} placeholder="Ex. Côte d'Ivoire" />
          <Field label="Date de création" value={form.incorporationDate} onChange={set("incorporationDate")} type="date" />
          <Field label="Adresse complète" value={form.address} onChange={set("address")} placeholder="Adresse du siège social" />
          <Field label="Site web" value={form.website} onChange={set("website")} placeholder="https://exemple.com" />
          <Field label="Email entreprise" value={form.email} onChange={set("email")} type="email" placeholder="contact@entreprise.com" />
          <Field label="Téléphone" value={form.phone} onChange={set("phone")} placeholder="+225 07 00 00 00 00" />
          <Field label="WhatsApp" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+225 07 00 00 00 00" />
          <Field label="WeChat ID" value={form.wechat} onChange={set("wechat")} placeholder="ID WeChat (pour partenaires chinois)" />
          <Field label="Personne de contact principal" value={form.mainContact} onChange={set("mainContact")} placeholder="Prénom Nom" />
          <Field label="Poste / Fonction" value={form.mainContactPosition} onChange={set("mainContactPosition")} placeholder="Ex. Directeur Commercial" />
        </div>
      </div>

      <div className={styles.stepActions}>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !form.legalName}>
          {saving ? "Enregistrement…" : "Enregistrer & Continuer →"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ÉTAPE 1 : Documents légaux
// ════════════════════════════════════════════════════════════════════════════════
function StepDocuments({ onboarding, saving, onSaveSection, onNext, onBack }) {
  const docs = onboarding?.legalDocs || {};
  const [files, setFiles] = useState({
    businessRegistration: docs.businessRegistration || null,
    businessLicense: docs.businessLicense || null,
    exportLicense: docs.exportLicense || null,
    taxCertificate: docs.taxCertificate || null,
    proofOfAddress: docs.proofOfAddress || null,
  });
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    const d = onboarding?.legalDocs || {};
    setFiles({
      businessRegistration: d.businessRegistration || null,
      businessLicense: d.businessLicense || null,
      exportLicense: d.exportLicense || null,
      taxCertificate: d.taxCertificate || null,
      proofOfAddress: d.proofOfAddress || null,
    });
  }, [onboarding]);

  const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
  const handleFile = (key) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      setFileError(`"${file.name}" dépasse la limite de 5 Mo. Compressez le fichier et réessayez.`);
      e.target.value = "";
      return;
    }
    setFileError("");
    const reader = new FileReader();
    reader.onloadend = () => setFiles((f) => ({ ...f, [key]: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const ok = await onSaveSection("legal-docs", files);
    if (ok) onNext();
  };

  const DOC_FIELDS = [
    { key: "businessRegistration", label: "Certificat d'immatriculation *",          hint: "RCCM, Kbis, Business Registration…" },
    { key: "businessLicense",      label: "Licence commerciale",                      hint: "Business License, Trade License…" },
    { key: "exportLicense",        label: "Licence d'export (si applicable)",         hint: "Export License" },
    { key: "taxCertificate",       label: "Attestation fiscale (si applicable)",      hint: "Tax Registration Certificate" },
    { key: "proofOfAddress",       label: "Justificatif d'adresse",                   hint: "Facture, relevé bancaire avec adresse…" },
  ];

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>📁</div>
        <div>
          <h2>Documents légaux</h2>
          <p>Fournissez vos documents officiels pour la vérification (VA-FP-001 — Section 2)</p>
        </div>
      </div>

      {fileError && (
        <div className={styles.alertError} style={{ margin: "0 0 1rem" }}>
          ⚠️ {fileError}
        </div>
      )}
      <div className={styles.sectionBlock}>
        <div className={styles.docGrid}>
          {DOC_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className={styles.docUpload}>
              <div className={styles.docLabel}>{label}</div>
              <div className={styles.docHint}>{hint}</div>
              {files[key] ? (
                <div className={styles.docUploaded}>
                  <span>✅ Document chargé</span>
                  <button className={styles.docRemove} onClick={() => setFiles((f) => ({ ...f, [key]: null }))}>×</button>
                </div>
              ) : (
                <label className={styles.docDropzone}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile(key)} />
                  <span>📎 Cliquez pour choisir un fichier</span>
                  <small>PDF, JPG ou PNG — max 5 Mo</small>
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.stepActions}>
        <button className={styles.btnSecondary} onClick={onBack}>← Retour</button>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer & Continuer →"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ÉTAPE 2 : Vérification commerciale + Capacités + Inventaire
// ════════════════════════════════════════════════════════════════════════════════
function StepBusiness({ onboarding, saving, onSaveSection, onNext, onBack }) {
  const bv = onboarding?.businessVerification || {};
  const vi = onboarding?.vehicleInventory || {};
  const ec = onboarding?.exportCapabilities || {};
  const pi = onboarding?.paymentInfo || {};
  const ct = onboarding?.commercialTerms || {};

  const [brands, setBrands] = useState((bv.brands || []).join(", "));
  const [exportMarkets, setExportMarkets] = useState((bv.exportMarkets || []).join(", "));
  const [activities, setActivities] = useState((bv.mainActivities || []).join(", "));
  const [years, setYears] = useState(bv.yearsExperience || 0);
  const [annualCap, setAnnualCap] = useState(bv.annualExportCapacity || "");
  const [entityTypes, setEntityTypes] = useState(bv.entityTypes || []);

  const [vInv, setVInv] = useState({ ...vi });
  const [ports, setPorts] = useState((ec.shippingPorts || []).join(", "));
  const [incoterms, setIncoterms] = useState(ec.incoterms || { exw: false, fob: false, cif: false, dap: false, ddp: false });
  const [currency, setCurrency] = useState(pi.preferredCurrency || "");
  const [minQty, setMinQty] = useState(ct.minimumOrderQuantity || "");

  // Conditions commerciales structurées
  const [paymentModes, setPaymentModes]   = useState(ct.paymentModes || []);
  const [depositPct, setDepositPct]       = useState(ct.depositPercentage ?? null);
  const [depositTiming, setDepositTiming] = useState(ct.depositTiming || "");
  const [deliveryDays, setDeliveryDays]   = useState(ct.deliveryDays ?? null);
  const [warrantyAvail, setWarrantyAvail] = useState(ct.warrantyAvailable ?? null);
  const [warrantyMonths, setWarrantyMonths] = useState(ct.warrantyMonths ?? "");
  const [inspType, setInspType]           = useState(ct.inspectionType || "");
  const [inspAgency, setInspAgency]       = useState(ct.inspectionAgency || "");

  const split = (val) => val.split(",").map((s) => s.trim()).filter(Boolean);

  useEffect(() => {
    const bv2 = onboarding?.businessVerification || {};
    const vi2 = onboarding?.vehicleInventory || {};
    const ec2 = onboarding?.exportCapabilities || {};
    const pi2 = onboarding?.paymentInfo || {};
    const ct2 = onboarding?.commercialTerms || {};
    setBrands((bv2.brands || []).join(", "));
    setExportMarkets((bv2.exportMarkets || []).join(", "));
    setActivities((bv2.mainActivities || []).join(", "));
    setYears(bv2.yearsExperience || 0);
    setAnnualCap(bv2.annualExportCapacity || "");
    setEntityTypes(bv2.entityTypes || []);
    setVInv({ ...vi2 });
    setPorts((ec2.shippingPorts || []).join(", "));
    setIncoterms(ec2.incoterms || { exw: false, fob: false, cif: false, dap: false, ddp: false });
    setCurrency(pi2.preferredCurrency || "");
    setMinQty(ct2.minimumOrderQuantity || "");
    setPaymentModes(ct2.paymentModes || []);
    setDepositPct(ct2.depositPercentage ?? null);
    setDepositTiming(ct2.depositTiming || "");
    setDeliveryDays(ct2.deliveryDays ?? null);
    setWarrantyAvail(ct2.warrantyAvailable ?? null);
    setWarrantyMonths(ct2.warrantyMonths ?? "");
    setInspType(ct2.inspectionType || "");
    setInspAgency(ct2.inspectionAgency || "");
  }, [onboarding]);

  const handleSave = async () => {
    const bvData = {
      brands: split(brands),
      exportMarkets: split(exportMarkets),
      mainActivities: split(activities),
      yearsExperience: Number(years),
      annualExportCapacity: annualCap,
      entityTypes,
    };
    const viData = { ...vInv };
    const ecData = { shippingPorts: split(ports), incoterms };
    const piData = { preferredCurrency: currency };
    const ctData = {
      minimumOrderQuantity: minQty,
      paymentModes,
      depositPercentage: depositPct !== null ? Number(depositPct) : null,
      depositTiming,
      deliveryDays: deliveryDays !== null ? Number(deliveryDays) : null,
      warrantyAvailable: warrantyAvail,
      warrantyMonths: warrantyMonths !== "" ? Number(warrantyMonths) : null,
      inspectionType: inspType,
      inspectionAgency: inspAgency,
    };

    const results = await Promise.all([
      onSaveSection("business-verification", bvData),
      onSaveSection("vehicle-inventory", viData),
      onSaveSection("export-capabilities", ecData),
      onSaveSection("payment-info", piData),
      onSaveSection("commercial-terms", ctData),
    ]);
    const ok = results.every(Boolean);
    if (ok) onNext();
  };


  return (
    <div className={styles.stepCard}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>🔍</div>
        <div>
          <h2>Vérification commerciale & Capacités</h2>
          <p>Sections 3 à 8 du document VA-FP-001</p>
        </div>
      </div>

      {/* Business Verification */}
      <div className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Vérification commerciale</h3>
        <div className={styles.formGrid}>
          <FieldFull label="Marques représentées (séparées par virgule)" value={brands} onChange={(e) => setBrands(e.target.value)} placeholder="Toyota, BYD, Hyundai…" />
          <FieldFull label="Marchés d'export (pays, séparés par virgule)" value={exportMarkets} onChange={(e) => setExportMarkets(e.target.value)} placeholder="Côte d'Ivoire, Sénégal, Mali…" />
          <FieldFull label="Activités principales" value={activities} onChange={(e) => setActivities(e.target.value)} placeholder="Import, Export, Transit, Courtage…" />
          <Field label="Années d'expérience" value={years} onChange={(e) => setYears(e.target.value)} type="number" min="0" />
          <Field label="Capacité annuelle d'export" value={annualCap} onChange={(e) => setAnnualCap(e.target.value)} placeholder="Ex. 500 véhicules/an" />
        </div>
        <div style={{ marginTop: 14 }}>
          <div className={styles.sectionSubtitle}>Type d'entité (cochez tout ce qui s'applique)</div>
          <div className={styles.checkGrid}>
            {ENTITY_TYPES.map(({ key, label }) => (
              <label key={key} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={entityTypes.includes(key)}
                  onChange={() => toggleArr(entityTypes, setEntityTypes, key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Vehicle Inventory */}
      <div className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Inventaire véhicules</h3>
        <div className={styles.checkGrid}>
          {VEHICLE_TYPES.map(({ key, label }) => (
            <label key={key} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={!!vInv[key]}
                onChange={() => setVInv((v) => ({ ...v, [key]: !v[key] }))}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Export Capabilities */}
      <div className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Capacités d'export</h3>
        <div className={styles.formGrid}>
          <FieldFull label="Ports d'expédition disponibles" value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="Abidjan, Dakar, Lomé, Shanghai…" />
        </div>
        <div className={styles.incotermGrid}>
          <span className={styles.incotermLabel}>Incoterms proposés :</span>
          {["exw", "fob", "cif", "dap", "ddp"].map((inc) => (
            <label key={inc} className={styles.incotermItem}>
              <input
                type="checkbox"
                checked={!!incoterms[inc]}
                onChange={() => setIncoterms((i) => ({ ...i, [inc]: !i[inc] }))}
              />
              <span>{inc.toUpperCase()}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Conditions commerciales structurées */}
      <div className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Conditions commerciales</h3>
        <p style={{ fontSize: ".8rem", color: "#64748b", margin: "0 0 14px" }}>
          Ces informations seront affichées sur votre profil — comme Alibaba. Les acheteurs voient exactement vos conditions avant de vous contacter.
        </p>

        {/* Modes de paiement */}
        <div style={{ marginBottom: 18 }}>
          <div className={styles.sectionSubtitle}>Modes de paiement acceptés</div>
          <div className={styles.checkGrid}>
            {PAYMENT_MODES.map(({ key, label }) => (
              <label key={key} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={paymentModes.includes(key)}
                  onChange={() => toggleArr(paymentModes, setPaymentModes, key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Acompte */}
        <div style={{ marginBottom: 18 }}>
          <div className={styles.sectionSubtitle}>Acompte requis</div>
          <div style={inlineRow}>
            {[10, 20, 30, 40, 50].map((pct) => (
              <label key={pct} style={radioSt}>
                <input type="radio" name="depositPct" value={pct} checked={depositPct === pct}
                  onChange={() => setDepositPct(pct)} />
                {pct}%
              </label>
            ))}
            <label style={radioSt}>
              <input type="radio" name="depositPct" value="" checked={depositPct === null}
                onChange={() => setDepositPct(null)} />
              Non spécifié
            </label>
          </div>
          {depositPct !== null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 6 }}>Solde versé :</div>
              <div style={inlineRow}>
                {[
                  { v: "before_shipment", l: "Avant expédition" },
                  { v: "after_inspection", l: "Après inspection" },
                  { v: "at_boarding", l: "À l'embarquement" },
                  { v: "at_reception", l: "À réception" },
                ].map(({ v, l }) => (
                  <label key={v} style={radioSt}>
                    <input type="radio" name="depositTiming" value={v} checked={depositTiming === v}
                      onChange={() => setDepositTiming(v)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Délai de livraison */}
        <div style={{ marginBottom: 18 }}>
          <div className={styles.sectionSubtitle}>Délai de livraison</div>
          <div style={inlineRow}>
            {[15, 30, 45, 60].map((d) => (
              <label key={d} style={radioSt}>
                <input type="radio" name="deliveryDays" value={d} checked={deliveryDays === d}
                  onChange={() => setDeliveryDays(d)} />
                {d} jours
              </label>
            ))}
            <label style={radioSt}>
              <input type="radio" name="deliveryDays" value="" checked={deliveryDays === null}
                onChange={() => setDeliveryDays(null)} />
              À définir
            </label>
          </div>
        </div>

        {/* Inspection */}
        <div style={{ marginBottom: 18 }}>
          <div className={styles.sectionSubtitle}>Inspection véhicule</div>
          <div style={inlineRow}>
            {[
              { v: "mandatory", l: "Obligatoire" },
              { v: "optional",  l: "Optionnelle" },
              { v: "none",      l: "Aucune" },
            ].map(({ v, l }) => (
              <label key={v} style={radioSt}>
                <input type="radio" name="inspType" value={v} checked={inspType === v}
                  onChange={() => { setInspType(v); if (v === "none") setInspAgency(""); }} />
                {l}
              </label>
            ))}
          </div>
          {inspType && inspType !== "none" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 6 }}>Organisme d'inspection :</div>
              <div style={inlineRow}>
                {[
                  { v: "sgs",            l: "SGS" },
                  { v: "bureau_veritas", l: "Bureau Veritas" },
                  { v: "tuv",            l: "TÜV" },
                  { v: "other",          l: "Autre" },
                ].map(({ v, l }) => (
                  <label key={v} style={radioSt}>
                    <input type="radio" name="inspAgency" value={v} checked={inspAgency === v}
                      onChange={() => setInspAgency(v)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Garantie */}
        <div style={{ marginBottom: 18 }}>
          <div className={styles.sectionSubtitle}>Garantie proposée</div>
          <div style={inlineRow}>
            <label style={radioSt}>
              <input type="radio" name="warranty" checked={warrantyAvail === true}
                onChange={() => setWarrantyAvail(true)} />
              Oui
            </label>
            <label style={radioSt}>
              <input type="radio" name="warranty" checked={warrantyAvail === false}
                onChange={() => { setWarrantyAvail(false); setWarrantyMonths(""); }} />
              Non
            </label>
            <label style={radioSt}>
              <input type="radio" name="warranty" checked={warrantyAvail === null}
                onChange={() => setWarrantyAvail(null)} />
              À discuter
            </label>
          </div>
          {warrantyAvail === true && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: ".84rem", color: "#374151" }}>Durée :</span>
              <input type="number" min="1" max="60" value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(e.target.value)}
                style={{ width: 70, padding: "6px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}
                placeholder="mois"
              />
              <span style={{ fontSize: ".84rem", color: "#64748b" }}>mois</span>
            </div>
          )}
        </div>

        {/* MOQ & Devise */}
        <div className={styles.formGrid} style={{ marginTop: 4 }}>
          <Field label="Quantité minimum (MOQ)" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Ex. 1 véhicule" />
          <Field label="Devise préférée" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD, EUR, XOF…" />
        </div>
      </div>

      <div className={styles.stepActions}>
        <button className={styles.btnSecondary} onClick={onBack}>← Retour</button>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer & Continuer →"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ÉTAPE 3 : Récapitulatif & Soumission
// ════════════════════════════════════════════════════════════════════════════════
function StepReview({ onboarding, saving, status, onSubmit, onBack, onEditStep, onAcceptLegal }) {
  const ci = onboarding?.companyInfo || {};
  const bv = onboarding?.businessVerification || {};
  const canSubmit = ["brouillon", "info_demandee"].includes(status);
  const isSubmitted = !canSubmit && status !== "rejete";
  const [legalChecked, setLegalChecked] = useState(!!onboarding?.legalAcceptance?.accepted);

  const handleLegalCheck = (e) => {
    const checked = e.target.checked;
    setLegalChecked(checked);
    if (checked) onAcceptLegal();
  };

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>📋</div>
        <div>
          <h2>Récapitulatif & Soumission</h2>
          <p>Vérifiez votre dossier avant de soumettre votre candidature officielle</p>
        </div>
      </div>

      {/* Checklist */}
      <div className={styles.checklist}>
        <CheckRow label="Nom légal de l'entreprise" value={ci.legalName} onEdit={() => onEditStep(0)} />
        <CheckRow label="Numéro d'immatriculation" value={ci.registrationNumber} onEdit={() => onEditStep(0)} />
        <CheckRow label="Pays d'immatriculation" value={ci.registrationCountry} onEdit={() => onEditStep(0)} />
        <CheckRow label="Contact principal" value={ci.mainContact} onEdit={() => onEditStep(0)} />
        <CheckRow label="Email entreprise" value={ci.email} onEdit={() => onEditStep(0)} />
        <CheckRow label="Type de partenaire" value={onboarding?.partnerType} onEdit={() => onEditStep(0)} />
        <CheckRow label="Documents légaux" value={onboarding?.legalDocs?.businessRegistration || onboarding?.legalDocs?.businessLicense} onEdit={() => onEditStep(1)} okText="Chargés" />
        <CheckRow label="Marques représentées" value={bv.brands?.length > 0 ? bv.brands.join(", ") : null} onEdit={() => onEditStep(2)} />
        <CheckRow label="Marchés d'export" value={bv.exportMarkets?.length > 0 ? bv.exportMarkets.join(", ") : null} onEdit={() => onEditStep(2)} />
      </div>

      {/* Commission box */}
      <div className={styles.commissionBox}>
        <h4>Vos conditions Founding Partner</h4>
        <div className={styles.commissionGrid}>
          <div className={styles.commissionItem}>
            <span>Abonnement Premium</span>
            <strong className={styles.commFree}>12 mois OFFERT</strong>
          </div>
          <div className={styles.commissionItem}>
            <span>Commission Location</span>
            <strong>{onboarding?.commissions?.location || 10}% <small>(standard 15%)</small></strong>
          </div>
          <div className={styles.commissionItem}>
            <span>Commission Vente</span>
            <strong>{onboarding?.commissions?.vente || 2}% <small>(standard 3%)</small></strong>
          </div>
          <div className={styles.commissionItem}>
            <span>Badge</span>
            <strong className={styles.commBadge}>👑 Founding Partner</strong>
          </div>
        </div>
        <p className={styles.commNote}>
          Ces conditions seront verrouillées à la signature de l'accord et garanties pendant 12 mois.
        </p>
      </div>

      {isSubmitted && (
        <div className={styles.alertSuccess}>
          <strong>✅ Dossier soumis</strong> — Réf. {onboarding?.referenceNumber}<br />
          Notre équipe examine votre candidature. Vous recevrez une notification dès qu'une décision sera prise.
        </div>
      )}

      {canSubmit && (
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10, margin: "18px 0",
          padding: "14px 16px", background: "#f8fafc", border: "1.5px solid #e2e8f0",
          borderRadius: 10, fontSize: "0.85rem", color: "#374151", cursor: "pointer",
        }}>
          <input type="checkbox" checked={legalChecked} onChange={handleLegalCheck} style={{ marginTop: 3 }} />
          <span>
            I have read and accept the Founding Partner{" "}
            <Link to="/founding-partner-legal" target="_blank" rel="noopener noreferrer" style={{ color: "#ff4d2d", fontWeight: 700 }}>Letter of Intent</Link>,{" "}
            the{" "}
            <Link to="/founding-partner-legal" target="_blank" rel="noopener noreferrer" style={{ color: "#ff4d2d", fontWeight: 700 }}>Founding Partner Agreement</Link>,{" "}
            and the{" "}
            <Link to="/founding-partner-legal" target="_blank" rel="noopener noreferrer" style={{ color: "#ff4d2d", fontWeight: 700 }}>Partner Verification Policy</Link>{" "}
            of VIT-AUTO.
          </span>
        </label>
      )}

      <div className={styles.stepActions}>
        <button className={styles.btnSecondary} onClick={onBack}>← Retour</button>
        {canSubmit && (
          <button
            className={styles.btnSuccess}
            onClick={onSubmit}
            disabled={saving || !ci.legalName || !legalChecked}
          >
            {saving ? "Soumission…" : "🚀 Soumettre ma candidature"}
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ÉTAPE 4 : Signature LOI / Accord
// ════════════════════════════════════════════════════════════════════════════════
function StepDocumentSigning({ onboarding, status, token, onSign }) {
  const statusCfg = STATUS_CONFIG[status] || {};

  const downloadPDF = async (type) => {
    try {
      const path = type === "loi" ? "/my/loi/pdf" : "/my/agreement/pdf";
      const r = await apiFetch(path, token);
      if (!r.ok) return;
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = type === "loi"
        ? `LOI-${onboarding?.referenceNumber || "document"}.pdf`
        : `Accord-${onboarding?.referenceNumber || "document"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* silencieux */ }
  };

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIcon}>✍️</div>
        <div>
          <h2>Documents à signer</h2>
          <p>Signez vos documents officiels pour activer votre partenariat fondateur</p>
        </div>
      </div>

      <div className={styles.docSigningFlow}>
        {/* LOI */}
        <div className={`${styles.docSignCard} ${["loi_envoyee", "loi_signee", "accord_envoye", "accord_signe"].includes(status) ? styles.docSignAvailable : ""}`}>
          <div className={styles.docSignIcon}>📄</div>
          <div className={styles.docSignInfo}>
            <h3>Lettre d'Intention (LOI)</h3>
            <p>Formalise votre intention de rejoindre le programme Founding Partner</p>
            {onboarding?.loi?.sentAt && <small>Envoyée le {new Date(onboarding.loi.sentAt).toLocaleDateString("fr-FR")}</small>}
            {onboarding?.loi?.signedAt && (
              <div className={styles.signedBadge}>
                ✅ Signée le {new Date(onboarding.loi.signedAt).toLocaleDateString("fr-FR")} par {onboarding.loi.signerName}
                {onboarding.loi.documentHash && (
                  <div style={{ fontSize: ".65rem", color: "#64748b", marginTop: ".2rem", fontFamily: "monospace" }}>
                    SHA-256 : {onboarding.loi.documentHash.slice(0, 24)}…
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.docSignAction} style={{ flexDirection: "column", gap: ".5rem", alignItems: "flex-end" }}>
            {status === "loi_envoyee" ? (
              <button className={styles.btnSign} onClick={() => onSign("loi")}>✍️ Signer la LOI</button>
            ) : ["loi_signee", "accord_envoye", "accord_signe"].includes(status) ? (
              <span className={styles.docSignDone}>✓ Signé</span>
            ) : (
              <span className={styles.docSignPending}>En attente d'approbation</span>
            )}
            {["loi_envoyee", "loi_signee", "accord_envoye", "accord_signe"].includes(status) && (
              <button
                className={styles.btnSecondary}
                style={{ fontSize: ".75rem", padding: ".4rem .75rem" }}
                onClick={() => downloadPDF("loi")}
              >
                ⬇ PDF
              </button>
            )}
          </div>
        </div>

        <div className={styles.docSignArrow}>↓</div>

        {/* Founding Partner Agreement */}
        <div className={`${styles.docSignCard} ${["accord_envoye", "accord_signe"].includes(status) ? styles.docSignAvailable : ""}`}>
          <div className={styles.docSignIcon}>📜</div>
          <div className={styles.docSignInfo}>
            <h3>Accord de Partenariat Fondateur</h3>
            <p>Contrat officiel définissant vos droits, obligations et conditions commerciales</p>
            {onboarding?.agreement?.sentAt && <small>Envoyé le {new Date(onboarding.agreement.sentAt).toLocaleDateString("fr-FR")}</small>}
            {onboarding?.agreement?.signedAt && (
              <div className={styles.signedBadge}>
                ✅ Signé le {new Date(onboarding.agreement.signedAt).toLocaleDateString("fr-FR")} par {onboarding.agreement.signerName}
                {onboarding.agreement.documentHash && (
                  <div style={{ fontSize: ".65rem", color: "#64748b", marginTop: ".2rem", fontFamily: "monospace" }}>
                    SHA-256 : {onboarding.agreement.documentHash.slice(0, 24)}…
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.docSignAction} style={{ flexDirection: "column", gap: ".5rem", alignItems: "flex-end" }}>
            {status === "accord_envoye" ? (
              <button className={styles.btnSign} onClick={() => onSign("agreement")}>✍️ Signer l'Accord</button>
            ) : status === "accord_signe" ? (
              <span className={styles.docSignDone}>✓ Signé</span>
            ) : (
              <span className={styles.docSignPending}>En attente LOI signée</span>
            )}
            {["accord_envoye", "accord_signe"].includes(status) && (
              <button
                className={styles.btnSecondary}
                style={{ fontSize: ".75rem", padding: ".4rem .75rem" }}
                onClick={() => downloadPDF("agreement")}
              >
                ⬇ PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Document viewer */}
      {["loi_envoyee", "loi_signee"].includes(status) && onboarding?.loi?.content && (
        <div className={styles.docViewer}>
          <h4>Lettre d'Intention — Aperçu</h4>
          <pre className={styles.docText}>{onboarding.loi.content}</pre>
        </div>
      )}
      {["accord_envoye", "accord_signe"].includes(status) && onboarding?.agreement?.content && (
        <div className={styles.docViewer}>
          <h4>Accord de Partenariat — Aperçu</h4>
          <pre className={styles.docText}>{onboarding.agreement.content}</pre>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BANNIÈRE DOCUMENTS À SIGNER
// ════════════════════════════════════════════════════════════════════════════════
function DocumentSigningBanner({ status, onboarding, onSign }) {
  if (status === "loi_envoyee") return (
    <div className={styles.signingBanner}>
      <div className={styles.signingBannerText}>
        <strong>📄 Votre LOI est prête à être signée !</strong>
        <span>Réf. {onboarding?.referenceNumber} — Signez votre Lettre d'Intention pour continuer vers l'accord de partenariat.</span>
      </div>
      <button className={styles.btnSign} onClick={() => onSign("loi")}>✍️ Signer la LOI</button>
    </div>
  );
  if (status === "accord_envoye") return (
    <div className={styles.signingBannerAccord}>
      <div className={styles.signingBannerText}>
        <strong>📜 L'Accord de Partenariat Fondateur est prêt !</strong>
        <span>Signez l'accord pour activer votre statut de Partenaire Fondateur et débloquer tous vos avantages.</span>
      </div>
      <button className={styles.btnSign} onClick={() => onSign("agreement")}>✍️ Signer l'Accord</button>
    </div>
  );
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// MODAL SIGNATURE
// ════════════════════════════════════════════════════════════════════════════════
function SignatureModal({ type, onboarding, saving, onSign, onClose }) {
  const [signerName, setSignerName] = useState("");
  const [signerPosition, setSignerPosition] = useState("");
  const [accepted, setAccepted] = useState(false);

  const doc = type === "loi" ? onboarding?.loi : onboarding?.agreement;
  const title = type === "loi" ? "Signature — Lettre d'Intention" : "Signature — Accord de Partenariat Fondateur";

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>✍️ {title}</h3>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* Document aperçu */}
          {doc?.content && (
            <div className={styles.modalDocPreview}>
              <pre className={styles.docTextSmall}>{doc.content.slice(0, 1500)}…</pre>
            </div>
          )}

          <div className={styles.signatureForm}>
            <p>En signant ce document, vous confirmez avoir lu, compris et accepté l'intégralité des termes ci-dessus.</p>
            <Field label="Votre nom complet *" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Prénom Nom" />
            <Field label="Votre poste / Titre" value={signerPosition} onChange={(e) => setSignerPosition(e.target.value)} placeholder="Directeur Général" />
            <label className={styles.acceptCheck}>
              <input type="checkbox" checked={accepted} onChange={() => setAccepted(!accepted)} />
              <span>
                Je certifie être habilité à signer ce document au nom de{" "}
                <strong>{onboarding?.companyInfo?.legalName || "mon entreprise"}</strong>{" "}
                et j'accepte les termes et conditions.
              </span>
            </label>
            <div className={styles.signatureMetaNote}>
              📍 Votre signature sera enregistrée avec la date, l'heure et l'adresse IP pour valeur légale.
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Annuler</button>
          <button
            className={styles.btnSign}
            onClick={() => onSign(type, signerName, signerPosition)}
            disabled={saving || !signerName.trim() || !accepted}
          >
            {saving ? "Signature en cours…" : `✍️ Signer ${type === "loi" ? "la LOI" : "l'Accord"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ÉCRAN SUCCÈS
// ════════════════════════════════════════════════════════════════════════════════
function SuccessScreen({ onboarding, onNavigate }) {
  return (
    <div className={styles.successScreen}>
      <div className={styles.successCard}>
        <div className={styles.successBadge}>👑</div>
        <h1>Félicitations !</h1>
        <h2>Vous êtes maintenant un Partenaire Fondateur VIT-AUTO</h2>
        <p>Votre accord a été signé et votre profil est maintenant activé avec les avantages exclusifs Founding Partner.</p>

        <div className={styles.successStats}>
          <div className={styles.successStat}><strong>12 mois</strong><span>Abonnement offert</span></div>
          <div className={styles.successStat}><strong>{onboarding?.commissions?.location || 10}%</strong><span>Commission Location</span></div>
          <div className={styles.successStat}><strong>{onboarding?.commissions?.vente || 2}%</strong><span>Commission Vente</span></div>
        </div>

        <div className={styles.successRef}>
          Référence partenaire : <strong>{onboarding?.referenceNumber}</strong>
        </div>

        <button className={styles.btnPrimary} onClick={onNavigate}>
          → Accéder à mon espace Partenaire
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// HERO PUBLIC (si non connecté)
// ════════════════════════════════════════════════════════════════════════════════
const WHY_JOIN = [
  { icon: "🌍", title: "International Visibility",   text: "Your inventory shown to buyers, dealerships, rental companies and fleet operators across 20+ countries." },
  { icon: "🛡️", title: "Verified Founding Partner Badge", text: "A recognizable badge on every listing, backed by VIT-AUTO's Partner Verification Policy." },
  { icon: "💰", title: "Preferential Commissions",    text: "10% on rentals and 2% on sales (vs. 15%/3% standard), locked for 12 months from activation." },
  { icon: "🔌", title: "Inventory Integration",       text: "API, XML feeds, CSV imports or DMS synchronization — bring your existing catalog in, not one car at a time." },
  { icon: "🎁", title: "12 Months Free Premium",      text: "No registration fee, no mandatory subscription during the Founding Partner phase." },
  { icon: "🤝", title: "Dedicated Partner Success",   text: "Direct line to VIT-AUTO's team for onboarding, integration and early feature access." },
];

const HOW_IT_WORKS = [
  { n: "1", title: "Register",                text: "Create your partner account in a few minutes." },
  { n: "2", title: "Verification",             text: "Submit your company documents for review by our Partner Verification Team." },
  { n: "3", title: "Inventory Integration",    text: "Connect your catalog via API, CSV, XML or manual entry." },
  { n: "4", title: "Founding Partner Approval",text: "Sign your LOI and Agreement electronically — you're live." },
];

// ── Écran affiché à un compte connecté qui n'a pas encore de dossier — la création
// exige ce clic explicite (jamais un simple chargement de page, voir applyToProgram).
function StartApplicationScreen({ onStart, starting }) {
  return (
    <div className={styles.publicHero}>
      <div className={styles.publicHeroContent}>
        <div className={styles.heroLabel}>VIT-AUTO · FOUNDING PARTNER PROGRAM</div>
        <h1>Prêt à rejoindre le<br /><span className={styles.heroAccent}>programme Founding Partner ?</span></h1>
        <p>
          En continuant, votre compte devient un compte partenaire et un dossier de candidature est créé.
          Aucune obligation à ce stade — vous pourrez compléter votre dossier à votre rythme.
        </p>
        <div className={styles.publicActions}>
          <button className={styles.btnPrimary} onClick={onStart} disabled={starting}>
            {starting ? "Démarrage…" : "Commencer ma candidature →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PublicHero() {
  const navigate = useNavigate();
  return (
    <div className={styles.publicPage}>
      {/* ── Hero ── */}
      <div className={styles.publicHero}>
        <div className={styles.publicHeroContent}>
          <div className={styles.heroLabel}>VIT-AUTO · FOUNDING PARTNER PROGRAM</div>
          <h1>Join the VIT-AUTO International<br /><span className={styles.heroAccent}>Founding Partner Program</span></h1>
          <p>Reduced commissions, 12 months free Premium subscription, exclusive "Founding Partner" badge — limited to the first 20 partners.</p>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}><span>12 mo.</span><small>Free Premium</small></div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}><span>-33%</span><small>On commissions</small></div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}><span>20+</span><small>Countries</small></div>
          </div>
          <div className={styles.publicActions}>
            <button className={styles.btnPrimary} onClick={() => navigate("/register?role=partenaire&redirect=/partner-onboarding")}>
              Apply Now →
            </button>
            <button className={styles.btnSecondary} onClick={() => navigate("/login?redirect=/partner-onboarding")}>
              Se connecter
            </button>
          </div>
        </div>
      </div>

      {/* ── Why Join ── */}
      <section className={styles.publicSection}>
        <h2 className={styles.publicSectionTitle}>Why Join?</h2>
        <div className={styles.whyGrid}>
          {WHY_JOIN.map((w) => (
            <div key={w.title} className={styles.whyCard}>
              <div className={styles.whyIcon}>{w.icon}</div>
              <h3>{w.title}</h3>
              <p>{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className={`${styles.publicSection} ${styles.publicSectionAlt}`}>
        <h2 className={styles.publicSectionTitle}>How It Works</h2>
        <div className={styles.stepsRow}>
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.n} className={styles.stepItemPublic}>
              <div className={styles.stepNum}>{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              {i < HOW_IT_WORKS.length - 1 && <div className={styles.stepArrow}>→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Legal Documents ── */}
      <section className={styles.publicSection}>
        <h2 className={styles.publicSectionTitle}>Legal Documents</h2>
        <p className={styles.publicSectionSubtitle}>
          VIT-AUTO operates under a structured legal framework — read the documents that
          govern the Founding Partner relationship before applying.
        </p>
        <div className={styles.legalLinks}>
          <Link to="/founding-partner-legal" className={styles.legalLinkCard}>📄 Letter of Intent</Link>
          <Link to="/founding-partner-legal" className={styles.legalLinkCard}>🤝 Founding Partner Agreement</Link>
          <Link to="/founding-partner-legal" className={styles.legalLinkCard}>🛡️ Partner Verification Policy</Link>
        </div>
      </section>

      {/* ── Apply Now ── */}
      <section className={`${styles.publicSection} ${styles.applySection}`}>
        <h2 className={styles.publicSectionTitle}>Ready to Apply?</h2>
        <p className={styles.publicSectionSubtitle}>Only 20 Founding Partner spots — first come, first served.</p>
        <div className={styles.publicActions}>
          <button className={styles.btnPrimary} onClick={() => navigate("/register?role=partenaire&redirect=/partner-onboarding")}>
            Apply Now →
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Écran affiché quand le programme est complet, ou en cas d'erreur de chargement ──
function OnboardingErrorScreen({ message }) {
  return (
    <div className={styles.publicHero}>
      <div className={styles.publicHeroContent}>
        <div className={styles.heroLabel}>VIT-AUTO · FOUNDING PARTNER PROGRAM</div>
        <h1>{message ? "⚠️ Un problème est survenu" : "🎉 Programme complet"}</h1>
        <p>{message || "Le programme Founding Partner est complet."}</p>
        <p style={{ marginTop: "1rem", fontSize: ".9rem", opacity: .8 }}>
          Contactez VIT AUTO à <strong>contact@vit-auto.com</strong> si le problème persiste.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// COMPOSANTS UTILITAIRES
// ════════════════════════════════════════════════════════════════════════════════
function Field({ label, value, onChange, type = "text", placeholder, ...rest }) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} {...rest} />
    </div>
  );
}

function FieldFull({ label, value, onChange, placeholder }) {
  return (
    <div className={`${styles.field} ${styles.fieldFull}`}>
      <label>{label}</label>
      <input value={value || ""} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function CheckRow({ label, value, onEdit, okText = null }) {
  const ok = !!value;
  return (
    <div className={styles.checkRow}>
      <span className={ok ? styles.checkOk : styles.checkMissing}>
        {ok ? "✅" : "⬜"}
      </span>
      <span className={styles.checkLabel}>{label}</span>
      <span className={styles.checkValue}>
        {ok ? (okText || (typeof value === "string" ? value.slice(0, 40) : "✓")) : "—"}
      </span>
      <button className={styles.checkEdit} onClick={onEdit}>Modifier</button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh" }}>
      <div style={{ textAlign:"center", color:"#64748b" }}>
        <div style={{ fontSize:"2rem", marginBottom:"1rem" }}>⏳</div>
        <p>Chargement de votre dossier…</p>
      </div>
    </div>
  );
}
