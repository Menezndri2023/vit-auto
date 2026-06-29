import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/apiClient";
import styles from "./PartnerCertification.module.css";

// ── Helpers ──────────────────────────────────────────────────────────────────
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve({ name: file.name, data: r.result });
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const BADGE_CONFIG = {
  none:      { icon: "🔒", label: "Aucun badge",           color: "#94a3b8", bg: "#f1f5f9",  gradient: "none" },
  verifie:   { icon: "🟢", label: "Partenaire Vérifié",    color: "#059669", bg: "#d1fae5",  gradient: "linear-gradient(135deg,#059669,#10b981)" },
  fondateur: { icon: "🏆", label: "Partenaire Fondateur",  color: "#d97706", bg: "#fef3c7",  gradient: "linear-gradient(135deg,#d97706,#f59e0b)" },
  premium:   { icon: "⭐", label: "Partenaire Premium",    color: "#7c3aed", bg: "#ede9fe",  gradient: "linear-gradient(135deg,#7c3aed,#a855f7)" },
};

const STATUS_CONFIG = {
  not_started: { icon: "○",  label: "Non commencé", color: "#94a3b8" },
  in_progress: { icon: "◎",  label: "En cours",     color: "#3b82f6" },
  submitted:   { icon: "⏳", label: "Soumis",       color: "#d97706" },
  approved:    { icon: "✅", label: "Approuvé",     color: "#059669" },
  rejected:    { icon: "❌", label: "Refusé",       color: "#dc2626" },
};

const LEVELS = [
  { num: 1, icon: "🏢", title: "Entreprise",         subtitle: "RCCM, NIF, adresse officielle", color: "#6366f1" },
  { num: 2, icon: "👤", title: "Représentant",        subtitle: "Identité, selfie, visio",        color: "#0ea5e9" },
  { num: 3, icon: "📊", title: "Activité commerciale",subtitle: "Expérience, pays, volumes",       color: "#10b981" },
  { num: 4, icon: "🏦", title: "Banque",              subtitle: "Compte pro, IBAN/SWIFT",          color: "#f59e0b" },
  { num: 5, icon: "🚗", title: "Véhicules",           subtitle: "Carte grise, VIN, photos",        color: "#ef4444" },
  { num: 6, icon: "📦", title: "Export",              subtitle: "BL, proforma, origine...",        color: "#8b5cf6" },
  { num: 7, icon: "📝", title: "Contrat",             subtitle: "Charte, CGU, anti-fraude",        color: "#ec4899" },
  { num: 8, icon: "🏅", title: "Badge final",         subtitle: "Attribution par VIT AUTO",        color: "#f59e0b" },
];

const REGISTRATION_TYPES = [
  { value: "rccm",             label: "RCCM (Côte d'Ivoire, Afrique)" },
  { value: "kbis",             label: "Extrait Kbis (France)" },
  { value: "business_license", label: "Business License (Chine)" },
  { value: "trade_license",    label: "Trade License (EAU, UAE)" },
  { value: "other",            label: "Autre équivalent" },
];

const PAYMENT_METHODS_LIST = ["Virement SWIFT", "L/C (Lettre de Crédit)", "Western Union", "PayPal Pro", "Escrow", "CAD", "Crypto"];
const ACTIVITY_TYPES_LIST  = ["Import", "Export", "Transit", "Courtage", "Pièces détachées", "Location", "Vente"];
const VEHICLE_CATS_LIST    = ["Berline", "SUV", "Pickup", "4x4", "Camion", "Bus", "Utilitaire", "Moto", "Luxe"];
const EXPORT_COUNTRIES     = ["France", "Côte d'Ivoire", "Sénégal", "Mali", "Burkina Faso", "Cameroun", "Maroc", "Algérie", "Tunisie", "Bénin", "Togo", "Guinée", "Congo", "Gabon", "Autre"];

// ── Composant file uploader ───────────────────────────────────────────────────
function FileUploader({ label, value, onChange, hint }) {
  const ref = useRef();
  return (
    <div className={styles.fileBox}>
      <p className={styles.fileLabel}>{label}</p>
      {hint && <p className={styles.fileHint}>{hint}</p>}
      <button type="button" className={styles.fileBtn} onClick={() => ref.current.click()}>
        {value?.name ? `✅ ${value.name}` : "📎 Choisir un fichier"}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={async (e) => {
          if (e.target.files[0]) {
            const b64 = await toBase64(e.target.files[0]);
            onChange({ name: b64.name, data: b64.data, uploadedAt: new Date().toISOString() });
          }
        }}
      />
    </div>
  );
}

// ── Multi-checkbox ────────────────────────────────────────────────────────────
function MultiCheck({ label, options, value = [], onChange }) {
  const toggle = (v) => {
    const next = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(next);
  };
  return (
    <div className={styles.multiCheck}>
      <p className={styles.fieldLabel}>{label}</p>
      <div className={styles.chips}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`${styles.chip} ${value.includes(o) ? styles.chipActive : ""}`}
            onClick={() => toggle(o)}
          >
            {value.includes(o) ? "✓ " : ""}{o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function PartnerCertification() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cert,          setCert]          = useState(null);
  const [activeLevel,   setActiveLevel]   = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]    = useState(false);
  const [toast,         setToast]         = useState(null);

  // ── Form states pour chaque niveau ────────────────────────────────────────
  const [l1, setL1] = useState({
    companyName: "", legalForm: "", country: "", registrationType: "",
    registrationNumber: "", taxId: "", officialAddress: "", city: "",
    website: "", businessEmail: "",
    registrationDoc: null, taxDoc: null, addressProofDoc: null,
  });
  const [l2, setL2] = useState({
    repFirstName: "", repLastName: "", repFunction: "", repIdType: "",
    repIdNumber: "", hasProfCard: false, videoCallDone: false,
    idFrontDoc: null, idBackDoc: null, selfieDoc: null, profCardDoc: null,
  });
  const [l3, setL3] = useState({
    yearsExperience: "", exportCountries: [], monthlyVolume: "",
    portsUsed: "", paymentMethods: [], averageDelay: "",
    activityTypes: [], vehicleCategories: [],
  });
  const [l4, setL4] = useState({
    bankName: "", accountHolder: "", iban: "", swift: "", bankCountry: "", bankDoc: null,
  });
  const [l5, setL5] = useState({
    make: "", model: "", year: "", vin: "", mileage: "",
    hasVideo: false, hasInspection: false, hasHistory: false,
    grayCardDoc: null, photoDoc: null, invoiceDoc: null,
  });
  const [l6, setL6] = useState({
    canProvideProforma: false, canProvideCommercialInvoice: false,
    canProvidePackingList: false, canProvideBillOfLading: false,
    canProvideOriginCert: false, canProvideInspectionCert: false,
    canProvideCustomsDocs: false, sampleDoc: null,
  });
  const [l7, setL7] = useState({
    agreedToGCU: false, agreedToCharte: false, agreedToAntifraud: false,
    agreedToDelays: false, agreedToDataProt: false, agreedToRefund: false,
  });

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Chargement du statut ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await api.get("/api/certification/status");
        if (r.ok) {
          const { certification } = await r.json();
          setCert(certification);
          prefillForms(certification);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  // Strip base64 data from prefilled doc objects — affichage du nom seulement.
  // Lors d'une re-soumission sans changement de fichier, le champ n'a pas de
  // propriété `data`, donc le backend conserve le fichier déjà stocké.
  const stripDocData = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && "name" in v && "data" in v) {
        result[k] = { name: v.name, uploadedAt: v.uploadedAt };
      } else {
        result[k] = v;
      }
    }
    return result;
  };

  const prefillForms = (c) => {
    if (!c) return;
    if (c.level1) setL1((p) => ({ ...p, ...stripDocData(c.level1) }));
    if (c.level2) setL2((p) => ({ ...p, ...stripDocData(c.level2) }));
    if (c.level3) setL3((p) => ({ ...p, ...stripDocData(c.level3) }));
    if (c.level4) setL4((p) => ({ ...p, ...stripDocData(c.level4) }));
    if (c.level5) setL5((p) => ({ ...p, ...stripDocData(c.level5) }));
    if (c.level6) setL6((p) => ({ ...p, ...stripDocData(c.level6) }));
    if (c.level7) setL7((p) => ({ ...p, ...stripDocData(c.level7) }));
  };

  // ── Soumission d'un niveau ─────────────────────────────────────────────────
  // Les doc prefillés n'ont pas de propriété `data` — on les exclut pour éviter
  // d'écraser le fichier stocké avec un objet vide, et pour ne pas surcharger la requête.
  const filterPayload = (data) => {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "name" in v && !("data" in v)) continue;
      out[k] = v;
    }
    return out;
  };

  const submitLevel = async (lvl, data) => {
    setSubmitting(true);
    try {
      const r = await api.post(`/api/certification/level/${lvl}`, filterPayload(data));
      const json = await r.json().catch(() => ({}));
      if (r.ok) {
        setCert(json.certification);
        showToast(`Niveau ${lvl} soumis avec succès ! Notre équipe l'examinera sous 48h.`);
        if (lvl < 7) setActiveLevel(lvl + 1);
      } else {
        showToast(json.message || "Erreur lors de la soumission.", "error");
      }
    } catch {
      showToast("Connexion impossible. Réessayez.", "error");
    }
    setSubmitting(false);
  };

  const levelStatus = (n) => cert?.[`level${n}`]?.status || "not_started";
  const levelApproved = (n) => levelStatus(n) === "approved";
  // Niveaux 2-6 requièrent que le précédent soit au moins soumis ou approuvé.
  // Niveau 7 est déjà protégé côté serveur (tous 1-6 doivent être approuvés).
  const isLocked = (n) => {
    if (n === 1) return false;
    if (n === 8) return true; // attribution admin uniquement
    return !["submitted", "approved"].includes(levelStatus(n - 1));
  };

  const badge = BADGE_CONFIG[cert?.certificationBadge || "none"];

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <p>Chargement de votre dossier…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : styles.toastSuccess}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>← Retour</button>
          <h1 className={styles.heroTitle}>
            Certification <span className={styles.heroAccent}>Partenaire Vit-Auto</span>
          </h1>
          <p className={styles.heroSub}>
            Devenez un partenaire certifié reconnu par des milliers de clients dans 14 pays.
            Chaque niveau de vérification renforce votre crédibilité.
          </p>
        </div>
        <div className={styles.heroRight}>
          {/* Badge actuel */}
          <div className={styles.currentBadge} style={{ background: badge.gradient === "none" ? badge.bg : badge.gradient }}>
            <span className={styles.badgeIcon}>{badge.icon}</span>
            <div>
              <p className={styles.badgeLabel} style={{ color: badge.gradient !== "none" ? "#fff" : badge.color }}>
                {badge.label}
              </p>
              <p className={styles.badgeScore} style={{ color: badge.gradient !== "none" ? "rgba(255,255,255,.75)" : "#94a3b8" }}>
                Score : {cert?.certificationScore || 0}/100
              </p>
            </div>
          </div>
          {/* Progress ring */}
          <ProgressRing score={cert?.certificationScore || 0} />
        </div>
      </div>

      {/* ── Layout 2 colonnes ── */}
      <div className={styles.layout}>
        {/* ── Sidebar niveaux ── */}
        <aside className={styles.levelSidebar}>
          <p className={styles.sidebarTitle}>Votre progression</p>
          {LEVELS.map((lv) => {
            const st    = lv.num === 8 ? (cert?.level8?.status || "not_started") : levelStatus(lv.num);
            const sc    = STATUS_CONFIG[st] || STATUS_CONFIG.not_started;
            const isAct = activeLevel === lv.num;
            return (
              <button
                key={lv.num}
                className={`${styles.levelBtn} ${isAct ? styles.levelBtnActive : ""} ${st === "approved" ? styles.levelBtnApproved : ""}`}
                onClick={() => lv.num !== 8 && setActiveLevel(lv.num)}
                style={{ "--lv-color": lv.color }}
              >
                <span className={styles.lvIcon} style={{ background: lv.color + "20", color: lv.color }}>
                  {lv.icon}
                </span>
                <div className={styles.lvInfo}>
                  <span className={styles.lvTitle}>Niveau {lv.num} — {lv.title}</span>
                  <span className={styles.lvSub}>{lv.subtitle}</span>
                </div>
                <span className={styles.lvStatus} style={{ color: sc.color }}>{sc.icon}</span>
              </button>
            );
          })}
        </aside>

        {/* ── Contenu actif ── */}
        <main className={styles.formArea}>
          {/* Bandeau statut du niveau actif */}
          {cert?.[`level${activeLevel}`]?.status && cert[`level${activeLevel}`].status !== "not_started" && (
            <StatusBanner level={activeLevel} cert={cert} />
          )}

          {/* ── Formulaires par niveau ── */}
          {activeLevel === 1 && (
            <Level1Form data={l1} setData={setL1} onSubmit={() => submitLevel(1, l1)} submitting={submitting} approved={levelApproved(1)} />
          )}
          {activeLevel === 2 && (
            <Level2Form data={l2} setData={setL2} onSubmit={() => submitLevel(2, l2)} submitting={submitting} approved={levelApproved(2)} />
          )}
          {activeLevel === 3 && (
            <Level3Form data={l3} setData={setL3} onSubmit={() => submitLevel(3, l3)} submitting={submitting} approved={levelApproved(3)} />
          )}
          {activeLevel === 4 && (
            <Level4Form data={l4} setData={setL4} onSubmit={() => submitLevel(4, l4)} submitting={submitting} approved={levelApproved(4)} />
          )}
          {activeLevel === 5 && (
            <Level5Form data={l5} setData={setL5} onSubmit={() => submitLevel(5, l5)} submitting={submitting} approved={levelApproved(5)} />
          )}
          {activeLevel === 6 && (
            <Level6Form data={l6} setData={setL6} onSubmit={() => submitLevel(6, l6)} submitting={submitting} approved={levelApproved(6)} />
          )}
          {activeLevel === 7 && (
            <Level7Form data={l7} setData={setL7} onSubmit={() => submitLevel(7, l7)} submitting={submitting} approved={levelApproved(7)} cert={cert} />
          )}
        </main>
      </div>

      {/* ── Niveau 8 — Badge (info panel) ── */}
      <Level8Panel cert={cert} badge={badge} />
    </div>
  );
}

// ── Composant ring de progression ─────────────────────────────────────────────
function ProgressRing({ score }) {
  const r = 38, c = 2 * Math.PI * r;
  const dash = c * (1 - score / 100);
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className={styles.ring}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx="48" cy="48" r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dash}
        transform="rotate(-90 48 48)"
        style={{ transition: "stroke-dashoffset .8s ease" }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <text x="48" y="52" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">{score}%</text>
    </svg>
  );
}

// ── Bandeau de statut ─────────────────────────────────────────────────────────
function StatusBanner({ level, cert }) {
  const lv   = cert?.[`level${level}`];
  if (!lv || !lv.status || lv.status === "not_started") return null;
  const sc   = STATUS_CONFIG[lv.status];
  const msgs = {
    submitted:   "Dossier soumis — notre équipe l'examine sous 24-48h.",
    approved:    "Niveau approuvé ✅ — continuez vers le niveau suivant !",
    rejected:    lv.rejectionReason || "Niveau refusé. Veuillez corriger et resoumettre.",
    in_progress: "Dossier en cours de saisie.",
  };
  return (
    <div className={`${styles.statusBanner} ${styles["status_" + lv.status]}`}>
      <span>{sc.icon}</span>
      <span>{msgs[lv.status] || ""}</span>
    </div>
  );
}

// ── Bouton de soumission ───────────────────────────────────────────────────────
function SubmitBtn({ submitting, approved, label = "Soumettre ce niveau" }) {
  return (
    <button type="submit" className={styles.submitBtn} disabled={submitting || approved}>
      {approved ? "✅ Niveau approuvé" : submitting ? "Envoi en cours…" : label}
    </button>
  );
}

// ── NIVEAU 1 — Entreprise ─────────────────────────────────────────────────────
function Level1Form({ data, setData, onSubmit, submitting, approved }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>🏢</span> Niveau 1 — Vérification Entreprise</h2>
      <p className={styles.formDesc}>
        Prouvez que votre entreprise existe légalement. Ces documents donnent confiance à vos clients.
      </p>

      <div className={styles.row}>
        <Field label="Nom de l'entreprise *" value={data.companyName} onChange={upd("companyName")} placeholder="VIT MOTORS SARL" required />
        <Field label="Forme juridique" value={data.legalForm} onChange={upd("legalForm")} placeholder="SARL, SAS, LLC…" />
      </div>
      <div className={styles.row}>
        <Field label="Pays d'immatriculation *" value={data.country} onChange={upd("country")} placeholder="Côte d'Ivoire" required />
        <SelectField label="Type de registre *" value={data.registrationType} onChange={upd("registrationType")} options={REGISTRATION_TYPES} required />
      </div>
      <div className={styles.row}>
        <Field label="Numéro d'immatriculation *" value={data.registrationNumber} onChange={upd("registrationNumber")} placeholder="CI-ABJ-2020-B-12345" required />
        <Field label="Numéro fiscal (NIF/TVA/ICE)" value={data.taxId} onChange={upd("taxId")} placeholder="NIF-0012345" />
      </div>
      <div className={styles.row}>
        <Field label="Adresse officielle *" value={data.officialAddress} onChange={upd("officialAddress")} placeholder="123 rue du Commerce" required />
        <Field label="Ville" value={data.city} onChange={upd("city")} placeholder="Abidjan" />
      </div>
      <div className={styles.row}>
        <Field label="Site web" value={data.website} onChange={upd("website")} placeholder="https://monentreprise.com" type="url" />
        <Field label="Email professionnel *" value={data.businessEmail} onChange={upd("businessEmail")} placeholder="contact@entreprise.com" type="email" required />
      </div>

      <div className={styles.docSection}>
        <h3 className={styles.docTitle}>📎 Documents requis</h3>
        <div className={styles.docGrid}>
          <FileUploader label="Certificat d'immatriculation *" value={data.registrationDoc} onChange={upd("registrationDoc")} hint="RCCM, Kbis, Business License…" />
          <FileUploader label="Justificatif fiscal" value={data.taxDoc} onChange={upd("taxDoc")} hint="NIF, TVA, ICE…" />
          <FileUploader label="Justificatif d'adresse" value={data.addressProofDoc} onChange={upd("addressProofDoc")} hint="Facture eau/élec, bail, certificat de domiciliation" />
        </div>
      </div>

      <SubmitBtn submitting={submitting} approved={approved} />
    </form>
  );
}

// ── NIVEAU 2 — Représentant ───────────────────────────────────────────────────
function Level2Form({ data, setData, onSubmit, submitting, approved }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>👤</span> Niveau 2 — Vérification Représentant</h2>
      <p className={styles.formDesc}>
        Nous devons savoir avec qui nous signons. Cela élimine la quasi-totalité des arnaques.
      </p>

      <div className={styles.row}>
        <Field label="Prénom du représentant *" value={data.repFirstName} onChange={upd("repFirstName")} placeholder="Moussa" required />
        <Field label="Nom *" value={data.repLastName} onChange={upd("repLastName")} placeholder="Koné" required />
      </div>
      <div className={styles.row}>
        <Field label="Fonction *" value={data.repFunction} onChange={upd("repFunction")} placeholder="Directeur Général, CEO, Export Manager…" required />
        <SelectField
          label="Type de pièce d'identité *"
          value={data.repIdType}
          onChange={upd("repIdType")}
          options={[
            { value: "passport", label: "Passeport" },
            { value: "cni",      label: "Carte Nationale d'Identité" },
            { value: "sejour",   label: "Titre de séjour" },
          ]}
          required
        />
      </div>
      <Field label="Numéro de pièce d'identité *" value={data.repIdNumber} onChange={upd("repIdNumber")} placeholder="A12345678" required />

      <div className={styles.checkGroup}>
        <CheckRow label="Je possède une carte professionnelle" checked={data.hasProfCard} onChange={(v) => upd("hasProfCard")(v)} />
        <CheckRow label="Une vidéo-conférence de 10 min a été réalisée avec l'équipe VIT AUTO" checked={data.videoCallDone} onChange={(v) => upd("videoCallDone")(v)} />
      </div>

      <InfoBox icon="💡" text="La vidéo de 10 minutes est facultative pour le dépôt, mais sera demandée par notre équipe pour validation finale. Elle élimine 95% des faux profils." />

      <div className={styles.docSection}>
        <h3 className={styles.docTitle}>📎 Documents requis</h3>
        <div className={styles.docGrid}>
          <FileUploader label="Recto pièce d'identité *" value={data.idFrontDoc} onChange={upd("idFrontDoc")} />
          <FileUploader label="Verso pièce d'identité" value={data.idBackDoc} onChange={upd("idBackDoc")} />
          <FileUploader label="Selfie avec la pièce *" value={data.selfieDoc} onChange={upd("selfieDoc")} hint="Tenant votre document face caméra" />
          {data.hasProfCard && (
            <FileUploader label="Carte professionnelle" value={data.profCardDoc} onChange={upd("profCardDoc")} />
          )}
        </div>
      </div>

      <SubmitBtn submitting={submitting} approved={approved} />
    </form>
  );
}

// ── NIVEAU 3 — Activité commerciale ──────────────────────────────────────────
function Level3Form({ data, setData, onSubmit, submitting, approved }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>📊</span> Niveau 3 — Vérification Commerciale</h2>
      <p className={styles.formDesc}>
        Prouvez votre expertise réelle. Un vrai exportateur répond facilement à ces questions.
      </p>

      <div className={styles.row}>
        <Field label="Années d'expérience *" value={data.yearsExperience} onChange={upd("yearsExperience")} placeholder="5" type="number" min="0" required />
        <Field label="Volume mensuel moyen" value={data.monthlyVolume} onChange={upd("monthlyVolume")} placeholder="20-50 véhicules / mois" />
      </div>
      <div className={styles.row}>
        <Field label="Ports utilisés" value={data.portsUsed} onChange={upd("portsUsed")} placeholder="Abidjan, Le Havre, Shanghai, Jebel Ali…" />
        <Field label="Délais moyens de livraison" value={data.averageDelay} onChange={upd("averageDelay")} placeholder="30-45 jours" />
      </div>

      <MultiCheck label="Pays d'export *" options={EXPORT_COUNTRIES} value={data.exportCountries} onChange={upd("exportCountries")} />
      <MultiCheck label="Types d'activité *" options={ACTIVITY_TYPES_LIST} value={data.activityTypes} onChange={upd("activityTypes")} />
      <MultiCheck label="Catégories de véhicules" options={VEHICLE_CATS_LIST} value={data.vehicleCategories} onChange={upd("vehicleCategories")} />
      <MultiCheck label="Méthodes de paiement acceptées *" options={PAYMENT_METHODS_LIST} value={data.paymentMethods} onChange={upd("paymentMethods")} />

      <SubmitBtn submitting={submitting} approved={approved} />
    </form>
  );
}

// ── NIVEAU 4 — Banque ─────────────────────────────────────────────────────────
function Level4Form({ data, setData, onSubmit, submitting, approved }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>🏦</span> Niveau 4 — Vérification Bancaire</h2>
      <p className={styles.formDesc}>
        Très important : seul un compte professionnel au nom de l'entreprise est accepté.
        Jamais un compte personnel.
      </p>

      <InfoBox icon="⚠️" text="Le titulaire du compte DOIT être identique au nom de l'entreprise enregistrée au Niveau 1. Tout compte personnel est refusé." type="warning" />

      <div className={styles.row}>
        <Field label="Nom de la banque *" value={data.bankName} onChange={upd("bankName")} placeholder="Société Générale CI, SGBCI…" required />
        <Field label="Pays de la banque *" value={data.bankCountry} onChange={upd("bankCountry")} placeholder="Côte d'Ivoire" required />
      </div>
      <Field label="Titulaire du compte *" value={data.accountHolder} onChange={upd("accountHolder")} placeholder="VIT MOTORS SARL (= nom entreprise)" required />
      <div className={styles.row}>
        <Field label="IBAN" value={data.iban} onChange={upd("iban")} placeholder="CI12 0012 0345 6789 0012 3456 78" />
        <Field label="SWIFT / BIC" value={data.swift} onChange={upd("swift")} placeholder="SGCICIAB" />
      </div>

      <div className={styles.docSection}>
        <h3 className={styles.docTitle}>📎 Documents</h3>
        <FileUploader label="RIB / Relevé d'identité bancaire *" value={data.bankDoc} onChange={upd("bankDoc")} hint="Document officiel de la banque au nom de l'entreprise" />
      </div>

      <SubmitBtn submitting={submitting} approved={approved} />
    </form>
  );
}

// ── NIVEAU 5 — Véhicules ──────────────────────────────────────────────────────
function Level5Form({ data, setData, onSubmit, submitting, approved }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>🚗</span> Niveau 5 — Vérification Véhicules</h2>
      <p className={styles.formDesc}>
        Fournissez les informations et documents d'un véhicule représentatif de votre stock.
      </p>

      <div className={styles.row}>
        <Field label="Marque *" value={data.make} onChange={upd("make")} placeholder="Toyota" required />
        <Field label="Modèle *" value={data.model} onChange={upd("model")} placeholder="Land Cruiser" required />
      </div>
      <div className={styles.row}>
        <Field label="Année" value={data.year} onChange={upd("year")} placeholder="2022" type="number" />
        <Field label="Kilométrage" value={data.mileage} onChange={upd("mileage")} placeholder="45000" type="number" />
      </div>
      <Field label="Numéro VIN *" value={data.vin} onChange={upd("vin")} placeholder="JTEHB3FJ4MK012345" required />

      <div className={styles.checkGroup}>
        <CheckRow label="Vidéo du véhicule disponible (intérieur + extérieur)" checked={data.hasVideo} onChange={(v) => upd("hasVideo")(v)} />
        <CheckRow label="Rapport d'inspection technique fourni" checked={data.hasInspection} onChange={(v) => upd("hasInspection")(v)} />
        <CheckRow label="Historique d'entretien disponible" checked={data.hasHistory} onChange={(v) => upd("hasHistory")(v)} />
      </div>

      <div className={styles.docSection}>
        <h3 className={styles.docTitle}>📎 Documents</h3>
        <div className={styles.docGrid}>
          <FileUploader label="Carte grise / Titre de propriété *" value={data.grayCardDoc} onChange={upd("grayCardDoc")} />
          <FileUploader label="Photos du véhicule *" value={data.photoDoc} onChange={upd("photoDoc")} hint="Photos originales (pas de stock internet)" />
          <FileUploader label="Facture d'achat" value={data.invoiceDoc} onChange={upd("invoiceDoc")} />
        </div>
      </div>

      <SubmitBtn submitting={submitting} approved={approved} />
    </form>
  );
}

// ── NIVEAU 6 — Documents export ───────────────────────────────────────────────
function Level6Form({ data, setData, onSubmit, submitting, approved }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };

  const exportDocs = [
    { key: "canProvideProforma",          label: "Facture Proforma" },
    { key: "canProvideCommercialInvoice", label: "Facture Commerciale" },
    { key: "canProvidePackingList",        label: "Packing List" },
    { key: "canProvideBillOfLading",       label: "Bill of Lading (BL)" },
    { key: "canProvideOriginCert",         label: "Certificat d'Origine" },
    { key: "canProvideInspectionCert",     label: "Certificat d'Inspection" },
    { key: "canProvideCustomsDocs",        label: "Documents douaniers" },
  ];

  const checkedCount = exportDocs.filter((d) => data[d.key]).length;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>📦</span> Niveau 6 — Documents d'Export</h2>
      <p className={styles.formDesc}>
        Un vrai exportateur connaît et peut fournir tous ces documents. Si vous ne les connaissez pas,
        ce n'est probablement pas votre cœur de métier.
      </p>

      <div className={styles.exportDocGrid}>
        {exportDocs.map((d) => (
          <label key={d.key} className={`${styles.exportDocCard} ${data[d.key] ? styles.exportDocActive : ""}`}>
            <input
              type="checkbox"
              checked={data[d.key]}
              onChange={(e) => upd(d.key)(e.target.checked)}
              style={{ display: "none" }}
            />
            <span className={styles.exportDocCheck}>{data[d.key] ? "✅" : "○"}</span>
            <span className={styles.exportDocLabel}>{d.label}</span>
          </label>
        ))}
      </div>

      <div className={styles.exportScore}>
        <div className={styles.exportScoreBar}>
          <div style={{ width: `${(checkedCount / 7) * 100}%`, background: checkedCount >= 6 ? "#059669" : checkedCount >= 4 ? "#d97706" : "#ef4444" }} />
        </div>
        <span>{checkedCount}/7 documents — {checkedCount >= 6 ? "✅ Excellent" : checkedCount >= 4 ? "⚠️ Suffisant" : "❌ Insuffisant"}</span>
      </div>

      {checkedCount < 5 && (
        <InfoBox icon="⚠️" text="Nous attendons au minimum 5 documents sur 7. Un exportateur professionnel les maîtrise tous." type="warning" />
      )}

      <div className={styles.docSection}>
        <h3 className={styles.docTitle}>📎 Exemple de document (facultatif)</h3>
        <FileUploader label="Joindre un exemple (BL, proforma, etc.)" value={data.sampleDoc} onChange={upd("sampleDoc")} hint="Optionnel — accélère la validation" />
      </div>

      <SubmitBtn submitting={submitting} approved={approved} />
    </form>
  );
}

// ── NIVEAU 7 — Contrat ────────────────────────────────────────────────────────
function Level7Form({ data, setData, onSubmit, submitting, approved, cert }) {
  const upd = (k) => (v) => setData((p) => ({ ...p, [k]: v }));
  const handleSubmit = (e) => {
    e.preventDefault();
    const allChecked = Object.values(data).every(Boolean);
    if (!allChecked) { alert("Vous devez cocher toutes les cases pour signer le contrat."); return; }
    onSubmit();
  };

  const contracts = [
    { key: "agreedToGCU",       label: "J'accepte les Conditions Générales d'Utilisation de VIT AUTO" },
    { key: "agreedToCharte",    label: "Je m'engage à respecter la Charte Qualité VIT AUTO" },
    { key: "agreedToAntifraud", label: "J'accepte la Politique Anti-Fraude et anti-blanchiment" },
    { key: "agreedToDelays",    label: "Je garantis le respect des délais communiqués aux clients" },
    { key: "agreedToRefund",    label: "J'accepte la Politique de Remboursement en cas de litige" },
    { key: "agreedToDataProt",  label: "Je respecterai la Protection des Données Personnelles (RGPD)" },
  ];

  const prereqsMet = ["level1","level2","level3","level4","level5","level6"].every(
    (l) => cert?.[l]?.status === "approved"
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formTitle}><span className={styles.fIcon}>📝</span> Niveau 7 — Contrat Partenaire Fondateur</h2>
      <p className={styles.formDesc}>
        La dernière étape avant d'obtenir votre badge. En signant, vous vous engagez sur l'honneur
        envers nos clients et notre plateforme.
      </p>

      {!prereqsMet && (
        <InfoBox icon="🔒" text="Les niveaux 1 à 6 doivent être approuvés par notre équipe avant de pouvoir signer le contrat." type="warning" />
      )}

      <div className={styles.contractList}>
        {contracts.map((c) => (
          <label key={c.key} className={`${styles.contractItem} ${data[c.key] ? styles.contractItemChecked : ""}`}>
            <input
              type="checkbox"
              checked={data[c.key]}
              disabled={!prereqsMet || approved}
              onChange={(e) => upd(c.key)(e.target.checked)}
              className={styles.contractCheckbox}
            />
            <span className={styles.contractLabel}>{c.label}</span>
          </label>
        ))}
      </div>

      {prereqsMet && !approved && (
        <div className={styles.signatureBox}>
          <p className={styles.signatureTitle}>🖊️ Signature électronique</p>
          <p className={styles.signatureSub}>
            En cliquant "Signer le contrat", vous attestez que toutes les informations fournies
            sont exactes et que vous vous engagez à respecter les conditions ci-dessus.
            Votre signature électronique est horodatée et associée à votre adresse IP.
          </p>
        </div>
      )}

      {prereqsMet && (
        <SubmitBtn submitting={submitting} approved={approved} label="🖊️ Signer le contrat Partenaire Fondateur" />
      )}
    </form>
  );
}

// ── NIVEAU 8 — Badge final (panel info) ──────────────────────────────────────
function Level8Panel({ cert, badge }) {
  const l8 = cert?.level8;
  return (
    <div className={styles.level8Panel}>
      <div className={styles.l8Header}>
        <h2 className={styles.l8Title}>🏅 Niveau 8 — Attribution du Badge VIT AUTO</h2>
        <p className={styles.l8Sub}>
          Une fois les niveaux 1 à 7 approuvés, notre équipe vous attribue votre badge officiel.
        </p>
      </div>

      <div className={styles.badgeGrid}>
        {[
          { id: "verifie",   icon: "🟢", label: "Partenaire Vérifié",   req: "Niveaux 1 à 3 approuvés",      color: "#059669" },
          { id: "fondateur", icon: "🏆", label: "Partenaire Fondateur", req: "Niveaux 1 à 7 approuvés",      color: "#d97706" },
          { id: "premium",   icon: "⭐", label: "Partenaire Premium",   req: "Niveaux 1 à 7 + validation VIP", color: "#7c3aed" },
        ].map((b) => (
          <div
            key={b.id}
            className={`${styles.badgeCard} ${cert?.certificationBadge === b.id ? styles.badgeCardActive : ""}`}
            style={{ "--badge-color": b.color }}
          >
            <span className={styles.badgeCardIcon}>{b.icon}</span>
            <h3 className={styles.badgeCardLabel}>{b.label}</h3>
            <p className={styles.badgeCardReq}>{b.req}</p>
            {cert?.certificationBadge === b.id && (
              <span className={styles.badgeCardOwned}>Votre badge actuel</span>
            )}
          </div>
        ))}
      </div>

      {l8?.publicStatement && (
        <blockquote className={styles.publicStatement}>
          "{l8.publicStatement}"
          <cite>— L'équipe VIT AUTO</cite>
        </blockquote>
      )}
    </div>
  );
}

// ── Utilitaires UI ────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text", required, min }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        className={styles.input}
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        min={min}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <select className={styles.input} value={value || ""} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">Sélectionner…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function CheckRow({ label, checked, onChange }) {
  return (
    <label className={styles.checkRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={styles.checkbox}
      />
      <span>{label}</span>
    </label>
  );
}

function InfoBox({ icon, text, type = "info" }) {
  return (
    <div className={`${styles.infoBox} ${styles["infoBox_" + type]}`}>
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
