import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import styles from "./AdminPanel.module.css";

// ─── Utilitaires ───────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const timeAgo = (d) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1)  return "à l'instant";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};
const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
// Sanitise une URL avant de l'utiliser dans href (bloque javascript: et autres schémas dangereux)
const safeHref = (url) => {
  if (!url) return "#";
  const s = String(url).trim();
  if (/^(https?|mailto):/i.test(s)) return s;
  return "#";
};
// Version pour les images : autorise aussi les data:image/... (KYC documents stockés en base64)
const safeImgHref = (url) => {
  if (!url) return "#";
  const s = String(url).trim();
  if (/^(https?|data:image\/)/.test(s)) return s;
  return "#";
};

const ROLE_CONFIG = {
  client:     { label: "Client",     color: "#3b82f6", bg: "#eff6ff" },
  partenaire: { label: "Partenaire", color: "#10b981", bg: "#ecfdf5" },
  admin:      { label: "Admin",      color: "#f59e0b", bg: "#fffbeb" },
  chauffeur:  { label: "Chauffeur",  color: "#8b5cf6", bg: "#f5f3ff" },
};

const KYC_CFG = {
  VERIFIE:               { label: "✅ Vérifié",    color: "#16a34a", bg: "#dcfce7" },
  EN_ATTENTE:            { label: "⏳ Attente",    color: "#d97706", bg: "#fef3c7" },
  REFUSE:                { label: "❌ Refusé",     color: "#dc2626", bg: "#fee2e2" },
  A_REVOIR_MANUELLEMENT: { label: "🔍 À revoir",  color: "#7c3aed", bg: "#ede9fe" },
};

const CERTIF_CFG = {
  premium:   { label: "⭐ Premium",   color: "#7c3aed", bg: "#ede9fe" },
  fondateur: { label: "🏆 Fondateur", color: "#d97706", bg: "#fef3c7" },
  verifie:   { label: "🟢 Vérifié",  color: "#16a34a", bg: "#dcfce7" },
};

// Champs texte + documents soumis par niveau de certification partenaire (voir
// server/models/PartnerCertification.js) — utilisé pour afficher à l'admin ce que
// le partenaire a réellement soumis avant qu'il approuve/refuse un niveau (avant ce
// mapping, le modal d'examen ne montrait que le statut, jamais les données/documents).
const CERT_LEVEL_FIELDS = {
  1: {
    docs: [
      { key: "registrationDoc",  label: "Registre de commerce" },
      { key: "taxDoc",           label: "Attestation fiscale" },
      { key: "addressProofDoc",  label: "Justificatif d'adresse" },
    ],
    fields: [
      { key: "companyName",        label: "Société" },
      { key: "legalForm",          label: "Forme juridique" },
      { key: "country",            label: "Pays" },
      { key: "registrationType",   label: "Type d'immatriculation" },
      { key: "registrationNumber", label: "N° d'immatriculation" },
      { key: "taxId",              label: "N° fiscal" },
      { key: "officialAddress",    label: "Adresse" },
      { key: "city",               label: "Ville" },
      { key: "website",            label: "Site web" },
      { key: "businessEmail",      label: "Email pro" },
    ],
  },
  2: {
    docs: [
      { key: "idFrontDoc",  label: "Pièce d'identité — recto" },
      { key: "idBackDoc",   label: "Pièce d'identité — verso" },
      { key: "selfieDoc",   label: "Selfie" },
      { key: "profCardDoc", label: "Carte professionnelle" },
    ],
    fields: [
      { key: "repFirstName",   label: "Prénom" },
      { key: "repLastName",    label: "Nom" },
      { key: "repFunction",    label: "Fonction" },
      { key: "repIdType",      label: "Type de pièce" },
      { key: "repIdNumber",    label: "N° de pièce" },
      { key: "hasProfCard",    label: "Carte professionnelle", bool: true },
      { key: "videoCallDone",  label: "Appel vidéo effectué",  bool: true },
      { key: "videoCallDate",  label: "Date appel vidéo",      date: true },
    ],
  },
  3: {
    docs: [],
    fields: [
      { key: "yearsExperience",   label: "Années d'expérience" },
      { key: "exportCountries",   label: "Pays d'export",           list: true },
      { key: "monthlyVolume",     label: "Volume mensuel" },
      { key: "portsUsed",         label: "Ports utilisés",          list: true },
      { key: "paymentMethods",    label: "Moyens de paiement",      list: true },
      { key: "averageDelay",      label: "Délai moyen" },
      { key: "activityTypes",     label: "Types d'activité",        list: true },
      { key: "vehicleCategories", label: "Catégories de véhicules", list: true },
    ],
  },
  4: {
    docs: [{ key: "bankDoc", label: "Relevé bancaire / RIB" }],
    fields: [
      { key: "bankName",      label: "Banque" },
      { key: "accountHolder", label: "Titulaire du compte" },
      { key: "iban",          label: "IBAN" },
      { key: "swift",         label: "SWIFT" },
      { key: "bankCountry",   label: "Pays de la banque" },
    ],
  },
  5: {
    docs: [
      { key: "grayCardDoc", label: "Carte grise" },
      { key: "photoDoc",    label: "Photo du véhicule" },
      { key: "invoiceDoc",  label: "Facture d'achat" },
    ],
    fields: [
      { key: "make",          label: "Marque" },
      { key: "model",         label: "Modèle" },
      { key: "year",          label: "Année" },
      { key: "vin",           label: "VIN" },
      { key: "mileage",       label: "Kilométrage" },
      { key: "hasVideo",      label: "Vidéo fournie",          bool: true },
      { key: "hasInspection", label: "Rapport d'inspection",   bool: true },
      { key: "hasHistory",    label: "Historique fourni",      bool: true },
    ],
  },
  6: {
    docs: [{ key: "sampleDoc", label: "Exemple de document export" }],
    fields: [
      { key: "canProvideProforma",         label: "Facture proforma",        bool: true },
      { key: "canProvideCommercialInvoice",label: "Facture commerciale",     bool: true },
      { key: "canProvidePackingList",      label: "Packing list",            bool: true },
      { key: "canProvideBillOfLading",     label: "Connaissement (B/L)",     bool: true },
      { key: "canProvideOriginCert",       label: "Certificat d'origine",    bool: true },
      { key: "canProvideInspectionCert",   label: "Certificat d'inspection", bool: true },
      { key: "canProvideCustomsDocs",      label: "Documents douaniers",     bool: true },
    ],
  },
  7: {
    docs: [],
    fields: [
      { key: "agreedToGCU",       label: "CGU acceptées",              bool: true },
      { key: "agreedToCharte",    label: "Charte acceptée",            bool: true },
      { key: "agreedToAntifraud", label: "Engagement anti-fraude",     bool: true },
      { key: "agreedToDelays",    label: "Engagement délais",          bool: true },
      { key: "agreedToDataProt",  label: "Protection des données",     bool: true },
      { key: "agreedToRefund",    label: "Politique de remboursement", bool: true },
      { key: "signedAt",          label: "Signé le",                   date: true },
      { key: "signerIp",          label: "IP de signature" },
    ],
  },
};

const fmtCertField = (f, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (f.bool) return v ? "✅ Oui" : "❌ Non";
  if (f.date) return new Date(v).toLocaleString("fr-FR");
  if (f.list) return Array.isArray(v) && v.length ? v.join(", ") : "—";
  return String(v);
};

// ── Documents soumis pour un niveau de certification (image + lien plein écran,
// même pattern que les documents Partner Verification / Import-Export) ──────────
function CertLevelDocs({ level, lv }) {
  const cfg = CERT_LEVEL_FIELDS[level];
  if (!cfg) return null;
  const hasFields = cfg.fields.some((f) => lv?.[f.key] !== undefined && lv?.[f.key] !== null && lv?.[f.key] !== "");
  if (!hasFields && cfg.docs.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {hasFields && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: "4px 14px",
          background: "#f8fafc", borderRadius: 8, padding: "10px 12px",
          marginBottom: cfg.docs.length ? 10 : 0, fontSize: ".78rem",
        }}>
          {cfg.fields.map((f) => (
            <div key={f.key}><span style={{ color: "#94a3b8" }}>{f.label} </span><strong style={{ color: "#0f1b3f" }}>{fmtCertField(f, lv?.[f.key])}</strong></div>
          ))}
        </div>
      )}
      {cfg.docs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10 }}>
          {cfg.docs.map(({ key, label }) => {
            const doc = lv?.[key];
            return (
              <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#64748b", padding: "5px 8px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
                {doc?.data ? (
                  <a href={safeImgHref(doc.data)} target="_blank" rel="noreferrer noopener">
                    <img src={doc.data} alt={label} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
                      onError={(e) => { e.target.parentElement.innerHTML = '<div style="height:90px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.72rem;padding:6px;text-align:center">Aperçu indisponible</div>'; }} />
                  </a>
                ) : (
                  <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".72rem" }}>Non fourni</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Documents légaux + médias plateforme soumis lors de l'onboarding Founding Partner
// (voir server/models/PartnerOnboarding.js — legalDocs/platformMedia) — jusqu'ici
// jamais rendus dans le détail admin, qui n'affichait que les métadonnées LOI/Accord.
const FOUNDING_LEGAL_DOCS = [
  { key: "businessRegistration", label: "Registre de commerce" },
  { key: "businessLicense",      label: "Licence commerciale" },
  { key: "exportLicense",        label: "Licence d'export" },
  { key: "taxCertificate",       label: "Certificat fiscal" },
  { key: "proofOfAddress",       label: "Justificatif d'adresse" },
];

const FOUNDING_PHOTO_GROUPS = [
  { key: "companyPhotos",   label: "Photos entreprise" },
  { key: "officePhotos",    label: "Photos bureaux" },
  { key: "showroomPhotos",  label: "Photos showroom" },
  { key: "warehousePhotos", label: "Photos entrepôt" },
  { key: "teamPhotos",      label: "Photos équipe" },
];

function FoundingDocs({ o }) {
  const legal = o.legalDocs || {};
  const media = o.platformMedia || {};
  const hasLegal = FOUNDING_LEGAL_DOCS.some((d) => legal[d.key]);
  const hasMedia = !!media.logo || FOUNDING_PHOTO_GROUPS.some((g) => media[g.key]?.length) || !!media.promotionalVideo;

  if (!hasLegal && !hasMedia) {
    return (
      <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 12, fontSize: ".8rem", color: "#dc2626" }}>
        ⚠️ Aucun document légal ni média soumis par ce partenaire.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {hasLegal && (
        <div style={{ marginBottom: hasMedia ? 12 : 0 }}>
          <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>📁 Documents légaux</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10 }}>
            {FOUNDING_LEGAL_DOCS.map(({ key, label }) => (
              <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#64748b", padding: "5px 8px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
                {legal[key] ? (
                  <a href={safeImgHref(legal[key])} target="_blank" rel="noreferrer noopener">
                    <img src={legal[key]} alt={label} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
                      onError={(e) => { e.target.parentElement.innerHTML = '<div style="height:90px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.72rem;padding:6px;text-align:center">Aperçu indisponible</div>'; }} />
                  </a>
                ) : (
                  <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".72rem" }}>Non fourni</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {hasMedia && (
        <div>
          <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>🖼️ Médias plateforme</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px,1fr))", gap: 8 }}>
            {media.logo && (
              <a href={safeImgHref(media.logo)} target="_blank" rel="noreferrer noopener" title="Logo">
                <img src={media.logo} alt="Logo" style={{ width: "100%", height: 70, objectFit: "contain", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }} />
              </a>
            )}
            {FOUNDING_PHOTO_GROUPS.flatMap(({ key, label }) =>
              (media[key] || []).map((url, i) => (
                <a key={`${key}-${i}`} href={safeImgHref(url)} target="_blank" rel="noreferrer noopener" title={label}>
                  <img src={url} alt={label} style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                </a>
              ))
            )}
          </div>
          {media.promotionalVideo && (
            <a href={safeHref(media.promotionalVideo)} target="_blank" rel="noreferrer noopener" style={{ display: "inline-block", marginTop: 8, fontSize: ".78rem", color: "#2563eb", textDecoration: "underline" }}>
              🎬 Voir la vidéo promotionnelle ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_VEH = {
  approved: { label: "Publiée",     color: "#10b981", bg: "#ecfdf5" },
  pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  rejected: { label: "Rejetée",     color: "#ef4444", bg: "#fef2f2" },
};

const STATUS_BK = {
  "À confirmer":             { label: "Nouvelle",           color: "#f59e0b", bg: "#fffbeb" },
  pending:                   { label: "Nouvelle",           color: "#f59e0b", bg: "#fffbeb" },
  confirmed:                 { label: "Acceptée",           color: "#10b981", bg: "#ecfdf5" },
  preparing:                 { label: "En cours",           color: "#06b6d4", bg: "#ecfeff" },
  ready:                     { label: "Prête",              color: "#8b5cf6", bg: "#f5f3ff" },
  in_progress:               { label: "En route",           color: "#3b82f6", bg: "#eff6ff" },
  client_arrived:            { label: "Client arrivé",      color: "#0ea5e9", bg: "#e0f2fe" },
  client_absent:             { label: "Client absent",      color: "#dc2626", bg: "#fef2f2" },
  transaction_concluded:     { label: "Transaction",        color: "#16a34a", bg: "#dcfce7" },
  waiting_client_validation: { label: "Validation client",  color: "#d97706", bg: "#fef3c7" },
  completed:                 { label: "Terminée",           color: "#64748b", bg: "#f8fafc" },
  cancelled:                 { label: "Annulée",            color: "#ef4444", bg: "#fef2f2" },
  disputed:                  { label: "Litige",             color: "#dc2626", bg: "#fef2f2" },
};

// ─── Mini barre de graphique ────────────────────────────────────────────────────
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.miniBarWrap}>
      <div className={styles.miniBar} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─── Carte de stat ──────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className={styles.statCard} style={{ borderTop: `4px solid ${color}` }}>
      <div className={styles.statIcon} style={{ background: color + "20", color }}>{icon}</div>
      <div className={styles.statBody}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
        {sub && <span className={styles.statSub}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── Badge rôle / statut ────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return <span className={styles.badge} style={{ color, background: bg }}>{label}</span>;
}

// ─── Modal confirmation ─────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel, danger }) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
        <p className={styles.confirmMsg}>{message}</p>
        <div className={styles.confirmActions}>
          <button className={danger ? styles.btnDanger : styles.btnPrimary} onClick={onConfirm}>Confirmer</button>
          <button className={styles.btnGhost} onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminPanel() {
  const { user, isAuthenticated, token, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]   = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const isMobile = useRef(window.innerWidth <= 900);

  // Détecter le passage mobile/desktop et adapter la sidebar
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const handler = (e) => {
      isMobile.current = e.matches;
      setSidebarOpen(!e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [ieRequests, setIeRequests]       = useState([]);
  const [ieLoading,  setIeLoading]        = useState(false);
  // Commissions & Factures
  const [commissions,      setCommissions]      = useState([]);
  const [commissionsStats, setCommissionsStats] = useState(null);
  const [invoices,         setInvoices]         = useState([]);
  const [invoicesStats,    setInvoicesStats]    = useState(null);
  const [invoiceLoading,   setInvoiceLoading]   = useState(false);
  const [invoiceYear,      setInvoiceYear]      = useState(new Date().getFullYear());
  const [invoiceMonth,     setInvoiceMonth]     = useState("");
  const [generateForm,     setGenerateForm]     = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [generating,       setGenerating]       = useState(false);
  const [importerProfiles, setImporterProfiles] = useState([]);
  const [importerListings, setImporterListings] = useState([]);
  const [importerLoading,  setImporterLoading]  = useState(false);
  const [importerFilter,   setImporterFilter]   = useState("pending");
  const [listingFilter,    setListingFilter]     = useState("pending");
  const [reviewModal,      setReviewModal]       = useState(null);
  const [reviewDecision,   setReviewDecision]    = useState({ status: "verified", rejectionReason: "", badgeLevel: "silver" });
  const [listingRejectModal, setListingRejectModal] = useState(null);
  const [listingRejectNote,  setListingRejectNote]  = useState("");
  const [exporterDetail,     setExporterDetail]     = useState(null);
  // KYC Admin
  const [kycList,       setKycList]       = useState([]);
  const [kycLoading,    setKycLoading]    = useState(false);
  const [kycFilter,     setKycFilter]     = useState("EN_ATTENTE");
  const [kycDetailUser, setKycDetailUser] = useState(null);
  const [kycDetailLoading, setKycDetailLoading] = useState(false);
  const [kycReviewForm, setKycReviewForm] = useState({ decision: "VERIFIE", note: "" });
  const [kycReviewLoading, setKycReviewLoading] = useState(false);
  const [kycReviewMsg,  setKycReviewMsg]  = useState("");
  // Support Client (inbox chats client_support / partner_support)
  const [supportChats,    setSupportChats]    = useState([]);
  const [supportLoading,  setSupportLoading]  = useState(false);
  const [supportActive,   setSupportActive]   = useState(null);   // chat sélectionné (résumé liste)
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportMsgLoading, setSupportMsgLoading] = useState(false);
  const [supportReply,    setSupportReply]    = useState("");
  const [supportSending,  setSupportSending]  = useState(false);
  // Certification Partenaire
  const [certList,          setCertList]          = useState([]);
  const [certLoading,       setCertLoading]        = useState(false);
  const [certFilter,        setCertFilter]         = useState("all");
  const [certDetail,        setCertDetail]         = useState(null);
  const [certReviewLevel,   setCertReviewLevel]    = useState(null);
  const [certReviewForm,    setCertReviewForm]     = useState({ decision: "approved", note: "" });
  const [certBadgeForm,     setCertBadgeForm]      = useState({ badge: "verifie", publicStatement: "", note: "" });
  const [certReviewLoading, setCertReviewLoading]  = useState(false);
  const [certReviewMsg,     setCertReviewMsg]      = useState("");

  // Partner Verification System
  const [pvList,            setPvList]            = useState([]);
  const [pvStats,           setPvStats]           = useState(null);
  const [pvLoading,         setPvLoading]         = useState(false);
  const [pvFilter,          setPvFilter]          = useState({ status: "", trustLevel: "", companyType: "", search: "" });
  const [pvDetail,          setPvDetail]          = useState(null);
  const [pvCreateModal,     setPvCreateModal]     = useState(false);
  const [pvCreateForm,      setPvCreateForm]      = useState({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
  const [pvSaving,          setPvSaving]          = useState(false);
  const [pvCriterionLoading,setPvCriterionLoading]= useState("");

  const [stats,     setStats]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [vehicles,  setVehicles]  = useState([]);
  const [bookings,  setBookings]  = useState([]);
  const [drivers,   setDrivers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  // PMS Admin
  const [pmsStats,    setPmsStats]    = useState(null);
  const [pmsShowrooms,setPmsShowrooms]= useState([]);
  const [pmsLoading,  setPmsLoading]  = useState(false);
  const [pmsFilter,   setPmsFilter]   = useState("all");

  // Founding Partner Onboarding Admin
  const [foundingList,      setFoundingList]     = useState([]);
  const [foundingStats,     setFoundingStats]    = useState(null);
  const [foundingLoading,   setFoundingLoading]  = useState(false);
  const [foundingDetail,    setFoundingDetail]   = useState(null);
  const [foundingSignLink,  setFoundingSignLink] = useState(null); // { id, link, type, companyName }
  const [foundingNote,      setFoundingNote]     = useState("");
  const [foundingAction,    setFoundingAction]   = useState(null); // { id, type: 'approve'|'reject'|'agreement' }
  const [foundingSubmitting, setFoundingSubmitting] = useState(false); // évite le double-clic (envoi LOI/accord/rejet en double)
  // CRM Directory
  const [foundingView,      setFoundingView]     = useState("onboarding"); // "onboarding" | "crm"
  const [foundingCRMFilter, setFoundingCRMFilter]= useState("");           // crmStatus filter
  const [foundingCRMEdit,   setFoundingCRMEdit]  = useState(null);         // { id, data: {...} }

  // Filtres
  const [userSearch,  setUserSearch]  = useState("");
  const [userRole,    setUserRole]    = useState("all");
  const [vehStatus,   setVehStatus]   = useState("all");
  const [bkStatus,    setBkStatus]    = useState("all");

  // Pagination
  const [userPage,  setUserPage]  = useState(1);
  const [vehPage,   setVehPage]   = useState(1);
  const [bkPage,    setBkPage]    = useState(1);
  const PAGE_SIZE = 10;

  // Confirmation
  const [confirm, setConfirm] = useState(null);

  // Rejection reason (vehicles)
  const [rejectModal, setRejectModal] = useState(null); // { vid, name }
  const [rejectReason, setRejectReason] = useState("");

  // Rejection reason (drivers) — utilisé dans le modal + la section Validations
  const [driverRejectModal,  setDriverRejectModal]  = useState(null);
  const [driverRejectReason, setDriverRejectReason] = useState("");

  // Booking action
  const [bkActionModal,   setBkActionModal]   = useState(null); // { id, name, action }
  const [bkCancelReason,  setBkCancelReason]  = useState("");
  const [bkSearch,        setBkSearch]        = useState("");
  const [bkType,          setBkType]          = useState("all");
  // Dispute & Force complete modals
  const [disputeModal,    setDisputeModal]    = useState(null); // { booking }
  const [disputeNote,     setDisputeNote]     = useState("");
  const [disputeResol,    setDisputeResol]    = useState("completed");
  const [forceModal,      setForceModal]      = useState(null); // { booking }
  const [forceAmount,     setForceAmount]     = useState("");
  const [forceNote,       setForceNote]       = useState("");

  // Broadcast notification
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ titre: "", message: "", targetRole: "all", lien: "" });
  const [broadcastSending, setBroadcastSending] = useState(false);

  // ── Toasts ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Headers API ─────────────────────────────────────────────────────────────
  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  // ── Chargement données ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sRes, uRes, vRes, bRes, dRes] = await Promise.all([
        fetch("/api/users/stats",    { headers }),
        fetch("/api/users?limit=200", { headers }),
        fetch("/api/vehicles?limit=200&status=all", { headers }),
        fetch("/api/bookings?limit=200", { headers }),
        fetch("/api/drivers/pending", { headers }),
      ]);
      if (sRes.ok) setStats((await sRes.json()));
      if (uRes.ok) setUsers((await uRes.json()).users || []);
      if (vRes.ok) {
        const d = await vRes.json();
        setVehicles(Array.isArray(d) ? d : d.vehicles || []);
      }
      if (bRes.ok) setBookings((await bRes.json()).bookings || []);
      if (dRes.ok) setDrivers((await dRes.json()).drivers || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, headers]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Demandes Import/Export ──────────────────────────────────────────────────
  const loadImportExport = useCallback(async () => {
    if (!token) return;
    setIeLoading(true);
    try {
      const res = await fetch("/api/import-export/requests?limit=100", { headers });
      if (res.ok) {
        const d = await res.json();
        setIeRequests(Array.isArray(d) ? d : d.requests || []);
      }
    } catch { /* endpoint optionnel */ }
    setIeLoading(false);
  }, [token, headers]);

  // ── Profils & annonces importateurs ────────────────────────────────────────
  const loadImporters = useCallback(async () => {
    if (!token) return;
    setImporterLoading(true);
    try {
      const [pRes, lRes] = await Promise.all([
        fetch(`/api/import-export/importer-profiles?limit=100&status=${importerFilter}`, { headers }),
        fetch(`/api/import-export/listings/admin?limit=100&status=${listingFilter}`,     { headers }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setImporterProfiles(d.profiles || []); }
      if (lRes.ok) { const d = await lRes.json(); setImporterListings(d.listings || []); }
    } catch {}
    setImporterLoading(false);
  }, [token, headers, importerFilter, listingFilter]);

  const loadCommissions = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ year: invoiceYear });
      if (invoiceMonth) params.set("month", invoiceMonth);
      const r = await fetch(`/api/invoices/commissions?${params}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setCommissions(d.bookings || []);
        setCommissionsStats({ total: d.totalCommissions, transactions: d.totalTransactions, count: d.count });
      }
    } catch { /* ignore */ }
  }, [token, headers, invoiceYear, invoiceMonth]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceLoading(true);
    try {
      const r = await fetch("/api/invoices?limit=100", { headers });
      if (r.ok) {
        const d = await r.json();
        setInvoices(d.invoices || []);
        setInvoicesStats({ totalPaid: d.totalPaid, totalPending: d.totalPending });
      }
    } catch { /* ignore */ }
    setInvoiceLoading(false);
  }, [token, headers]);

  // ── Support Client ──────────────────────────────────────────────────────────
  const loadSupportChats = useCallback(async () => {
    if (!token) return;
    setSupportLoading(true);
    try {
      const r = await fetch("/api/chats/support", { headers });
      if (r.ok) { const d = await r.json(); setSupportChats(d.chats || []); }
    } catch { /* ignore */ }
    setSupportLoading(false);
  }, [token, headers]);

  const openSupportChat = useCallback(async (chat) => {
    setSupportActive(chat);
    setSupportMsgLoading(true);
    setSupportMessages([]);
    try {
      const r = await fetch(`/api/chats/${chat._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setSupportMessages(d.messages || []);
        setSupportChats((prev) => prev.map((c) => c._id === chat._id ? { ...c, unread: 0, needsReply: false } : c));
      }
    } catch { /* ignore */ }
    setSupportMsgLoading(false);
  }, [headers]);

  const sendSupportReply = useCallback(async () => {
    const content = supportReply.trim();
    if (!content || !supportActive) return;
    setSupportSending(true);
    try {
      const r = await fetch(`/api/chats/${supportActive._id}`, {
        method: "POST", headers, body: JSON.stringify({ content }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSupportMessages((prev) => [...prev, d.message]);
        setSupportReply("");
        setSupportChats((prev) => prev.map((c) =>
          c._id === supportActive._id
            ? { ...c, lastMessage: content.slice(0, 100), lastMessageAt: new Date().toISOString(), needsReply: false }
            : c
        ));
      } else {
        showToast(d.message || "Erreur lors de l'envoi.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
    setSupportSending(false);
  }, [headers, supportReply, supportActive, showToast]);

  const loadKycList = useCallback(async (status = "") => {
    if (!token) return;
    setKycLoading(true);
    try {
      const params = new URLSearchParams({ limit: 50 });
      if (status) params.set("status", status);
      const r = await fetch(`/api/kyc/admin/list?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setKycList(d.users || []); }
    } catch { /* ignore */ }
    setKycLoading(false);
  }, [token, headers]);

  const loadCertList = useCallback(async () => {
    if (!token) return;
    setCertLoading(true);
    try {
      const r = await fetch(`/api/certification/admin/list?limit=100`, { headers });
      if (r.ok) { const d = await r.json(); setCertList(d.certifications || []); }
    } catch { /* ignore */ }
    setCertLoading(false);
  }, [token, headers]);

  const handleCertLevelReview = useCallback(async (userId, level) => {
    setCertReviewLoading(true); setCertReviewMsg("");
    try {
      const r = await fetch(`/api/certification/admin/${userId}/level/${level}/review`, {
        method: "PATCH", headers, body: JSON.stringify(certReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCertReviewMsg(`✅ Niveau ${level} : ${certReviewForm.decision}`);
        setCertReviewLevel(null);
        loadCertList();
        if (certDetail?.userId?._id === userId) {
          const dr = await fetch(`/api/certification/admin/${userId}`, { headers });
          if (dr.ok) { const dd = await dr.json(); setCertDetail(dd.certification); }
        }
      } else {
        setCertReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setCertReviewMsg("❌ Connexion impossible."); }
    setCertReviewLoading(false);
  }, [headers, certReviewForm, certDetail, loadCertList]);

  const handleCertBadge = useCallback(async (userId) => {
    setCertReviewLoading(true); setCertReviewMsg("");
    try {
      const r = await fetch(`/api/certification/admin/${userId}/badge`, {
        method: "PATCH", headers, body: JSON.stringify(certBadgeForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setCertReviewMsg(`✅ Badge attribué : ${certBadgeForm.badge}`);
        loadCertList();
        if (certDetail?.userId?._id === userId) {
          const dr = await fetch(`/api/certification/admin/${userId}`, { headers });
          if (dr.ok) { const dd = await dr.json(); setCertDetail(dd.certification); }
        }
      } else {
        setCertReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setCertReviewMsg("❌ Connexion impossible."); }
    setCertReviewLoading(false);
  }, [headers, certBadgeForm, certDetail, loadCertList]);

  // Ouvre le dossier KYC — charge le détail complet (photos recto/verso/selfie,
  // permis de conduire...) depuis /api/kyc/admin/:userId, car la LISTE exclut
  // volontairement ces images base64 (trop lourdes pour un listing de 50 dossiers).
  const openKycDetail = useCallback(async (u) => {
    setKycDetailUser(u);
    setKycReviewForm({ decision: u.kycStatus === "VERIFIE" ? "EN_ATTENTE" : "VERIFIE", note: "" });
    setKycReviewMsg("");
    setKycDetailLoading(true);
    try {
      const r = await fetch(`/api/kyc/admin/${u._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setKycDetailUser(d.user);
      }
    } catch { /* garde les données de la liste en cas d'échec réseau */ }
    setKycDetailLoading(false);
  }, [headers]);

  const handleKycReview = async (userId) => {
    setKycReviewLoading(true); setKycReviewMsg("");
    try {
      const r = await fetch(`/api/kyc/admin/${userId}/review`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(kycReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setKycReviewMsg(`✅ Décision enregistrée : ${kycReviewForm.decision}`);
        setKycDetailUser(null);
        loadKycList(kycFilter);
      } else {
        setKycReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setKycReviewMsg("❌ Connexion impossible."); }
    setKycReviewLoading(false);
  };

  // ── PMS Admin ─────────────────────────────────────────────────────────────
  const loadPMSAdmin = useCallback(async () => {
    if (!token) return;
    setPmsLoading(true);
    try {
      const published = pmsFilter === "all" ? "" : `?published=${pmsFilter === "published"}`;
      const [statsRes, showroomsRes] = await Promise.all([
        fetch("/api/pms/admin/stats",             { headers }),
        fetch(`/api/pms/admin/showrooms${published}`, { headers }),
      ]);
      if (statsRes.ok)     setPmsStats(await statsRes.json());
      if (showroomsRes.ok) setPmsShowrooms((await showroomsRes.json()).showrooms || []);
    } catch { /* ignore */ }
    setPmsLoading(false);
  }, [token, headers, pmsFilter]);

  const loadFoundingPartners = useCallback(async () => {
    if (!token) return;
    setFoundingLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/partner-onboarding/admin/list?limit=100", { headers }),
        fetch("/api/partner-onboarding/admin/stats",          { headers }),
      ]);
      if (listRes.ok)  setFoundingList((await listRes.json()).onboardings || []);
      if (statsRes.ok) setFoundingStats(await statsRes.json());
    } catch { /* ignore */ }
    setFoundingLoading(false);
  }, [token, headers]);

  const foundingApprove = async (id, note) => {
    if (foundingSubmitting) return; // évite le double-clic (double envoi de LOI)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/approve`, {
        method: "POST", headers,
        body: JSON.stringify({ note: note || "" }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "loi", companyName: company });
      showToast("Candidature approuvée — LOI envoyée par email", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingSendAgreement = async (id) => {
    if (foundingSubmitting) return; // évite le double-clic (double envoi de l'accord)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/send-agreement`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "agreement", companyName: company });
      showToast("Accord envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingReject = async (id, note) => {
    if (!note?.trim()) { showToast("Note de rejet requise", "error"); return; }
    if (foundingSubmitting) return; // évite le double-clic (double rejet)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/reject`, {
        method: "POST", headers,
        body: JSON.stringify({ note }),
      });
      if (!r.ok) { showToast("Erreur", "error"); return; }
      showToast("Dossier rejeté", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingUpdateCRM = async (id, data) => {
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/crm`, {
        method: "PATCH", headers,
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) { showToast(json.message || "Erreur CRM", "error"); return; }
      showToast("CRM mis à jour", "success");
      setFoundingCRMEdit(null);
      setFoundingList((prev) => prev.map((o) =>
        o._id === id ? { ...o, adminCRM: json.adminCRM } : o
      ));
    } catch { showToast("Erreur réseau", "error"); }
  };

  const adminToggleShowroom = async (id) => {
    try {
      const r = await fetch(`/api/pms/admin/showrooms/${id}/toggle`, { method: "PATCH", headers });
      if (r.ok) {
        const { isPublished } = await r.json();
        setPmsShowrooms((prev) => prev.map((s) => s._id === id ? { ...s, isPublished } : s));
        showToast(isPublished ? "Showroom publié" : "Showroom dépublié", "success");
      }
    } catch { showToast("Erreur", "error"); }
  };

  // ── Partner Verification ───────────────────────────────────────────────────
  const loadPartnerVerif = useCallback(async () => {
    if (!token) return;
    setPvLoading(true);
    try {
      const params = new URLSearchParams();
      if (pvFilter.status)      params.set("status",      pvFilter.status);
      if (pvFilter.trustLevel)  params.set("trustLevel",  pvFilter.trustLevel);
      if (pvFilter.companyType) params.set("companyType", pvFilter.companyType);
      if (pvFilter.search)      params.set("search",      pvFilter.search);
      params.set("limit", "100");
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/partner-verif/admin/list?${params}`, { headers }),
        fetch("/api/partner-verif/admin/stats",          { headers }),
      ]);
      if (listRes.ok)  setPvList((await listRes.json()).verifications || []);
      if (statsRes.ok) setPvStats(await statsRes.json());
    } catch { /* ignore */ }
    setPvLoading(false);
  }, [token, headers, pvFilter]);

  useEffect(() => {
    if (activeTab === "import_export")  loadImportExport();
    if (activeTab === "exportateurs")   loadImporters();
    if (activeTab === "commissions")    loadCommissions();
    if (activeTab === "factures")       loadInvoices();
    if (activeTab === "kyc")            loadKycList(kycFilter);
    if (activeTab === "certification")  loadCertList();
    if (activeTab === "partner_verif")     loadPartnerVerif();
    if (activeTab === "pms_partners")      loadPMSAdmin();
    if (activeTab === "founding_partners") loadFoundingPartners();
    if (activeTab === "support")           loadSupportChats();
  }, [activeTab, loadImportExport, loadImporters, loadCommissions, loadInvoices, loadKycList, kycFilter, loadCertList, loadPartnerVerif, loadPMSAdmin, loadFoundingPartners, loadSupportChats]);

  // Rafraîchissement périodique de la liste support (nouvelles demandes) tant que
  // l'onglet est affiché — même logique de polling que le widget chat public.
  useEffect(() => {
    if (activeTab !== "support") return undefined;
    const t = setInterval(loadSupportChats, 15_000);
    return () => clearInterval(t);
  }, [activeTab, loadSupportChats]);

  // Ferme tous les modals au changement d'onglet pour éviter les états résiduels
  useEffect(() => {
    setConfirm(null);
    setRejectModal(null);
    setRejectReason("");
    setDriverRejectModal(null);
    setDriverRejectReason("");
    setBkActionModal(null);
    setBkCancelReason("");
    setDisputeModal(null);
    setForceModal(null);
    setReviewModal(null);
    setListingRejectModal(null);
    setExporterDetail(null);
    setKycDetailUser(null);
    setPvDetail(null);
    setPvCreateModal(false);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions utilisateurs ────────────────────────────────────────────────────
  const toggleBlock = useCallback(async (uid) => {
    try {
      const res = await fetch(`/api/users/${uid}/toggle`, { method: "PATCH", headers });
      if (!res.ok) throw new Error();
      const { user: updated } = await res.json();
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, isActive: updated.isActive } : u));
      showToast(updated.isActive ? "Compte réactivé" : "Compte bloqué");
    } catch { showToast("Erreur lors du blocage", "error"); }
  }, [headers, showToast]);

  const changeRole = useCallback(async (uid, role) => {
    try {
      const res = await fetch(`/api/users/${uid}/role`, {
        method: "PATCH", headers, body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      const { user: updated } = await res.json();
      setUsers((prev) => prev.map((u) => u._id === uid ? { ...u, role: updated.role } : u));
      showToast(`Rôle changé → ${updated.role}`);
    } catch { showToast("Erreur lors du changement de rôle", "error"); }
  }, [headers, showToast]);

  const deleteUser = useCallback(async (uid) => {
    try {
      const res = await fetch(`/api/users/${uid}`, { method: "DELETE", headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setUsers((prev) => prev.filter((u) => u._id !== uid));
      showToast("Utilisateur supprimé");
    } catch (e) { showToast(e.message || "Erreur lors de la suppression", "error"); }
  }, [headers, showToast]);

  // ── Actions véhicules ───────────────────────────────────────────────────────
  const updateVehicleStatus = useCallback(async (vid, status, reason = "") => {
    try {
      const res = await fetch(`/api/vehicles/${vid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setVehicles((prev) => prev.map((v) => (v._id || v.id) === vid ? { ...v, status } : v));
      showToast(`Annonce ${status === "approved" ? "approuvée" : "rejetée"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const deleteVehicle = useCallback(async (vid) => {
    try {
      const res = await fetch(`/api/vehicles/${vid}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error();
      setVehicles((prev) => prev.filter((v) => (v._id || v.id) !== vid));
      showToast("Annonce supprimée");
    } catch { showToast("Erreur lors de la suppression", "error"); }
  }, [headers, showToast]);

  // ── Actions chauffeurs ──────────────────────────────────────────────────────
  const updateDriverStatus = useCallback(async (did, status, reason = "") => {
    try {
      const res = await fetch(`/api/drivers/${did}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      setDrivers((prev) => prev.filter((d) => d._id !== did));
      showToast(`Chauffeur ${status === "approved" ? "approuvé" : "rejeté"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  // ── Actions commandes (admin) ───────────────────────────────────────────────
  const adminUpdateBooking = useCallback(async (bid, status, reason = "") => {
    try {
      const res = await fetch(`/api/bookings/${bid}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status, cancelReason: reason }),
      });
      if (!res.ok) throw new Error();
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status } : b));
      showToast(`Commande ${status === "cancelled" ? "annulée" : status === "confirmed" ? "confirmée" : "mise à jour"}`);
    } catch { showToast("Erreur lors de la mise à jour", "error"); }
  }, [headers, showToast]);

  const adminResolveDispute = useCallback(async (bid, resolution, note, refundClient = false) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/resolve-dispute`, {
        method: "PATCH", headers, body: JSON.stringify({ resolution, note, refundClient }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status: resolution === "compensated" ? "completed" : resolution } : b));
      showToast(`Litige résolu — ${resolution}`);
    } catch (e) { showToast(e.message || "Erreur résolution litige", "error"); }
  }, [headers, showToast]);

  const adminForceComplete = useCallback(async (bid, finalAmount, note) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/admin-force-complete`, {
        method: "PATCH", headers, body: JSON.stringify({ finalAmount, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setBookings((prev) => prev.map((b) => b._id === bid ? { ...b, status: "completed" } : b));
      showToast("Commande finalisée avec succès.");
    } catch (e) { showToast(e.message || "Erreur finalisation", "error"); }
  }, [headers, showToast]);

  const adminDeleteBooking = useCallback(async (bid) => {
    try {
      const res = await fetch(`/api/bookings/${bid}/admin-delete`, { method: "DELETE", headers });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setBookings((prev) => prev.filter((b) => b._id !== bid));
      showToast("Commande supprimée.");
    } catch (e) { showToast(e.message || "Erreur suppression", "error"); }
  }, [headers, showToast]);

  const exportBookings = useCallback((fmt = "csv") => {
    const params = new URLSearchParams({ format: fmt });
    if (bkStatus !== "all") params.set("status", bkStatus);
    if (bkSearch.trim()) params.set("search", bkSearch.trim());
    window.open(`/api/bookings/admin/export?${params}&_t=${token}`, "_blank");
  }, [bkStatus, bkSearch, token]);

  // ── Broadcast notification ─────────────────────────────────────────────────
  const sendBroadcast = useCallback(async () => {
    if (!broadcastForm.titre || !broadcastForm.message) {
      showToast("Titre et message requis", "error"); return;
    }
    setBroadcastSending(true);
    try {
      const res = await fetch("/api/notifications/admin/broadcast", {
        method: "POST", headers, body: JSON.stringify(broadcastForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      showToast(d.message || "Notification envoyée");
      setBroadcastModal(false);
      setBroadcastForm({ titre: "", message: "", targetRole: "all", lien: "" });
    } catch (e) { showToast(e.message || "Erreur envoi", "error"); }
    finally { setBroadcastSending(false); }
  }, [broadcastForm, headers, showToast]);

  // ── Filtres & pagination ────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let r = users;
    if (userRole !== "all") r = r.filter((u) => u.role === userRole);
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      r = r.filter((u) =>
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [users, userRole, userSearch]);

  const filteredVehicles = useMemo(() =>
    vehStatus === "all" ? vehicles : vehicles.filter((v) => v.status === vehStatus),
    [vehicles, vehStatus]
  );

  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (bkStatus !== "all") list = list.filter((b) => b.status === bkStatus);
    if (bkType   !== "all") list = list.filter((b) => b.type   === bkType);
    if (bkSearch.trim()) {
      const q = bkSearch.toLowerCase();
      list = list.filter((b) =>
        (b.reference || "").toLowerCase().includes(q) ||
        (b.clientInfo?.firstName || "").toLowerCase().includes(q) ||
        (b.clientInfo?.lastName  || "").toLowerCase().includes(q) ||
        (b.clientInfo?.email     || "").toLowerCase().includes(q) ||
        (b.clientInfo?.phone     || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [bookings, bkStatus, bkType, bkSearch]);

  const paginate = (arr, page) => arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = (arr) => Math.ceil(arr.length / PAGE_SIZE) || 1;

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!isAuthenticated || user?.role !== "admin") return null;

  // ── Revenue chart data ──────────────────────────────────────────────────────
  const revByMonth = stats?.revenue?.byMonth || [];
  const maxRev     = Math.max(...revByMonth.map((m) => m.total), 1);

  // ── NAV_GROUPS (défini dans le rendu pour accès au state) ──────────────────
  const pendingVeh = vehicles.filter((v) => v.status === "pending").length;
  const pendingBk  = bookings.filter((b) => b.status === "pending").length;
  const disputedBk = bookings.filter((b) => b.status === "disputed").length;
  const pendingKyc  = kycList.filter((u) => u.kycStatus === "EN_ATTENTE" || u.kycStatus === "A_REVOIR_MANUELLEMENT").length;
  const pendingCert = certList.filter((c) => ["level1","level2","level3","level4","level5","level6","level7"].some((l) => c[l]?.status === "submitted")).length;
  const pendingImp = importerProfiles.filter((p) => p.status === "pending").length;
  const pendingInv = invoices.filter((i) => i.status === "pending").length;
  const pendingIe  = ieRequests.filter((r) => r.status === "pending").length;
  const pendingSupport = supportChats.filter((c) => c.needsReply).length;
  const pendingPv       = pvList.filter((p) => p.status === "en_attente" || p.status === "en_cours").length;
  const foundingPending = foundingList.filter((o) => ["soumis", "en_review"].includes(o.status)).length;

  const NAV_GROUPS = [
    {
      label: "TABLEAU DE BORD",
      items: [
        { key: "dashboard",  icon: "📊", label: "Vue d'ensemble" },
        { key: "analytics",  icon: "📈", label: "Analytics", wip: true },
      ],
    },
    {
      label: "UTILISATEURS & CONFORMITÉ",
      items: [
        { key: "users",         icon: "👥", label: `Comptes (${users.length})` },
        { key: "kyc",           icon: "🛡️", label: "KYC / Identités",         badge: pendingKyc },
        { key: "certification", icon: "🏆", label: "Certifications",           badge: pendingCert },
      ],
    },
    {
      label: "CATALOGUE",
      items: [
        { key: "catalogue", icon: "🚗", label: "Annonces & Validations", badge: pendingVeh + drivers.length },
      ],
    },
    {
      label: "MARKETING & CMS",
      items: [
        { key: "marketing", icon: "🎨", label: "Contenu & Mise en avant" },
      ],
    },
    {
      label: "SERVICES",
      items: [
        { key: "bookings",      icon: "📋", label: "Réservations",          badge: pendingBk },
        { key: "litiges",       icon: "⚖️",  label: "Litiges",              badge: disputedBk },
        { key: "chauffeurs",    icon: "👨‍✈️", label: "Chauffeurs",           badge: drivers.length },
        { key: "import_export", icon: "🌍", label: "Transactions I/E",      badge: pendingIe },
        { key: "exportateurs",  icon: "📦", label: "Partenaires Export",    badge: pendingImp },
        { key: "transport",     icon: "🚢", label: "Transport Intl.",        wip: true },
        { key: "financement",   icon: "🏦", label: "Financement",           wip: true },
        { key: "assurance",     icon: "🔒", label: "Assurance",             wip: true },
      ],
    },
    {
      label: "PARTENAIRES",
      items: [
        { key: "partner_verif",    icon: "🔍", label: "Vérification Partenaires", badge: pendingPv },
        { key: "pms_partners",     icon: "🏪", label: "Partner Hub PMS",          badge: pmsShowrooms.filter(s => !s.isPublished).length || undefined },
        { key: "founding_partners",icon: "🌟", label: "Founding Partners",        badge: foundingPending || undefined },
      ],
    },
    {
      label: "FINANCE",
      items: [
        { key: "commissions", icon: "💰", label: "Commissions" },
        { key: "factures",    icon: "📄", label: "Factures",          badge: pendingInv },
        { key: "paiements",   icon: "💳", label: "Paiements",         wip: true },
        { key: "escrow",      icon: "🔐", label: "Escrow / Séquestre", wip: true },
      ],
    },
    {
      label: "COMMUNICATION",
      items: [
        { key: "notifications", icon: "🔔", label: "Notifications & Broadcast" },
        { key: "ads",           icon: "📢", label: "Publicités & Campagnes",   wip: true },
        { key: "support",       icon: "🎧", label: "Support Client",           badge: pendingSupport || undefined },
      ],
    },
    {
      label: "SYSTÈME",
      items: [
        { key: "roles", icon: "🔑", label: "Rôles & Permissions", wip: true },
        { key: "audit", icon: "📜", label: "Audit Logs",           wip: true },
      ],
    },
  ];

  // Titre de l'onglet actif
  const activeLabel = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.label || "Dashboard";

  return (
    <div className={styles.erp}>

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          danger={confirm.danger}
          onConfirm={() => { confirm.action(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── Booking action modal ── */}
      {bkActionModal && (
        <div className={styles.overlay} onClick={() => setBkActionModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>
              {bkActionModal.action === "cancelled" ? `Annuler la commande de « ${bkActionModal.name} » ?` : `Confirmer la commande de « ${bkActionModal.name} » ?`}
            </p>
            {bkActionModal.action === "cancelled" && (
              <textarea
                style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.75rem", resize: "vertical" }}
                rows={2} placeholder="Raison de l'annulation (optionnelle)..."
                value={bkCancelReason} onChange={(e) => setBkCancelReason(e.target.value)}
              />
            )}
            <div className={styles.confirmActions}>
              <button className={bkActionModal.action === "cancelled" ? styles.btnDanger : styles.btnPrimary} onClick={() => {
                adminUpdateBooking(bkActionModal.id, bkActionModal.action, bkCancelReason);
                setBkActionModal(null); setBkCancelReason("");
              }}>Confirmer</button>
              <button className={styles.btnGhost} onClick={() => { setBkActionModal(null); setBkCancelReason(""); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal résolution litige ── */}
      {disputeModal && (
        <div className={styles.overlay} onClick={() => setDisputeModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth:500, width:"95%" }} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>⚖️ Résoudre le litige — {disputeModal.booking.reference}</p>
            <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:12 }}>
              Client : <strong>{disputeModal.booking.clientInfo?.firstName} {disputeModal.booking.clientInfo?.lastName}</strong><br/>
              Raison : {disputeModal.booking.clientValidation?.disputeReason || "Non précisée"}
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Décision :</label>
              <select value={disputeResol} onChange={e=>setDisputeResol(e.target.value)}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".9rem" }}>
                <option value="completed">✅ Valider — service effectué (marquer terminé)</option>
                <option value="compensated">💰 Compensation — service partiel (terminé + remboursement partiel)</option>
                <option value="cancelled">❌ Annuler — service non conforme</option>
              </select>
              <textarea rows={3} placeholder="Note administrative (visible dans les logs)..."
                value={disputeNote} onChange={e=>setDisputeNote(e.target.value)}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".85rem", resize:"vertical" }} />
            </div>
            <div className={styles.confirmActions}>
              <button className={disputeResol==="cancelled"?styles.btnDanger:styles.btnPrimary}
                onClick={() => { adminResolveDispute(disputeModal.booking._id, disputeResol, disputeNote); setDisputeModal(null); }}>
                ⚖️ Confirmer la résolution
              </button>
              <button className={styles.btnGhost} onClick={() => setDisputeModal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal force complétion ── */}
      {forceModal && (
        <div className={styles.overlay} onClick={() => setForceModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth:460, width:"95%" }} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>⚡ Forcer la complétion — {forceModal.booking.reference}</p>
            <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:12 }}>
              Cette action finalise la commande sans validation client. À utiliser uniquement si la commande est bloquée.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Montant final (XOF) :</label>
              <input type="number" min="0" value={forceAmount} onChange={e=>setForceAmount(e.target.value)}
                placeholder={`Montant original: ${forceModal.booking.montantTotal||0}`}
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".9rem" }} />
              <label style={{ fontSize:".85rem", fontWeight:600 }}>Motif (obligatoire) :</label>
              <textarea rows={2} placeholder="Ex: Accord verbal confirmé par partenaire le 22/06/2026..."
                value={forceNote} onChange={e=>setForceNote(e.target.value)} required
                style={{ padding:"0.5rem", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".85rem", resize:"vertical" }} />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={!forceNote.trim()}
                onClick={() => { adminForceComplete(forceModal.booking._id, Number(forceAmount)||forceModal.booking.montantTotal, forceNote); setForceModal(null); }}>
                ⚡ Finaliser la commande
              </button>
              <button className={styles.btnGhost} onClick={() => setForceModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Broadcast notification modal ── */}
      {broadcastModal && (
        <div className={styles.overlay} onClick={() => setBroadcastModal(false)}>
          <div className={styles.confirmBox} style={{ maxWidth: 480, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>📢 Envoyer une notification à tous les utilisateurs</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem" }}>
              <input style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                placeholder="Titre *" value={broadcastForm.titre}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
              <textarea style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem", resize: "vertical" }}
                rows={3} placeholder="Message *" value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              <select style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                value={broadcastForm.targetRole}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
                <option value="all">Tous les utilisateurs</option>
                <option value="client">Clients uniquement</option>
                <option value="partenaire">Partenaires uniquement</option>
                <option value="chauffeur">Chauffeurs uniquement</option>
                <option value="importateur">Importateurs (Corporate)</option>
              </select>
              <input style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.55rem 0.75rem", fontSize: "0.9rem" }}
                placeholder="Lien (ex: /catalogue) — optionnel" value={broadcastForm.lien}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={broadcastSending} onClick={sendBroadcast}>
                {broadcastSending ? "Envoi..." : "📤 Envoyer"}
              </button>
              <button className={styles.btnGhost} onClick={() => setBroadcastModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ OVERLAY MOBILE ══ */}
      {sidebarOpen && isMobile.current && (
        <div className={`${styles.sidebarOverlay} ${styles.visible}`}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ══ SIDEBAR ══ */}
      <aside className={`${styles.sidebar} ${!sidebarOpen ? styles.sidebarCollapsed : styles.sidebarOpen}`}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <span className={styles.sidebarLogoIcon}>⚙️</span>
          <span className={styles.sidebarLogoText}>VIT-AUTO ERP</span>
        </div>

        {/* Navigation groupée */}
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <span className={styles.navGroup}>{group.label}</span>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`${styles.navItem} ${activeTab === item.key ? styles.navActive : ""}`}
                onClick={() => {
                  setActiveTab(item.key);
                  if (isMobile.current) setSidebarOpen(false);
                }}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label.replace(/ \(\d+\)$/, "")}</span>
                {item.wip && <span className={styles.wipBadge}>Bientôt</span>}
                {!item.wip && item.badge > 0 && (
                  <span className={styles.navBadge}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ══ CONTENU PRINCIPAL ══ */}
      <div className={`${styles.content} ${!sidebarOpen ? styles.contentExpanded : ""}`}>

        {/* ── Topbar ── */}
        <header className={styles.topbar}>
          <button className={styles.menuBtn}
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Réduire le menu" : "Ouvrir le menu"}>
            {sidebarOpen && !isMobile.current ? "◀" : "☰"}
          </button>
          <span className={styles.topbarTitle}>
            {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === activeTab)?.icon || "⚙️"}{" "}
            {activeLabel}
          </span>
          <div className={styles.topbarRight}>
            <button
              className={styles.adminBadge}
              onClick={() => navigate("/profile")}
              title="Modifier mon profil / mot de passe"
              style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              🔐 {user.firstName} · Admin
            </button>

            {/* Bouton "Voir le site" — retour au site public */}
            <button
              onClick={() => navigate("/")}
              title="Retour au site public"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#ecfdf5", color: "#059669",
                border: "1.5px solid #a7f3d0", borderRadius: 8,
                padding: "6px 12px", fontWeight: 700, fontSize: "0.78rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              🌐 Voir le site
            </button>

            <button
              style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
              onClick={() => setBroadcastModal(true)} title="Envoyer une notification groupée"
            >
              📢 Broadcast
            </button>
            <button
              style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", color: "#0f1b3f" }}
              onClick={loadAll} title="Actualiser les données"
            >
              ↻
            </button>
            <button
              onClick={async () => { await logout(); navigate("/"); }}
              title="Déconnexion"
              style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
            >
              ⏻
            </button>
          </div>
        </header>

        {/* ── Zone de scroll ── */}
        <div className={styles.scrollZone}>

      {loading ? (
        <div className={styles.loadingBox}>
          <div className={styles.spinner} />
          <p>Chargement des données...</p>
        </div>
      ) : (

        <>
          {/* ══════════════════════ TAB MARKETING & CMS ══════════════ */}
          {activeTab === "marketing" && (
            <MarketingSection vehicles={vehicles} token={token} onRefresh={loadAll} />
          )}

          {/* ══════════════════════ TAB CATALOGUE ════════════════════ */}
          {activeTab === "catalogue" && (
            <CatalogueSection
              vehicles={vehicles} drivers={drivers} bookings={bookings}
              headers={headers} token={token}
              onRefresh={loadAll}
              showToast={showToast}
              setConfirm={setConfirm}
              rejectModal={rejectModal} setRejectModal={setRejectModal}
              rejectReason={rejectReason} setRejectReason={setRejectReason}
              driverRejectModal={driverRejectModal} setDriverRejectModal={setDriverRejectModal}
              driverRejectReason={driverRejectReason} setDriverRejectReason={setDriverRejectReason}
              updateVehicleStatus={updateVehicleStatus}
              deleteVehicle={deleteVehicle}
            />
          )}


          {/* ══════════════════════ TAB DASHBOARD ══════════════════════ */}
          {activeTab === "dashboard" && (
            <div className={styles.tabContent}>

              {/* Statistiques globales */}
              <div className={styles.statsGrid}>
                <StatCard icon="👥" label="Utilisateurs" value={stats?.users?.total || 0}
                  sub={`+${stats?.users?.newThisMonth || 0} ce mois`} color="#3b82f6" />
                <StatCard icon="🤝" label="Partenaires" value={stats?.users?.partenaires || 0}
                  sub={`${stats?.users?.admins || 0} admin(s)`} color="#10b981" />
                <StatCard icon="🚗" label="Annonces publiées" value={stats?.vehicles?.approved || 0}
                  sub={`${stats?.vehicles?.pending || 0} en attente`} color="#8b5cf6" />
                <StatCard icon="📋" label="Commandes totales" value={stats?.bookings?.total || 0}
                  sub={`+${stats?.bookings?.newThisMonth || 0} ce mois`} color="#f59e0b" />
                <StatCard icon="✅" label="Commandes terminées" value={stats?.bookings?.completed || 0}
                  sub={`${stats?.bookings?.cancelled || 0} annulées`} color="#64748b" />
                <StatCard icon="💰" label="Revenus totaux"
                  value={Number(stats?.revenue?.total || 0).toLocaleString("fr-FR") + " XOF"}
                  sub={`Ce mois : ${Number(stats?.revenue?.thisMonth || 0).toLocaleString("fr-FR")} XOF`}
                  color="#ef4444" />
                <StatCard icon="🌍" label="Import/Export"
                  value={ieRequests.length || stats?.importExport?.total || "—"}
                  sub="Demandes reçues"
                  color="#ff4d2d" />
              </div>

              {/* Alertes */}
              {(stats?.vehicles?.pending || 0) > 0 && (
                <div className={styles.alertBanner}>
                  <span>⚠️</span>
                  <span>{stats.vehicles.pending} annonce{stats.vehicles.pending > 1 ? "s" : ""} en attente de validation</span>
                  <button className={styles.alertBtn} onClick={() => setActiveTab("catalogue")}>Voir →</button>
                </div>
              )}
              {(stats?.bookings?.pending || 0) > 0 && (
                <div className={styles.alertBanner} style={{ borderColor: "#6366f1", background: "#f0f4ff" }}>
                  <span>📋</span>
                  <span>{stats.bookings.pending} commande{stats.bookings.pending > 1 ? "s" : ""} en attente de confirmation</span>
                  <button className={styles.alertBtn} onClick={() => setActiveTab("bookings")}>Voir →</button>
                </div>
              )}

              {/* Graphique revenus 6 mois */}
              {revByMonth.length > 0 && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>📈 Revenus — 6 derniers mois</h3>
                  <div className={styles.chart}>
                    {revByMonth.map((m) => (
                      <div key={`${m._id.year}-${m._id.month}`} className={styles.chartCol}>
                        <span className={styles.chartVal}>{Math.round(m.total / 1000)}k</span>
                        <div className={styles.chartBarWrap}>
                          <div className={styles.chartBar} style={{ height: `${Math.round((m.total / maxRev) * 100)}%` }} />
                        </div>
                        <span className={styles.chartLabel}>{MOIS[(m._id.month - 1)]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Répartition commandes par type */}
              {(stats?.bookings?.byType || []).length > 0 && (
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>📊 Commandes par type</h3>
                  <div className={styles.pieGrid}>
                    {stats.bookings.byType.map(({ _id, count }) => {
                      const colors = { location: "#3b82f6", essai: "#10b981", chauffeur: "#f59e0b", leasing: "#8b5cf6", import_export: "#ff4d2d" };
                      const labels = { location: "📅 Location", essai: "🔑 Essai", chauffeur: "🚘 Chauffeur", leasing: "🏦 Leasing", import_export: "🌍 Import/Export" };
                      return (
                        <div key={_id} className={styles.pieItem}>
                          <div className={styles.pieDot} style={{ background: colors[_id] || "#94a3b8" }} />
                          <span className={styles.pieLabel}>{labels[_id] || _id}</span>
                          <strong className={styles.pieCount}>{count}</strong>
                          <MiniBar value={count} max={stats.bookings.total} color={colors[_id] || "#94a3b8"} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Répartition utilisateurs */}
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>👥 Répartition des comptes</h3>
                <div className={styles.pieGrid}>
                  {[
                    { key: "clients",     label: "Clients",     count: stats?.users?.clients || 0,     color: "#3b82f6" },
                    { key: "partenaires", label: "Partenaires", count: stats?.users?.partenaires || 0, color: "#10b981" },
                    { key: "admins",      label: "Admins",      count: stats?.users?.admins || 0,      color: "#f59e0b" },
                    { key: "blocked",     label: "Bloqués",     count: stats?.users?.blocked || 0,     color: "#ef4444" },
                  ].map(({ key, label, count, color }) => (
                    <div key={key} className={styles.pieItem}>
                      <div className={styles.pieDot} style={{ background: color }} />
                      <span className={styles.pieLabel}>{label}</span>
                      <strong className={styles.pieCount}>{count}</strong>
                      <MiniBar value={count} max={stats?.users?.total || 1} color={color} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ TAB UTILISATEURS ══════════════════════ */}
          {activeTab === "users" && (
            <div className={styles.tabContent}>
              <div className={styles.filterBar}>
                <input className={styles.searchInput} placeholder="🔍 Rechercher un utilisateur..."
                  value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} />
                <select className={styles.filterSelect} value={userRole}
                  onChange={(e) => { setUserRole(e.target.value); setUserPage(1); }}>
                  <option value="all">Tous les rôles</option>
                  <option value="client">Clients</option>
                  <option value="partenaire">Partenaires</option>
                  <option value="admin">Admins</option>
                  <option value="chauffeur">Chauffeurs</option>
                </select>
                <span className={styles.filterCount}>{filteredUsers.length} résultat{filteredUsers.length !== 1 ? "s" : ""}</span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Compte</th><th>KYC</th><th>Certif.</th><th>Inscrit le</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {paginate(filteredUsers, userPage).map((u) => {
                      const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.client;
                      const isSelf = u._id === user._id;
                      const kyc    = KYC_CFG[u.kycStatus] || { label: "—", color: "#94a3b8", bg: "#f8fafc" };
                      const certif = CERTIF_CFG[u.certificationBadge];
                      return (
                        <tr key={u._id} className={`${styles.tr} ${!u.isActive ? styles.trBlocked : ""}`}>
                          <td>
                            <div className={styles.userCell}>
                              <div className={styles.avatar}>
                                {u.profilePhoto ? <img src={u.profilePhoto} alt="" /> : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                              </div>
                              <div>
                                <strong>{u.firstName} {u.lastName}</strong>
                                {isSelf && <span className={styles.selfTag}>Vous</span>}
                                {u.phone && <div style={{ fontSize:".72rem", color:"#94a3b8" }}>{u.phone}</div>}
                              </div>
                            </div>
                          </td>
                          <td className={styles.tdEmail}>{u.email}</td>
                          <td>
                            <select className={styles.roleSelect} value={u.role} disabled={isSelf}
                              onChange={(e) => setConfirm({ message: `Changer le rôle de ${u.firstName} en "${e.target.value}" ?`, action: () => changeRole(u._id, e.target.value) })}
                              style={{ color: rc.color, background: rc.bg, borderColor: rc.color + "60" }}>
                              <option value="client">Client</option>
                              <option value="partenaire">Partenaire</option>
                              <option value="admin">Admin</option>
                              <option value="chauffeur">Chauffeur</option>
                            </select>
                          </td>
                          <td>{u.isActive ? <Badge label="Actif" color="#10b981" bg="#ecfdf5" /> : <Badge label="Bloqué" color="#ef4444" bg="#fef2f2" />}</td>
                          <td><Badge label={kyc.label} color={kyc.color} bg={kyc.bg} /></td>
                          <td>{certif ? <Badge label={certif.label} color={certif.color} bg={certif.bg} /> : <span style={{ color:"#cbd5e1", fontSize:".75rem" }}>—</span>}</td>
                          <td className={styles.tdDate}>{fmtDate(u.createdAt)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              {!isSelf && (
                                <button className={u.isActive ? styles.btnBlock : styles.btnUnblock}
                                  onClick={() => setConfirm({ message: `${u.isActive ? "Bloquer" : "Débloquer"} le compte de ${u.firstName} ${u.lastName} ?`, action: () => toggleBlock(u._id) })}
                                  title={u.isActive ? "Bloquer" : "Débloquer"}>
                                  {u.isActive ? "🚫 Bloquer" : "✅ Débloquer"}
                                </button>
                              )}
                              {!isSelf && (
                                <button className={styles.btnDeleteSm}
                                  onClick={() => setConfirm({ message: `Supprimer définitivement ${u.firstName} ${u.lastName} ? Cette action est irréversible.`, danger: true, action: () => deleteUser(u._id) })}
                                  title="Supprimer">🗑️</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={userPage} total={totalPages(filteredUsers)} onChange={setUserPage} />
            </div>
          )}

          {/* ══════════════════════ TAB COMMANDES ══════════════════════ */}
          {activeTab === "bookings" && (
            <div className={styles.tabContent}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  { l:"Toutes",    v: bookings.length,                                                                              c:"#6366f1", s:"all" },
                  { l:"Nouvelles", v: bookings.filter(b=>b.status==="pending").length,                                              c:"#f59e0b", s:"pending" },
                  { l:"En cours",  v: bookings.filter(b=>["confirmed","preparing","ready","in_progress","client_arrived"].includes(b.status)).length, c:"#2563eb", s:"confirmed" },
                  { l:"À valider", v: bookings.filter(b=>b.status==="waiting_client_validation").length,                            c:"#d97706", s:"waiting_client_validation" },
                  { l:"Terminées", v: bookings.filter(b=>b.status==="completed").length,                                            c:"#059669", s:"completed" },
                  { l:"Litiges",   v: bookings.filter(b=>b.status==="disputed").length,                                             c:"#dc2626", s:"disputed" },
                  { l:"Annulées",  v: bookings.filter(b=>b.status==="cancelled").length,                                            c:"#94a3b8", s:"cancelled" },
                ].map(k => (
                  <button key={k.s} onClick={() => { setBkStatus(k.s); setBkPage(1); }}
                    style={{ background: bkStatus===k.s?k.c:"#f8fafc", color: bkStatus===k.s?"#fff":k.c, border:`2px solid ${k.c}`, borderRadius:10, padding:"8px 6px", cursor:"pointer", fontWeight:700, fontSize:"0.8rem" }}>
                    <div style={{ fontSize:"1.3rem", lineHeight:1.2 }}>{k.v}</div>
                    <div style={{ fontSize:"0.7rem", opacity:.85 }}>{k.l}</div>
                  </button>
                ))}
              </div>

              <div className={styles.filterBar} style={{ flexWrap:"wrap", gap:8 }}>
                <input type="search" placeholder="Ref., client, email, tel…" value={bkSearch}
                  onChange={e => { setBkSearch(e.target.value); setBkPage(1); }}
                  style={{ flex:1, minWidth:160, padding:"0.4rem 0.75rem", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:"0.85rem" }} />
                <select className={styles.filterSelect} value={bkType} onChange={e => { setBkType(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous types</option>
                  <option value="location">📅 Location</option>
                  <option value="essai">🔑 Essai/Vente</option>
                  <option value="chauffeur">🚘 Chauffeur</option>
                  <option value="leasing">🏦 Leasing</option>
                </select>
                <select className={styles.filterSelect} value={bkStatus} onChange={e => { setBkStatus(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous statuts</option>
                  <option value="pending">Nouvelles</option>
                  <option value="confirmed">Acceptées</option>
                  <option value="in_progress">En cours</option>
                  <option value="waiting_client_validation">À valider</option>
                  <option value="completed">Terminées</option>
                  <option value="disputed">⚠️ Litiges</option>
                  <option value="cancelled">Annulées</option>
                </select>
                <span className={styles.filterCount}>{filteredBookings.length} résultat{filteredBookings.length!==1?"s":""}</span>
                <button onClick={() => exportBookings("csv")} style={{ padding:"0.4rem 0.9rem", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:"0.8rem", fontWeight:700 }}>⬇️ CSV</button>
                <button onClick={loadAll} className={styles.btnRefresh}>↻</button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Référence</th><th>Client / KYC</th><th>Véhicule / Type</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {paginate(filteredBookings, bkPage).map((b) => {
                      const bs = STATUS_BK[b.status] || STATUS_BK.pending;
                      const typeIcons = { location:"📅", essai:"🔑", chauffeur:"🚘", leasing:"🏦" };
                      const vName = b.vehicle ? [b.vehicle.title, b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur: ${b.driver.firstName||""}` : "—");
                      const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
                      const kycColors = { VERIFIE:"#059669", EN_ATTENTE:"#d97706", REFUSE:"#dc2626", A_REVOIR_MANUELLEMENT:"#2563eb" };
                      const kycStatus = b.clientInfo?.kycStatus || b.client?.kycStatus;
                      const isDisputed = b.status === "disputed";
                      const isActive = !["completed","cancelled","disputed"].includes(b.status);
                      return (
                        <tr key={b._id} className={styles.tr} style={isDisputed ? { background:"#fff5f5" } : {}}>
                          <td>
                            <div>
                              <strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference || b._id?.slice(-6)}</strong>
                              {isDisputed && <span style={{ display:"block", fontSize:"0.7rem", color:"#dc2626", fontWeight:700 }}>⚠️ LITIGE</span>}
                            </div>
                          </td>
                          <td>
                            <div>
                              <strong style={{ fontSize:"0.82rem" }}>{clientName || "—"}</strong>
                              <span className={styles.vehMeta}>{b.clientInfo?.email}</span>
                              {kycStatus && (
                                <span style={{ display:"inline-block", fontSize:"0.65rem", fontWeight:700, padding:"1px 6px", borderRadius:99, background: kycStatus==="VERIFIE"?"#d1fae5":"#fef3c7", color: kycColors[kycStatus]||"#d97706", marginTop:2 }}>
                                  {kycStatus==="VERIFIE"?"✅ KYC":kycStatus==="REFUSE"?"❌ KYC":"⏳ KYC"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div>
                              <span className={styles.vehName}>{vName}</span>
                              <Badge label={`${typeIcons[b.type]||""} ${b.type||"—"}`} color="#64748b" bg="#f1f5f9" />
                            </div>
                          </td>
                          <td className={styles.tdPrice}>
                            {b.montantTotal > 0 ? `${Number(b.montantTotal).toLocaleString("fr-FR")} XOF` : "—"}
                            {b.commissionAmount > 0 && <span style={{ display:"block", fontSize:"0.68rem", color:"#dc2626" }}>Com: {Number(b.commissionAmount).toLocaleString("fr-FR")}</span>}
                          </td>
                          <td><Badge label={bs.label} color={bs.color} bg={bs.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                          <td>
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                              <a href={`/api/bookings/${b._id}/receipt`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize:"0.7rem", padding:"2px 6px", background:"#f1f5f9", color:"#0f1b3f", borderRadius:6, textDecoration:"none" }} title="Reçu PDF">🧾</a>
                              {b.status === "pending" && (
                                <button className={styles.btnApprove} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                                  onClick={() => setBkActionModal({ id:b._id, name:clientName, action:"confirmed" })} title="Confirmer">✅</button>
                              )}
                              {isActive && b.status !== "pending" && (
                                <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#e0f2fe", color:"#0369a1", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                                  onClick={() => { setForceModal({ booking:b }); setForceAmount(b.montantTotal||""); setForceNote(""); }}
                                  title="Forcer complétion">⚡</button>
                              )}
                              {isDisputed && (
                                <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                                  onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}
                                  title="Résoudre litige">⚖️</button>
                              )}
                              {!["cancelled","completed"].includes(b.status) && (
                                <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                                  onClick={() => { setBkActionModal({ id:b._id, name:clientName, action:"cancelled" }); setBkCancelReason(""); }}
                                  title="Annuler">✕</button>
                              )}
                              {b.status === "cancelled" && (
                                <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", opacity:.7 }}
                                  onClick={() => setConfirm({ message:`Supprimer définitivement la commande ${b.reference||""}?`, danger:true, action:()=>adminDeleteBooking(b._id) })}
                                  title="Supprimer">🗑️</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={bkPage} total={totalPages(filteredBookings)} onChange={setBkPage} />
            </div>
          )}

          {/* ══════════════════════ TAB EXPORTATEURS ══════════════════════ */}
          {activeTab === "exportateurs" && (
            <div className={styles.tabContent}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
                  📦 Partenaires Exportateurs — Dossiers & Annonces d'Export
                </h2>
                <button className={styles.btnRefresh} onClick={loadImporters}>↻ Actualiser</button>
              </div>

              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
                {[
                  { icon: "📦", label: "Total exportateurs",  value: importerProfiles.length, color: "#6366f1" },
                  { icon: "⏳", label: "En attente",          value: importerProfiles.filter(p => p.status === "pending").length,  color: "#f59e0b" },
                  { icon: "✅", label: "Vérifiés",            value: importerProfiles.filter(p => p.status === "verified").length, color: "#10b981" },
                  { icon: "❌", label: "Refusés",             value: importerProfiles.filter(p => p.status === "rejected").length, color: "#ef4444" },
                  { icon: "🌍", label: "Annonces export att.", value: importerListings.filter(l => l.status === "pending").length, color: "#f59e0b" },
                ].map((k) => (
                  <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />
                ))}
              </div>

              {/* ── SECTION 1 : Candidatures ── */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>📦 Dossiers partenaires exportateurs</h3>
                  <select
                    className={styles.filterSelect}
                    value={importerFilter}
                    onChange={(e) => setImporterFilter(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
                  >
                    <option value="pending">En attente</option>
                    <option value="verified">Vérifiés</option>
                    <option value="rejected">Refusés</option>
                    <option value="suspended">Suspendus</option>
                  </select>
                </div>

                {importerLoading ? (
                  <div className={styles.loadingBox} style={{ minHeight: 100 }}>
                    <div className={styles.spinner} /><p>Chargement...</p>
                  </div>
                ) : importerProfiles.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>🏅</div>
                    <p style={{ margin: 0 }}>Aucune candidature pour ce filtre.</p>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Partenaire</th>
                          <th>Entreprise</th>
                          <th>RCCM / NIF</th>
                          <th>Activités</th>
                          <th>Statut</th>
                          <th>Soumis le</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importerProfiles.map((p) => {
                          const stCfg = {
                            pending:   { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
                            verified:  { label: "Vérifié",    color: "#10b981", bg: "#ecfdf5" },
                            rejected:  { label: "Refusé",     color: "#ef4444", bg: "#fef2f2" },
                            suspended: { label: "Suspendu",   color: "#ef4444", bg: "#fef2f2" },
                          }[p.status] || { label: p.status, color: "#94a3b8", bg: "#f8fafc" };
                          const u = p.userId;
                          return (
                            <tr key={p._id} className={styles.tr}>
                              <td>
                                <strong>{u?.firstName} {u?.lastName}</strong>
                                <span className={styles.vehMeta}>{u?.email}</span>
                              </td>
                              <td>
                                <strong style={{ fontSize: ".85rem" }}>{p.companyName}</strong>
                                <span className={styles.vehMeta}>{p.city}, {p.country}</span>
                              </td>
                              <td style={{ fontSize: ".82rem" }}>
                                <div>RCCM: {p.rccm || "—"}</div>
                                <div>NIF: {p.taxId || "—"}</div>
                              </td>
                              <td style={{ fontSize: ".8rem", color: "#475569" }}>
                                {(p.activityType || []).join(", ") || "—"}
                              </td>
                              <td>
                                <Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} />
                                {p.badgeLevel && p.badgeLevel !== "none" && (
                                  <span style={{ marginLeft: 4, fontSize: ".75rem" }}>
                                    {p.badgeLevel === "silver" ? "🥈" : p.badgeLevel === "gold" ? "🥇" : "💎"}
                                  </span>
                                )}
                              </td>
                              <td className={styles.tdDate}>{fmtDate(p.submittedAt)}</td>
                              <td>
                                <div className={styles.actionBtns}>
                                  {/* Visualiser le dossier complet */}
                                  <button
                                    title="Voir le dossier complet"
                                    onClick={() => setExporterDetail(p)}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1.5px solid #bfdbfe", borderRadius: 6, cursor: "pointer" }}>
                                    👁 Visualiser
                                  </button>
                                  {/* Approuver / refuser */}
                                  {p.status !== "verified" && (
                                    <button className={styles.btnApprove}
                                      onClick={() => { setReviewModal(p); setReviewDecision({ status: "verified", rejectionReason: "", badgeLevel: "silver" }); }}>
                                      ✅ Valider
                                    </button>
                                  )}
                                  {p.status !== "rejected" && (
                                    <button className={styles.btnReject}
                                      onClick={() => { setReviewModal(p); setReviewDecision({ status: "rejected", rejectionReason: "", badgeLevel: "none" }); }}>
                                      ✕ Rejeter
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── SECTION 2 : Annonces import/export ── */}
              <div className={styles.chartCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>📢 Annonces Import/Export</h3>
                  <select
                    value={listingFilter}
                    onChange={(e) => setListingFilter(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
                  >
                    <option value="pending">En attente</option>
                    <option value="approved">Publiées</option>
                    <option value="rejected">Refusées</option>
                  </select>
                </div>
                {importerLoading ? (
                  <div className={styles.loadingBox} style={{ minHeight: 80 }}><div className={styles.spinner} /></div>
                ) : importerListings.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
                    <p style={{ margin: 0 }}>Aucune annonce pour ce filtre.</p>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Annonce</th>
                          <th>Partenaire</th>
                          <th>Source</th>
                          <th>Prix</th>
                          <th>Statut</th>
                          <th>Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importerListings.map((l) => {
                          const stCfg = {
                            pending:  { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
                            approved: { label: "Publiée",    color: "#10b981", bg: "#ecfdf5" },
                            rejected: { label: "Refusée",    color: "#ef4444", bg: "#fef2f2" },
                          }[l.status] || { label: l.status, color: "#94a3b8", bg: "#f8fafc" };
                          return (
                            <tr key={l._id} className={styles.tr}>
                              <td>
                                <strong style={{ fontSize: ".85rem" }}>{l.title}</strong>
                                <span className={styles.vehMeta}>{l.make} {l.model} {l.year} · {l.condition}</span>
                              </td>
                              <td style={{ fontSize: ".82rem" }}>
                                {l.partner?.firstName} {l.partner?.lastName}
                                <span className={styles.vehMeta}>{l.importerProfile?.companyName}</span>
                              </td>
                              <td style={{ fontSize: ".82rem" }}>{l.sourceCountry}</td>
                              <td className={styles.tdPrice}>
                                {l.price ? `${Number(l.price).toLocaleString("fr-FR")} ${l.currency}` : "—"}
                              </td>
                              <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                              <td className={styles.tdDate}>{fmtDate(l.createdAt)}</td>
                              <td>
                                <div className={styles.actionBtns}>
                                  {l.status === "pending" && (
                                    <>
                                      <button className={styles.btnApprove}
                                        onClick={async () => {
                                          const r = await fetch(`/api/import-export/listings/${l._id}/status`, {
                                            method: "PATCH", headers,
                                            body: JSON.stringify({ status: "approved" }),
                                          });
                                          if (r.ok) { showToast("Annonce publiée !"); loadImporters(); }
                                          else showToast("Erreur lors de la publication.", "error");
                                        }}>✅ Publier</button>
                                      <button className={styles.btnReject}
                                        onClick={() => { setListingRejectModal(l); setListingRejectNote(""); }}>
                                        ✕ Refuser</button>
                                    </>
                                  )}
                                  {l.status === "approved" && (
                                    <button className={styles.btnReject}
                                      onClick={async () => {
                                        const r = await fetch(`/api/import-export/listings/${l._id}/status`, {
                                          method: "PATCH", headers,
                                          body: JSON.stringify({ status: "archived" }),
                                        });
                                        if (r.ok) { showToast("Annonce archivée."); loadImporters(); }
                                        else showToast("Erreur lors de l'archivage.", "error");
                                      }}>Archiver</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Modal review candidature importateur ── */}
          {reviewModal && (
            <div className={styles.overlay} onClick={() => setReviewModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <h3 style={{ margin: "0 0 16px", color: "#0f1b3f", fontSize: "1rem" }}>
                  {reviewDecision.status === "verified" ? "✅ Valider le profil importateur" : "❌ Refuser la candidature"}
                </h3>
                <p style={{ fontSize: ".85rem", color: "#475569", margin: "0 0 14px" }}>
                  <strong>{reviewModal.companyName}</strong> — {reviewModal.userId?.firstName} {reviewModal.userId?.lastName}
                </p>
                {reviewDecision.status === "verified" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Niveau de badge</label>
                    <select
                      value={reviewDecision.badgeLevel}
                      onChange={(e) => setReviewDecision((d) => ({ ...d, badgeLevel: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }}
                    >
                      <option value="silver">🥈 Silver</option>
                      <option value="gold">🥇 Gold</option>
                      <option value="platinum">💎 Platinum</option>
                    </select>
                  </div>
                )}
                {reviewDecision.status === "rejected" && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Motif du refus *</label>
                    <textarea
                      rows={3}
                      value={reviewDecision.rejectionReason}
                      onChange={(e) => setReviewDecision((d) => ({ ...d, rejectionReason: e.target.value }))}
                      placeholder="Documents manquants, informations incorrectes..."
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem", fontFamily: "inherit", resize: "vertical" }}
                    />
                  </div>
                )}
                <div className={styles.confirmActions}>
                  <button
                    className={reviewDecision.status === "verified" ? styles.btnApprove : styles.btnDanger}
                    onClick={async () => {
                      const r = await fetch(`/api/import-export/importer-profiles/${reviewModal._id}/review`, {
                        method: "PATCH", headers,
                        body: JSON.stringify(reviewDecision),
                      });
                      if (r.ok) {
                        showToast(reviewDecision.status === "verified" ? "Profil validé !" : "Profil refusé.", reviewDecision.status === "rejected" ? "error" : "success");
                        setReviewModal(null);
                        loadImporters();
                      } else {
                        const d = await r.json().catch(() => ({}));
                        showToast(d.message || "Erreur lors de la mise à jour.", "error");
                      }
                    }}
                  >
                    Confirmer
                  </button>
                  <button className={styles.btnGhost} onClick={() => setReviewModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal refus annonce listing ── */}
          {listingRejectModal && (
            <div className={styles.overlay} onClick={() => setListingRejectModal(null)}>
              <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <h3 style={{ margin: "0 0 12px", color: "#0f1b3f", fontSize: "1rem" }}>✕ Refuser l'annonce</h3>
                <p style={{ fontSize: ".85rem", color: "#475569", margin: "0 0 12px" }}>
                  <strong>{listingRejectModal.title}</strong>
                </p>
                <label style={{ fontSize: ".82rem", fontWeight: 700, color: "#334155", display: "block", marginBottom: 6 }}>Motif (optionnel)</label>
                <textarea
                  rows={3}
                  value={listingRejectNote}
                  onChange={(e) => setListingRejectNote(e.target.value)}
                  placeholder="Photos insuffisantes, prix incorrect..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: ".88rem", fontFamily: "inherit", resize: "vertical", marginBottom: 14 }}
                />
                <div className={styles.confirmActions}>
                  <button className={styles.btnDanger}
                    onClick={async () => {
                      const r = await fetch(`/api/import-export/listings/${listingRejectModal._id}/status`, {
                        method: "PATCH", headers,
                        body: JSON.stringify({ status: "rejected", adminNote: listingRejectNote }),
                      });
                      if (r.ok) {
                        showToast("Annonce refusée.", "error");
                        setListingRejectModal(null);
                        loadImporters();
                      } else {
                        const d = await r.json().catch(() => ({}));
                        showToast(d.message || "Erreur lors du refus.", "error");
                      }
                    }}>Confirmer le refus</button>
                  <button className={styles.btnGhost} onClick={() => setListingRejectModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* ══ MODAL DOSSIER EXPORTATEUR ══ */}
          {exporterDetail && (() => {
            const p = exporterDetail;
            const u = p.userId || {};
            const BADGE_CFG = {
              none:     null,
              silver:   { icon: "🥈", label: "Silver",   color: "#64748b", bg: "#f1f5f9" },
              gold:     { icon: "🥇", label: "Gold",     color: "#d97706", bg: "#fffbeb" },
              platinum: { icon: "💎", label: "Platinum", color: "#6d28d9", bg: "#ede9fe" },
            };
            const STATUS_CFG = {
              pending:       { label: "En attente",    color: "#d97706", bg: "#fef3c7" },
              verified:      { label: "Vérifié",       color: "#059669", bg: "#dcfce7" },
              rejected:      { label: "Refusé",        color: "#dc2626", bg: "#fee2e2" },
              suspended:     { label: "Suspendu",      color: "#dc2626", bg: "#fee2e2" },
              not_submitted: { label: "Non soumis",    color: "#94a3b8", bg: "#f8fafc" },
            };
            const stCfg   = STATUS_CFG[p.status]      || STATUS_CFG.not_submitted;
            const badgeCfg = BADGE_CFG[p.badgeLevel]  || null;
            const ACTIVITY_LABELS = { import: "Import", export: "Export", transit: "Transit", courtage: "Courtage", pieces_detachees: "Pièces détachées" };
            const DOC_KEYS = [
              { key: "rccmImage",    label: "Registre du Commerce (RCCM)" },
              { key: "taxIdImage",   label: "Identifiant Fiscal (NIF)" },
              { key: "licenseImage", label: "Agrément importateur/exportateur" },
              { key: "companyLogo",  label: "Logo de l'entreprise" },
              { key: "bankStatement",label: "Relevé bancaire" },
              { key: "otherDoc",     label: "Autre document" },
            ];
            const hasDoc = DOC_KEYS.some(({ key }) => !!p.documents?.[key]);

            const Row = ({ label, value }) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: ".71rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
                <span style={{ fontSize: ".88rem", color: "#0f1b3f", fontWeight: 600 }}>{value || "—"}</span>
              </div>
            );

            return (
              <div className={styles.overlay} onClick={() => setExporterDetail(null)}
                style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
                <div onClick={(e) => e.stopPropagation()}
                  style={{ background: "#fff", borderRadius: 16, width: "min(960px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>

                  {/* ── Header ── */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0, background: "#f8fafc" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {p.documents?.companyLogo ? (
                        <img src={p.documents.companyLogo} alt="logo"
                          style={{ width: 52, height: 52, borderRadius: 10, objectFit: "contain", border: "1.5px solid #e2e8f0", background: "#fff", padding: 4 }}
                          onError={(e) => { e.target.style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>📦</div>
                      )}
                      <div>
                        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>{p.companyName}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ background: stCfg.bg, color: stCfg.color, padding: "2px 12px", borderRadius: 99, fontWeight: 800, fontSize: ".76rem" }}>{stCfg.label}</span>
                          {badgeCfg && <span style={{ background: badgeCfg.bg, color: badgeCfg.color, padding: "2px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".76rem" }}>{badgeCfg.icon} {badgeCfg.label}</span>}
                          <span style={{ fontSize: ".75rem", color: "#94a3b8" }}>ID : {p._id}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setExporterDetail(null)}
                      style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                  </div>

                  {/* ── Body scrollable ── */}
                  <div style={{ overflowY: "auto", padding: "20px 24px 28px", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Actions rapides */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {p.status !== "verified" && (
                        <button className={styles.btnApprove}
                          onClick={() => { setExporterDetail(null); setReviewModal(p); setReviewDecision({ status: "verified", rejectionReason: "", badgeLevel: "silver" }); }}>
                          ✅ Valider le dossier
                        </button>
                      )}
                      {p.status !== "rejected" && (
                        <button className={styles.btnReject}
                          onClick={() => { setExporterDetail(null); setReviewModal(p); setReviewDecision({ status: "rejected", rejectionReason: "", badgeLevel: "none" }); }}>
                          ✕ Refuser le dossier
                        </button>
                      )}
                      {p.status === "verified" && p.status !== "suspended" && (
                        <button
                          onClick={async () => {
                            const r = await fetch(`/api/import-export/importer-profiles/${p._id}/review`, { method: "PATCH", headers, body: JSON.stringify({ status: "suspended" }) });
                            if (r.ok) { showToast("Dossier suspendu.", "error"); setExporterDetail(null); loadImporters(); }
                            else showToast("Erreur lors de la suspension.", "error");
                          }}
                          style={{ padding: "7px 16px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontWeight: 700, fontSize: ".82rem", cursor: "pointer" }}>
                          ⏸ Suspendre
                        </button>
                      )}
                    </div>

                    {/* Grille principale : partenaire + entreprise */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* Infos partenaire (utilisateur) */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>👤 Informations partenaire</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {u.profilePhoto ? (
                            <img src={u.profilePhoto} alt="" style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
                              {(u.firstName?.[0] || "?").toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, color: "#0f1b3f" }}>{u.firstName} {u.lastName}</div>
                            <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>{u.role || "partenaire"}</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Email" value={u.email} />
                          <Row label="Téléphone" value={u.phone} />
                          <Row label="Statut compte" value={u.isActive === false ? "🚫 Bloqué" : "✅ Actif"} />
                          <Row label="Dossier soumis le" value={fmtDate(p.submittedAt)} />
                        </div>
                      </div>

                      {/* Infos entreprise */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🏢 Informations entreprise</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Raison sociale" value={p.companyName} />
                          <Row label="RCCM" value={p.rccm} />
                          <Row label="NIF / Identifiant fiscal" value={p.taxId} />
                          <Row label="Agrément" value={p.operatingLicense} />
                          <Row label="Adresse" value={p.address} />
                          <Row label="Ville" value={p.city} />
                          <Row label="Pays" value={p.country} />
                          <Row label="Site web" value={p.website ? <a href={safeHref(p.website)} target="_blank" rel="noreferrer noopener" style={{ color: "#2563eb" }}>{p.website}</a> : "—"} />
                        </div>
                      </div>
                    </div>

                    {/* Activités & portée */}
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🌍 Activités & portée</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Types d'activité</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.activityType || []).length > 0
                              ? (p.activityType).map((a) => (
                                <span key={a} style={{ background: "#e0e7ff", color: "#3730a3", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>
                                  {ACTIVITY_LABELS[a] || a}
                                </span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Pays d'opération</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.operatingCountries || []).length > 0
                              ? p.operatingCountries.map((c) => (
                                <span key={c} style={{ background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>{c}</span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Catégories de véhicules</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(p.vehicleCategories || []).length > 0
                              ? p.vehicleCategories.map((c) => (
                                <span key={c} style={{ background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: 99, fontSize: ".78rem", fontWeight: 700 }}>{c}</span>
                              ))
                              : <span style={{ color: "#94a3b8", fontSize: ".82rem" }}>—</span>
                            }
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <Row label="Volume annuel" value={p.annualVolume} />
                          <Row label="Années d'expérience" value={p.yearsExperience != null ? `${p.yearsExperience} an${p.yearsExperience > 1 ? "s" : ""}` : "—"} />
                        </div>
                      </div>
                    </div>

                    {/* Références & description */}
                    {(p.references || p.description) && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                        <h3 style={{ margin: 0, fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>📝 Présentation & références</h3>
                        {p.description && (
                          <div>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Description</div>
                            <p style={{ margin: 0, fontSize: ".88rem", color: "#334155", lineHeight: 1.6 }}>{p.description}</p>
                          </div>
                        )}
                        {p.references && (
                          <div>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Références / Clients notables</div>
                            <p style={{ margin: 0, fontSize: ".88rem", color: "#334155", lineHeight: 1.6 }}>{p.references}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Documents */}
                    {hasDoc && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>📁 Documents fournis</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12 }}>
                          {DOC_KEYS.map(({ key, label }) => p.documents?.[key] ? (
                            <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                              <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#64748b", padding: "5px 10px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                              <a href={safeImgHref(p.documents[key])} target="_blank" rel="noreferrer noopener">
                                <img src={p.documents[key]} alt={label}
                                  style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                                  onError={(e) => { e.target.parentElement.innerHTML = `<div style="height:110px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.8rem;padding:8px;text-align:center">Aperçu indisponible</div>`; }} />
                              </a>
                              <div style={{ padding: "6px 10px" }}>
                                <a href={safeImgHref(p.documents[key])} target="_blank" rel="noreferrer noopener" style={{ fontSize: ".75rem", color: "#2563eb", textDecoration: "underline" }}>
                                  Voir en plein écran ↗
                                </a>
                              </div>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}

                    {/* Statut de vérification */}
                    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                      <h3 style={{ margin: "0 0 14px", fontSize: ".88rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🔍 Statut de vérification</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12 }}>
                        <Row label="Statut actuel" value={<span style={{ color: stCfg.color, fontWeight: 800 }}>{stCfg.label}</span>} />
                        <Row label="Badge attribué" value={badgeCfg ? `${badgeCfg.icon} ${badgeCfg.label}` : "Aucun"} />
                        <Row label="Soumis le" value={fmtDate(p.submittedAt)} />
                        <Row label="Examiné le" value={fmtDate(p.reviewedAt)} />
                        {p.reviewedBy && <Row label="Examiné par" value={`${p.reviewedBy.firstName || ""} ${p.reviewedBy.lastName || ""}`} />}
                      </div>
                      {p.rejectionReason && (
                        <div style={{ marginTop: 14, background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", marginBottom: 4 }}>Motif du refus</div>
                          <p style={{ margin: 0, fontSize: ".88rem", color: "#991b1b" }}>{p.rejectionReason}</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          TAB COMMISSIONS
      ══════════════════════════════════════════════════ */}
      {activeTab === "commissions" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              💰 Commissions VIT-AUTO
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="number"
                value={invoiceYear}
                onChange={(e) => setInvoiceYear(Number(e.target.value))}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", width: 90, fontSize: "0.85rem" }}
                placeholder="Année"
              />
              <select
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: "0.85rem" }}
              >
                <option value="">Tous les mois</option>
                {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <button className={styles.btnRefresh} onClick={loadCommissions}>Filtrer</button>
            </div>
          </div>

          {/* KPIs */}
          {commissionsStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
              <StatCard icon="📊" label="Transactions terminées" value={commissionsStats.count} color="#6366f1" />
              <StatCard icon="💵" label="Montant total transactions" value={`${Number(commissionsStats.transactions || 0).toLocaleString("fr-FR")} XOF`} color="#0ea5e9" />
              <StatCard icon="💰" label="Commissions générées" value={`${Number(commissionsStats.total || 0).toLocaleString("fr-FR")} XOF`} color="#10b981" />
            </div>
          )}

          {commissions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>💳</div>
              <p>Aucune commission pour cette période.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Montant transaction</th>
                    <th>Taux commission</th>
                    <th>Commission VIT-AUTO</th>
                    <th>Date</th>
                    <th>Facturé</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((b) => (
                    <tr key={b._id}>
                      <td style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.83rem" }}>{b.reference || "—"}</td>
                      <td><Badge label={b.type} color="#6366f1" bg="#f5f3ff" /></td>
                      <td style={{ fontSize: "0.83rem" }}>{b.clientInfo?.firstName} {b.clientInfo?.lastName}</td>
                      <td style={{ fontWeight: 700 }}>
                        {Number(b.transaction?.finalAmount || b.montantTotal || 0).toLocaleString("fr-FR")} {b.devise || "XOF"}
                      </td>
                      <td style={{ color: "#6366f1", fontWeight: 700 }}>
                        {Math.round((b.commissionRate || 0) * 100)} %
                      </td>
                      <td style={{ fontWeight: 800, color: "#10b981" }}>
                        {Number(b.commissionAmount || 0).toLocaleString("fr-FR")} {b.devise || "XOF"}
                      </td>
                      <td style={{ fontSize: "0.83rem" }}>
                        {b.paidAt ? new Date(b.paidAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td>
                        {b.invoiced
                          ? <Badge label="Facturé" color="#10b981" bg="#dcfce7" />
                          : <Badge label="Non facturé" color="#f59e0b" bg="#fef3c7" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB FACTURES
      ══════════════════════════════════════════════════ */}
      {activeTab === "factures" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
              📄 Gestion des factures partenaires
            </h2>
            <button className={styles.btnRefresh} onClick={loadInvoices}>↻ Actualiser</button>
          </div>

          {/* Génération facture */}
          <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
            <h3 className={styles.chartTitle}>🔧 Générer les factures du mois</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Mois</label>
                <select
                  value={generateForm.month}
                  onChange={(e) => setGenerateForm((p) => ({ ...p, month: Number(e.target.value) }))}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: "0.85rem" }}
                >
                  {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Année</label>
                <input
                  type="number"
                  value={generateForm.year}
                  onChange={(e) => setGenerateForm((p) => ({ ...p, year: Number(e.target.value) }))}
                  style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", width: 100, fontSize: "0.85rem" }}
                />
              </div>
              <button
                className={styles.btnPrimary}
                disabled={generating}
                onClick={async () => {
                  setGenerating(true);
                  try {
                    const r = await fetch("/api/invoices/generate-all", {
                      method: "POST", headers,
                      body: JSON.stringify(generateForm),
                    });
                    const d = await r.json();
                    if (r.ok) {
                      showToast(`${d.generated} facture(s) générée(s)`);
                      loadInvoices();
                    } else {
                      showToast(d.message || "Erreur", "error");
                    }
                  } catch { showToast("Erreur réseau", "error"); }
                  setGenerating(false);
                }}
              >
                {generating ? "Génération…" : "📄 Générer toutes les factures"}
              </button>
            </div>
          </div>

          {/* KPIs factures */}
          {invoicesStats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
              <StatCard icon="📄" label="Total factures" value={invoices.length} color="#6366f1" />
              <StatCard icon="🕐" label="En attente de paiement" value={invoices.filter(i => i.status === "pending").length} color="#f59e0b" />
              <StatCard icon="✅" label="Payées" value={invoices.filter(i => i.status === "paid").length} color="#10b981" />
              <StatCard icon="💰" label="Total encaissé" value={`${Number(invoicesStats.totalPaid || 0).toLocaleString("fr-FR")} XOF`} color="#10b981" />
              <StatCard icon="⏳" label="En attente" value={`${Number(invoicesStats.totalPending || 0).toLocaleString("fr-FR")} XOF`} color="#f59e0b" />
            </div>
          )}

          {invoiceLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement…</p></div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>📄</div>
              <p>Aucune facture générée pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Partenaire</th>
                    <th>Période</th>
                    <th>Transactions</th>
                    <th>Total commission</th>
                    <th>Statut</th>
                    <th>Échéance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isPaid    = inv.status === "paid";
                    const isOverdue = inv.status === "overdue";
                    const statusColor = isPaid ? "#10b981" : isOverdue ? "#dc2626" : "#d97706";
                    const statusBg    = isPaid ? "#dcfce7" : isOverdue ? "#fef2f2" : "#fef3c7";
                    const statusLabel = isPaid ? "Payée" : isOverdue ? "En retard" : "À payer";
                    return (
                      <tr key={inv._id}>
                        <td style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.83rem" }}>{inv.reference}</td>
                        <td style={{ fontSize: "0.85rem" }}>
                          <div style={{ fontWeight: 700 }}>{inv.partner?.firstName} {inv.partner?.lastName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{inv.partner?.email}</div>
                        </td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {MOIS[(inv.month || 1) - 1]} {inv.year}
                        </td>
                        <td style={{ textAlign: "center" }}>{(inv.lines || []).length}</td>
                        <td style={{ fontWeight: 800, color: "#0f1b3f" }}>
                          {Number(inv.totalCommission || 0).toLocaleString("fr-FR")} {inv.devise || "XOF"}
                        </td>
                        <td>
                          <Badge label={statusLabel} color={statusColor} bg={statusBg} />
                        </td>
                        <td style={{ fontSize: "0.83rem", color: isOverdue ? "#dc2626" : "#64748b" }}>
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td>
                          {!isPaid && (
                            <button
                              className={styles.btnApprove}
                              style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                              onClick={async () => {
                                const r = await fetch(`/api/invoices/${inv._id}/paid`, {
                                  method: "PATCH", headers,
                                  body: JSON.stringify({ paymentMethod: "virement" }),
                                });
                                if (r.ok) { showToast("Facture marquée payée ✅"); loadInvoices(); }
                                else showToast("Erreur", "error");
                              }}
                            >
                              ✅ Marquer payée
                            </button>
                          )}
                          {isPaid && <span style={{ color: "#10b981", fontSize: "0.82rem", fontWeight: 600 }}>
                            Payée le {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("fr-FR") : "—"}
                          </span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB KYC — Gestion des dossiers d'identité
      ══════════════════════════════════════════════════ */}
      {activeTab === "kyc" && (
        <div className={styles.tabContent}>
          {/* En-tête KYC */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🛡️ Gestion des dossiers KYC</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Examinez et validez les dossiers d'identité soumis par les utilisateurs.</p>
            </div>
            <button
              style={{ padding: "8px 16px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}
              onClick={() => loadKycList(kycFilter)}
            >
              🔄 Actualiser
            </button>
          </div>

          {/* Filtres par statut */}
          <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
            {[
              { v: "EN_ATTENTE",            l: "En attente", ic: "⏳" },
              { v: "A_REVOIR_MANUELLEMENT", l: "En révision", ic: "🔍" },
              { v: "VERIFIE",               l: "Vérifiés",   ic: "✅" },
              { v: "REFUSE",                l: "Refusés",    ic: "❌" },
            ].map(({ v, l, ic }) => (
              <button key={v}
                style={{
                  padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
                  fontSize: ".82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  borderColor: kycFilter === v ? "#6366f1" : "#e2e8f0",
                  background:  kycFilter === v ? "#6366f1" : "#f8fafc",
                  color:       kycFilter === v ? "#fff"    : "#64748b",
                }}
                onClick={() => setKycFilter(v)}
              >
                {ic} {l}
              </button>
            ))}
          </div>

          {kycLoading ? (
            <div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement des dossiers KYC…</p></div>
          ) : kycList.length === 0 ? (
            <div className={styles.emptyBox} style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>✅</div>
              <p style={{ margin: 0, fontWeight: 600, color: "#475569" }}>Aucun dossier en attente de traitement.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {kycList.map((u) => {
                const KC = {
                  VERIFIE:               { c: "#059669", bg: "#d1fae5", border: "#6ee7b7", emoji: "✅" },
                  EN_ATTENTE:            { c: "#d97706", bg: "#fef3c7", border: "#fde68a", emoji: "⏳" },
                  A_REVOIR_MANUELLEMENT: { c: "#2563eb", bg: "#dbeafe", border: "#93c5fd", emoji: "🔍" },
                  REFUSE:                { c: "#dc2626", bg: "#fee2e2", border: "#fca5a5", emoji: "❌" },
                };
                const kc = KC[u.kycStatus] || KC["EN_ATTENTE"];
                return (
                  <div key={u._id} style={{
                    background: "#fff", borderRadius: 14,
                    border: `1.5px solid ${kc.border}`,
                    padding: "16px 20px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    alignItems: "center", gap: 16,
                  }}>
                    {/* Infos utilisateur */}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#0f1b3f", marginBottom: 2 }}>
                        {u.firstName} {u.lastName}
                      </div>
                      <div style={{ fontSize: ".81rem", color: "#64748b" }}>{u.email}</div>
                      <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 3 }}>
                        Soumis {u.kycSubmittedAt ? new Date(u.kycSubmittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </div>
                    </div>
                    {/* OCR mini */}
                    {u.kycOcrData ? (
                      <div style={{ fontSize: ".78rem", color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", textAlign: "right", minWidth: 140 }}>
                        <div style={{ fontWeight: 700 }}>{u.kycOcrData.documentType || "—"} · {u.kycOcrData.issuingCountry || "—"}</div>
                        <div>OCR <strong>{u.kycOcrData.ocrConfidence ?? 0}%</strong> · Face <strong>{u.kycFaceMatchScore ?? "—"}%</strong></div>
                        <div>Score <strong>{u.kycScore ?? 0}/100</strong></div>
                      </div>
                    ) : <div />}
                    {/* Badge statut */}
                    <span style={{ padding: "4px 14px", borderRadius: 20, background: kc.bg, color: kc.c, fontSize: ".8rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                      {kc.emoji} {u.kycStatus.replace(/_/g, " ")}
                    </span>
                    {/* Bouton examen */}
                    <button
                      style={{ padding: "8px 18px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer", whiteSpace: "nowrap" }}
                      onClick={() => openKycDetail(u)}
                    >
                      Examiner →
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal détail + décision KYC */}
          {kycDetailUser && (
            <div className={styles.overlay} onClick={() => setKycDetailUser(null)}>
              <div style={{ background: "#fff", borderRadius: 20, padding: "0", maxWidth: 740, width: "98%", maxHeight: "94dvh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.22)" }}
                onClick={(e) => e.stopPropagation()}>

                {/* Header modal KYC */}
                <div style={{ background: "linear-gradient(135deg,#1e3a8a,#4f46e5)", borderRadius: "20px 20px 0 0", padding: "20px 24px", color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {kycDetailUser.profilePhoto
                        ? <img src={kycDetailUser.profilePhoto} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.4)" }} />
                        : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>👤</div>
                      }
                      <div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{kycDetailUser.firstName} {kycDetailUser.lastName}</div>
                        <div style={{ fontSize: ".82rem", opacity: .8, marginTop: 2 }}>{kycDetailUser.email || "—"} · {kycDetailUser.phone || "—"}</div>
                        <div style={{ fontSize: ".75rem", opacity: .65, marginTop: 2 }}>
                          Rôle : <strong>{kycDetailUser.role}</strong> · Inscrit le {kycDetailUser.createdAt ? new Date(kycDetailUser.createdAt).toLocaleDateString("fr-FR") : "—"}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setKycDetailUser(null)} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#fff", fontSize: "1.1rem", cursor: "pointer", flexShrink: 0 }}>✕</button>
                  </div>
                </div>

                <div style={{ padding: "20px 24px" }}>
                  {/* Indicateurs rapides */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                    {[
                      { l: "Score KYC",      v: `${kycDetailUser.kycScore ?? 0}/100`,      color: (kycDetailUser.kycScore ?? 0) >= 70 ? "#16a34a" : "#ef4444" },
                      { l: "OCR Confiance",  v: `${kycDetailUser.kycOcrData?.ocrConfidence ?? 0}%`, color: "#6366f1" },
                      { l: "Face match",     v: kycDetailUser.kycFaceMatchScore !== null ? `${kycDetailUser.kycFaceMatchScore}%` : "—", color: "#f59e0b" },
                      { l: "Badge KYC",      v: kycDetailUser.kycBadge || "—",              color: "#0f1b3f" },
                    ].map(({ l, v, color }) => (
                      <div key={l} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1.5px solid #e2e8f0" }}>
                        <div style={{ fontSize: ".68rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
                        <div style={{ fontSize: "1rem", fontWeight: 900, color, marginTop: 3 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Infos contact */}
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", color: "#334155" }}>
                    <div><span style={{ color: "#94a3b8" }}>Email </span>{kycDetailUser.email ? <>{kycDetailUser.email} {kycDetailUser.emailVerified ? "✅" : "❌"}</> : "—"}</div>
                    <div><span style={{ color: "#94a3b8" }}>Tél. </span>{kycDetailUser.phone ? <>{kycDetailUser.phone} {kycDetailUser.phoneVerified ? "✅" : "❌"}</> : "—"}</div>
                    <div><span style={{ color: "#94a3b8" }}>Rôle </span>{kycDetailUser.role}</div>
                    <div><span style={{ color: "#94a3b8" }}>Soumis </span>{kycDetailUser.kycSubmittedAt ? new Date(kycDetailUser.kycSubmittedAt).toLocaleDateString("fr-FR") : "—"}</div>
                  </div>

                  {/* Chargement des documents complets (photos recto/verso/selfie/permis) */}
                  {kycDetailLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginBottom: 14, color: "#64748b", fontSize: ".85rem" }}>
                      <div className={styles.spinner} style={{ width: 18, height: 18 }} />
                      Chargement des documents soumis…
                    </div>
                  )}

                  {/* Données OCR */}
                  {kycDetailUser.kycOcrData && (
                    <div style={{ background: "#f5f3ff", border: "1.5px solid #c4b5fd", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", color: "#3730a3" }}>
                      <strong style={{ display: "block", marginBottom: 8 }}>📄 Données OCR du document</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                        {kycDetailUser.kycOcrData.firstName      && <div><span style={{ opacity: .7 }}>Prénom </span><strong>{kycDetailUser.kycOcrData.firstName}</strong></div>}
                        {kycDetailUser.kycOcrData.lastName       && <div><span style={{ opacity: .7 }}>Nom </span><strong>{kycDetailUser.kycOcrData.lastName}</strong></div>}
                        {kycDetailUser.kycOcrData.documentNumber && <div><span style={{ opacity: .7 }}>N° </span><strong style={{ fontFamily: "monospace" }}>{kycDetailUser.kycOcrData.documentNumber}</strong></div>}
                        {kycDetailUser.kycOcrData.issuingCountry && <div><span style={{ opacity: .7 }}>Pays </span><strong>{kycDetailUser.kycOcrData.issuingCountry}</strong></div>}
                        {kycDetailUser.kycOcrData.expiryDate     && <div><span style={{ opacity: .7 }}>Expire </span><strong>{new Date(kycDetailUser.kycOcrData.expiryDate).toLocaleDateString("fr-FR")}</strong></div>}
                        {kycDetailUser.kycOcrData.gender         && <div><span style={{ opacity: .7 }}>Sexe </span><strong>{kycDetailUser.kycOcrData.gender === "M" ? "Masculin" : "Féminin"}</strong></div>}
                      </div>
                    </div>
                  )}

                  {/* ── Documents réels (recto, verso, selfie) ── */}
                  {(kycDetailUser.identity?.frontImage || kycDetailUser.identity?.backImage || kycDetailUser.identity?.selfie) && (
                    <div style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: ".82rem", color: "#0f1b3f", display: "block", marginBottom: 10 }}>
                        📄 Documents soumis — {kycDetailUser.identity?.type?.toUpperCase() || "PIÈCE D'IDENTITÉ"}
                      </strong>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                        {[
                          { label: "Recto", img: kycDetailUser.identity?.frontImage },
                          { label: "Verso", img: kycDetailUser.identity?.backImage },
                          { label: "Selfie", img: kycDetailUser.identity?.selfie },
                        ].map(({ label, img }) => (
                          <div key={label} style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#f8fafc" }}>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#64748b", padding: "6px 10px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                            {img ? (
                              <a href={safeImgHref(img)} target="_blank" rel="noreferrer noopener">
                                <img src={img} alt={label} style={{ width: "100%", maxHeight: 120, objectFit: "cover", display: "block" }}
                                  onError={(e) => { e.target.style.display = "none"; }} />
                              </a>
                            ) : (
                              <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".8rem" }}>Non fourni</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!kycDetailLoading && !(kycDetailUser.identity?.frontImage || kycDetailUser.identity?.backImage || kycDetailUser.identity?.selfie) && (
                    <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#dc2626" }}>
                      ⚠️ Aucune pièce d'identité soumise par cet utilisateur.
                    </div>
                  )}

                  {/* ── Permis de conduire (si disponible) ── */}
                  {(kycDetailUser.driverLicenseOcr?.frontImage || kycDetailUser.driverLicenseOcr?.backImage) && (
                    <div style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: ".82rem", color: "#0f1b3f", display: "block", marginBottom: 10 }}>🚗 Permis de conduire</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {[
                          { label: "Recto permis", img: kycDetailUser.driverLicenseOcr?.frontImage },
                          { label: "Verso permis",  img: kycDetailUser.driverLicenseOcr?.backImage },
                        ].map(({ label, img }) => img && (
                          <div key={label} style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#64748b", padding: "6px 10px", background: "#f1f5f9" }}>{label}</div>
                            <a href={img} target="_blank" rel="noreferrer">
                              <img src={img} alt={label} style={{ width: "100%", maxHeight: 100, objectFit: "cover", display: "block" }} />
                            </a>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: ".78rem", color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
                        N° : {kycDetailUser.driverLicenseOcr?.licenseNumber || "—"} · Catégories : {kycDetailUser.driverLicenseOcr?.categories || "—"} · Expire : {kycDetailUser.driverLicenseOcr?.expiryDate ? new Date(kycDetailUser.driverLicenseOcr.expiryDate).toLocaleDateString("fr-FR") : "—"}
                        {kycDetailUser.driverLicenseOcr?.isExpired && <span style={{ color: "#ef4444", fontWeight: 700 }}> ⚠️ EXPIRÉ</span>}
                      </div>
                    </div>
                  )}

                  {/* ── Infos entreprise (si partenaire) ── */}
                  {kycDetailUser.business?.companyName && (
                    <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                      <strong style={{ fontSize: ".82rem", color: "#1e40af", display: "block", marginBottom: 6 }}>🏢 Entreprise partenaire</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 16px", fontSize: ".82rem", color: "#1e3a8a" }}>
                        <div><span style={{ opacity: .7 }}>Société </span><strong>{kycDetailUser.business.companyName}</strong></div>
                        <div><span style={{ opacity: .7 }}>RCCM </span>{kycDetailUser.business.rccm || "—"}</div>
                        <div><span style={{ opacity: .7 }}>NIF </span>{kycDetailUser.business.taxId || "—"}</div>
                        <div><span style={{ opacity: .7 }}>Adresse </span>{kycDetailUser.business.address || "—"}</div>
                      </div>
                    </div>
                  )}

                  {/* Raison du rejet précédent */}
                  {kycDetailUser.kycRejectionReason && (
                    <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#dc2626" }}>
                      <strong>⚠️ Dernier motif de refus :</strong> {kycDetailUser.kycRejectionReason}
                    </div>
                  )}
                  {kycDetailUser.kycReviewNote && (
                    <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#92400e" }}>
                      <strong>📝 Note de révision :</strong> {kycDetailUser.kycReviewNote}
                    </div>
                  )}

                  {/* Journal d'audit */}
                  {kycDetailUser.kycAuditLog?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <strong style={{ fontSize: ".82rem", color: "#475569", display: "block", marginBottom: 8 }}>📋 Historique des actions</strong>
                      <div style={{ maxHeight: 110, overflowY: "auto", border: "1.5px solid #e2e8f0", borderRadius: 8 }}>
                        {kycDetailUser.kycAuditLog.slice().reverse().map((log, i) => (
                          <div key={i} style={{ fontSize: ".77rem", color: "#64748b", padding: "7px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span><span style={{ fontWeight: 700, color: "#334155" }}>{log.action}</span>{log.note && ` — ${log.note}`}</span>
                            <span style={{ flexShrink: 0, color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Décision */}
                  <div style={{ borderTop: "1.5px solid #e2e8f0", paddingTop: 16 }}>
                    <strong style={{ fontSize: ".88rem", color: "#0f1b3f", display: "block", marginBottom: 12 }}>Décision administrative</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        { v: "VERIFIE",               l: "✅ Approuver",    col: "#059669", bg: kycReviewForm.decision === "VERIFIE" ? "#d1fae5" : "#f8fafc" },
                        { v: "REFUSE",                l: "❌ Refuser",      col: "#dc2626", bg: kycReviewForm.decision === "REFUSE" ? "#fee2e2" : "#f8fafc" },
                        { v: "A_REVOIR_MANUELLEMENT", l: "🔍 En révision",  col: "#2563eb", bg: kycReviewForm.decision === "A_REVOIR_MANUELLEMENT" ? "#dbeafe" : "#f8fafc" },
                        { v: "EN_ATTENTE",            l: "⏳ Remettre en attente", col: "#d97706", bg: kycReviewForm.decision === "EN_ATTENTE" ? "#fef3c7" : "#f8fafc" },
                      ].map(({ v, l, col, bg }) => (
                        <button key={v}
                          style={{ padding: "10px 8px", borderRadius: 9, border: `2px solid ${kycReviewForm.decision === v ? col : "#e2e8f0"}`, fontSize: ".82rem", fontWeight: 700, cursor: "pointer", background: bg, color: kycReviewForm.decision === v ? col : "#64748b", fontFamily: "inherit" }}
                          onClick={() => setKycReviewForm((f) => ({ ...f, decision: v }))}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <textarea
                      placeholder="Note interne ou raison du refus (visible dans le journal)"
                      value={kycReviewForm.note}
                      onChange={(e) => setKycReviewForm((f) => ({ ...f, note: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", fontFamily: "inherit", resize: "vertical", minHeight: 68, marginBottom: 12, boxSizing: "border-box" }}
                    />
                    {kycReviewMsg && (
                      <p style={{ fontSize: ".85rem", color: kycReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight: 600, marginBottom: 10 }}>{kycReviewMsg}</p>
                    )}
                    <button
                      style={{ width: "100%", padding: "12px", borderRadius: 10, background: kycReviewLoading ? "#94a3b8" : "#6366f1", color: "#fff", border: "none", fontWeight: 800, fontSize: ".95rem", cursor: kycReviewLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                      onClick={() => handleKycReview(kycDetailUser._id)} disabled={kycReviewLoading}
                    >
                      {kycReviewLoading ? "Enregistrement…" : "Valider la décision"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB CERTIFICATION — Gestion des certifications partenaires
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "certification" && (
        <div className={styles.tabContent}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:12 }}>
            <div>
              <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🏆 Certifications Partenaire VIT AUTO</h2>
              <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Examinez chaque niveau de certification et attribuez les badges officiels.</p>
            </div>
            <button style={{ padding:"8px 16px", borderRadius:10, background:"#f59e0b", color:"#fff", border:"none", fontWeight:700, fontSize:".85rem", cursor:"pointer" }}
              onClick={loadCertList}>🔄 Actualiser</button>
          </div>

          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:"1.5rem" }}>
            {[
              { icon:"📋", label:"Dossiers total",    value: certList.length,                                                    color:"#6366f1" },
              { icon:"⏳", label:"En attente review", value: pendingCert,                                                         color:"#d97706" },
              { icon:"🟢", label:"Badge Vérifié",     value: certList.filter(c=>c.certificationBadge==="verifie").length,          color:"#059669" },
              { icon:"🏆", label:"Badge Fondateur",   value: certList.filter(c=>c.certificationBadge==="fondateur").length,        color:"#d97706" },
              { icon:"⭐", label:"Badge Premium",     value: certList.filter(c=>c.certificationBadge==="premium").length,          color:"#7c3aed" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Filtres */}
          <div style={{ display:"flex", gap:8, marginBottom:"1.25rem", flexWrap:"wrap" }}>
            {[
              { v:"all",      l:"Tous" },
              { v:"pending",  l:"⏳ Niveaux soumis" },
              { v:"verifie",  l:"🟢 Vérifié" },
              { v:"fondateur",l:"🏆 Fondateur" },
              { v:"premium",  l:"⭐ Premium" },
            ].map(f => (
              <button key={f.v} onClick={() => setCertFilter(f.v)}
                style={{ padding:"6px 14px", borderRadius:20, border:"2px solid", fontSize:"0.8rem", fontWeight:700, cursor:"pointer",
                  borderColor: certFilter===f.v ? "#f59e0b" : "#e2e8f0",
                  background:  certFilter===f.v ? "#f59e0b" : "#f8fafc",
                  color:       certFilter===f.v ? "#fff"    : "#64748b" }}>
                {f.l}
              </button>
            ))}
          </div>

          {certReviewMsg && (
            <div style={{ padding:"10px 16px", borderRadius:10, marginBottom:12, background: certReviewMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: certReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, fontSize:".85rem" }}>
              {certReviewMsg}
            </div>
          )}

          {certLoading ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>⏳ Chargement…</div>
          ) : certList.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
              <div style={{ fontSize:"3rem", marginBottom:12 }}>🏆</div>
              <p style={{ fontWeight:700, color:"#64748b" }}>Aucune demande de certification pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Partenaire</th><th>Niveaux</th><th>Badge actuel</th><th>Score</th><th>Actions</th></tr></thead>
                <tbody>
                  {certList
                    .filter(c => {
                      if (certFilter === "all") return true;
                      if (certFilter === "pending") return ["level1","level2","level3","level4","level5","level6","level7"].some(l => c[l]?.status === "submitted");
                      return c.certificationBadge === certFilter;
                    })
                    .map((c) => {
                      const u = c.userId;
                      const badgeColors = { verifie:"#059669", fondateur:"#d97706", premium:"#7c3aed", none:"#94a3b8" };
                      const pendingLevels = [1,2,3,4,5,6,7].filter(n => c[`level${n}`]?.status === "submitted");
                      return (
                        <tr key={c._id}>
                          <td>
                            <div style={{ fontWeight:700 }}>{u?.firstName} {u?.lastName}</div>
                            <div style={{ fontSize:".78rem", color:"#64748b" }}>{u?.email}</div>
                            <div style={{ fontSize:".72rem", color:"#94a3b8" }}>
                              <span style={{ background:"#f0f4ff", color:"#2563eb", padding:"1px 8px", borderRadius:99, fontWeight:700 }}>{u?.role}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                              {[1,2,3,4,5,6,7].map(n => {
                                const st = c[`level${n}`]?.status || "not_started";
                                const icons = { not_started:"○", in_progress:"◎", submitted:"⏳", approved:"✅", rejected:"❌" };
                                const cols  = { not_started:"#94a3b8", in_progress:"#3b82f6", submitted:"#d97706", approved:"#059669", rejected:"#dc2626" };
                                return (
                                  <span key={n} title={`Niveau ${n} : ${st}`}
                                    style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:22, height:22, borderRadius:6, background:"#f1f5f9", fontSize:".65rem", color:cols[st], fontWeight:800 }}>
                                    {n}{icons[st]}
                                  </span>
                                );
                              })}
                            </div>
                            {pendingLevels.length > 0 && (
                              <div style={{ fontSize:".72rem", color:"#d97706", fontWeight:700, marginTop:3 }}>
                                ⏳ Niveaux à examiner : {pendingLevels.join(", ")}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight:800, color: badgeColors[c.certificationBadge] || "#94a3b8", fontSize:".85rem" }}>
                              {c.certificationBadge === "premium" ? "⭐ Premium" : c.certificationBadge === "fondateur" ? "🏆 Fondateur" : c.certificationBadge === "verifie" ? "🟢 Vérifié" : "○ Aucun"}
                            </span>
                          </td>
                          <td style={{ fontWeight:800, color:"#6366f1" }}>{c.certificationScore ?? 0}/100</td>
                          <td>
                            <button
                              style={{ padding:"5px 12px", background:"#ede9fe", color:"#7c3aed", border:"1px solid #c4b5fd", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                              onClick={async () => {
                                setCertReviewMsg("");
                                const r = await fetch(`/api/certification/admin/${u?._id}`, { headers });
                                if (r.ok) { const d = await r.json(); setCertDetail(d.certification); }
                              }}>
                              🔍 Examiner
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Panneau de détail dossier ── */}
          {certDetail && (
            <div className={styles.overlay} onClick={() => { setCertDetail(null); setCertReviewLevel(null); setCertReviewMsg(""); }}>
              <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth:680, width:"95%", maxHeight:"85vh", overflow:"auto" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div>
                    <h3 style={{ margin:0, fontWeight:900, fontSize:"1.05rem", color:"#0f1b3f" }}>
                      🏆 Dossier de certification
                    </h3>
                    <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:".85rem" }}>
                      {certDetail.userId?.firstName} {certDetail.userId?.lastName} — {certDetail.userId?.email}
                    </p>
                  </div>
                  <button onClick={() => { setCertDetail(null); setCertReviewLevel(null); setCertReviewMsg(""); }}
                    style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontWeight:700 }}>✕</button>
                </div>

                {certReviewMsg && (
                  <div style={{ padding:"8px 14px", borderRadius:8, marginBottom:12, background: certReviewMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: certReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, fontSize:".83rem" }}>
                    {certReviewMsg}
                  </div>
                )}

                {/* Niveaux 1-7 */}
                {[1,2,3,4,5,6,7].map(n => {
                  const lv = certDetail[`level${n}`];
                  const lvTitles = ["","Entreprise","Représentant","Activité","Banque","Véhicules","Export","Contrat"];
                  const st = lv?.status || "not_started";
                  const stColors  = { not_started:"#94a3b8", submitted:"#d97706", approved:"#059669", rejected:"#dc2626", in_progress:"#3b82f6" };
                  const stLabels  = { not_started:"Non commencé", submitted:"Soumis ⏳", approved:"Approuvé ✅", rejected:"Refusé ❌", in_progress:"En cours" };
                  return (
                    <div key={n} style={{ border:"1.5px solid #e2e8f0", borderRadius:12, padding:14, marginBottom:10,
                      borderColor: st === "approved" ? "#6ee7b7" : st === "submitted" ? "#fcd34d" : st === "rejected" ? "#fca5a5" : "#e2e8f0",
                      background:  st === "approved" ? "#f0fdf4" : st === "submitted" ? "#fffbeb" : "#fff" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: st === "submitted" ? 10 : 0 }}>
                        <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f" }}>
                          Niveau {n} — {lvTitles[n]}
                        </div>
                        <span style={{ fontWeight:800, fontSize:".78rem", color: stColors[st] }}>{stLabels[st]}</span>
                      </div>
                      {lv?.adminNote && <p style={{ fontSize:".78rem", color:"#64748b", margin:"4px 0 0" }}>Note : {lv.adminNote}</p>}
                      {lv?.rejectionReason && <p style={{ fontSize:".78rem", color:"#dc2626", margin:"4px 0 0" }}>Motif refus : {lv.rejectionReason}</p>}
                      {st !== "not_started" && <CertLevelDocs level={n} lv={lv} />}

                      {st === "submitted" && (
                        certReviewLevel === n ? (
                          <div style={{ marginTop:10, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:12 }}>
                            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                              {["approved","rejected"].map(dec => (
                                <button key={dec} onClick={() => setCertReviewForm(p => ({ ...p, decision:dec }))}
                                  style={{ flex:1, padding:"7px 0", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:700, fontSize:".8rem",
                                    borderColor: certReviewForm.decision===dec ? (dec==="approved"?"#059669":"#dc2626") : "#e2e8f0",
                                    background:  certReviewForm.decision===dec ? (dec==="approved"?"#d1fae5":"#fee2e2") : "#fff",
                                    color:       certReviewForm.decision===dec ? (dec==="approved"?"#059669":"#dc2626") : "#64748b" }}>
                                  {dec==="approved"?"✅ Approuver":"❌ Refuser"}
                                </button>
                              ))}
                            </div>
                            <textarea
                              rows={2}
                              placeholder="Note ou motif de refus…"
                              value={certReviewForm.note}
                              onChange={e => setCertReviewForm(p=>({...p, note:e.target.value}))}
                              style={{ width:"100%", boxSizing:"border-box", padding:8, borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".83rem", fontFamily:"inherit", resize:"vertical" }}
                            />
                            <div style={{ display:"flex", gap:8, marginTop:8 }}>
                              <button onClick={() => handleCertLevelReview(certDetail.userId?._id, n)} disabled={certReviewLoading}
                                style={{ flex:1, padding:"8px 0", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, fontWeight:800, cursor:"pointer", fontSize:".83rem" }}>
                                {certReviewLoading ? "…" : "Confirmer"}
                              </button>
                              <button onClick={() => setCertReviewLevel(null)}
                                style={{ padding:"8px 16px", background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:".83rem" }}>
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setCertReviewLevel(n); setCertReviewForm({ decision:"approved", note:"" }); }}
                            style={{ marginTop:8, padding:"6px 14px", background:"#f59e0b", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                            Examiner ce niveau
                          </button>
                        )
                      )}
                    </div>
                  );
                })}

                {/* Attribution du badge final */}
                <div style={{ border:"2px solid #fcd34d", borderRadius:12, padding:16, background:"#fffbeb", marginTop:4 }}>
                  <h4 style={{ margin:"0 0 12px", fontWeight:900, color:"#92400e" }}>🏅 Attribution du Badge Final</h4>
                  <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                    {[{v:"verifie",l:"🟢 Vérifié"},{v:"fondateur",l:"🏆 Fondateur"},{v:"premium",l:"⭐ Premium"},{v:"none",l:"○ Aucun"}].map(b => (
                      <button key={b.v} onClick={() => setCertBadgeForm(p=>({...p,badge:b.v}))}
                        style={{ flex:1, minWidth:100, padding:"8px 4px", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:800, fontSize:".78rem",
                          borderColor: certBadgeForm.badge===b.v ? "#f59e0b" : "#e2e8f0",
                          background:  certBadgeForm.badge===b.v ? "#f59e0b" : "#fff",
                          color:       certBadgeForm.badge===b.v ? "#fff"    : "#64748b" }}>
                        {b.l}
                      </button>
                    ))}
                  </div>
                  <input type="text" placeholder="Message public affiché sur le profil (optionnel)" value={certBadgeForm.publicStatement}
                    onChange={e => setCertBadgeForm(p=>({...p,publicStatement:e.target.value}))}
                    style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".83rem", fontFamily:"inherit", marginBottom:8 }}
                  />
                  <button onClick={() => handleCertBadge(certDetail.userId?._id)} disabled={certReviewLoading}
                    style={{ width:"100%", padding:"10px 0", background:"linear-gradient(135deg,#0f1b3f,#1e3a6e)", color:"#fff", border:"none", borderRadius:8, fontWeight:800, cursor:"pointer", fontSize:".9rem" }}>
                    {certReviewLoading ? "Enregistrement…" : "Attribuer le badge"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB IMPORT/EXPORT ══════════════════════ */}
      {activeTab === "import_export" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🌍 Transactions Import / Export</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Suivi de toutes les demandes et transactions internationales.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadImportExport}>↻ Actualiser</button>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon: "🌍", label: "Total demandes",       value: ieRequests.length,                                             color: "#6366f1" },
              { icon: "⏳", label: "En attente",           value: ieRequests.filter(r => r.status === "pending").length,          color: "#f59e0b" },
              { icon: "✅", label: "Approuvées",           value: ieRequests.filter(r => r.status === "approved").length,         color: "#10b981" },
              { icon: "❌", label: "Rejetées",             value: ieRequests.filter(r => r.status === "rejected").length,         color: "#ef4444" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {ieLoading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
          ) : ieRequests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🌍</div>
              <p style={{ fontWeight: 600 }}>Aucune transaction import/export pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Référence</th><th>Type</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {ieRequests.map((r) => {
                    const ST = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Approuvée", c: "#16a34a", bg: "#dcfce7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" }, in_progress: { l: "En cours", c: "#3b82f6", bg: "#eff6ff" }, completed: { l: "Terminée", c: "#6366f1", bg: "#eef2ff" } };
                    const st = ST[r.status] || ST.pending;
                    return (
                      <tr key={r._id} className={styles.tr}>
                        <td style={{ fontWeight: 700, fontSize: ".85rem", fontFamily: "monospace" }}>{r.reference || r._id?.slice(-8)}</td>
                        <td><Badge label={r.type === "import" ? "📥 Import" : r.type === "export" ? "📤 Export" : r.type || "—"} color="#6366f1" bg="#eef2ff" /></td>
                        <td>
                          <div>
                            <strong style={{ fontSize: ".87rem" }}>{r.clientInfo?.firstName || r.buyer?.firstName || ""} {r.clientInfo?.lastName || r.buyer?.lastName || ""}</strong>
                            <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.clientInfo?.email || r.buyer?.email || "—"}</div>
                          </div>
                        </td>
                        <td className={styles.tdPrice}>{r.totalAmount ? `${Number(r.totalAmount).toLocaleString("fr-FR")} ${r.currency || "XOF"}` : "—"}</td>
                        <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
                        <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB LITIGES ══════════════════════ */}
      {activeTab === "litiges" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>⚖️ Gestion des litiges</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Toutes les commandes en dispute requérant une décision administrative.</p>
            </div>
            <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
          </div>

          {/* KPIs litiges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon: "⚖️", label: "Litiges ouverts",  value: bookings.filter(b => b.status === "disputed").length, color: "#dc2626" },
              { icon: "✅", label: "Résolus ce mois",   value: bookings.filter(b => ["completed","compensated"].includes(b.status) && b.disputeResolvedAt).length, color: "#10b981" },
              { icon: "💰", label: "Montant en jeu",    value: `${bookings.filter(b=>b.status==="disputed").reduce((s,b)=>s+(b.montantTotal||0),0).toLocaleString("fr-FR")} XOF`, color: "#f59e0b" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {bookings.filter(b => b.status === "disputed").length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚖️</div>
              <p style={{ fontWeight: 700, color: "#64748b" }}>Aucun litige en cours.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Référence</th><th>Client</th><th>Véhicule / Service</th><th>Raison du litige</th><th>Montant</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {bookings.filter(b => b.status === "disputed").map((b) => {
                    const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
                    const vName = b.vehicle ? [b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur` : "—");
                    return (
                      <tr key={b._id} className={styles.tr} style={{ background: "#fff5f5" }}>
                        <td><strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference||b._id?.slice(-6)}</strong></td>
                        <td><div><strong style={{ fontSize:"0.82rem" }}>{clientName||"—"}</strong><span className={styles.vehMeta}>{b.clientInfo?.email}</span></div></td>
                        <td style={{ fontSize:"0.82rem" }}>{vName}</td>
                        <td style={{ fontSize:"0.8rem", color:"#dc2626", maxWidth:200 }}>{b.clientValidation?.disputeReason||"Non précisée"}</td>
                        <td className={styles.tdPrice}>{b.montantTotal>0?`${Number(b.montantTotal).toLocaleString("fr-FR")} XOF`:"—"}</td>
                        <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                        <td>
                          <button style={{ padding:"5px 12px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                            onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}>
                            ⚖️ Résoudre
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB CHAUFFEURS ══════════════════════ */}
      {activeTab === "chauffeurs" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>👨‍✈️ Gestion des chauffeurs</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Validez les dossiers, gérez les chauffeurs actifs et leurs missions.</p>
            </div>
            <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
          </div>

          {/* KPIs chauffeurs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
            {[
              { icon:"👨‍✈️", label:"En attente validation", value: drivers.length,                                                  color:"#f59e0b" },
              { icon:"✅",   label:"Chauffeurs actifs",      value: users.filter(u=>u.role==="chauffeur"&&u.isActive).length,       color:"#10b981" },
              { icon:"🚗",   label:"Missions terminées",     value: bookings.filter(b=>b.type==="chauffeur"&&b.status==="completed").length, color:"#3b82f6" },
              { icon:"💰",   label:"Revenue chauffeurs",     value: `${bookings.filter(b=>b.type==="chauffeur"&&b.status==="completed").reduce((s,b)=>s+(b.montantTotal||0),0).toLocaleString("fr-FR")} XOF`, color:"#6366f1" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Dossiers en attente */}
          <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
            <h3 className={styles.chartTitle}>⏳ Dossiers en attente de validation ({drivers.length})</h3>
            {drivers.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucun profil chauffeur en attente.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Chauffeur</th><th>Disponibilité</th><th>Tarif</th><th>Zone</th><th>Soumis le</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {drivers.map((d) => (
                      <tr key={d._id} className={styles.tr}>
                        <td>
                          <div className={styles.vehicleCell}>
                            {d.profilePhoto ? <img src={d.profilePhoto} alt="" className={styles.vehThumb} style={{ borderRadius:"50%" }} /> : <div className={styles.vehThumbPlaceholder}>👤</div>}
                            <div>
                              <strong>{d.firstName} {d.lastName}</strong>
                              <span className={styles.vehMeta}>{d.title}</span>
                            </div>
                          </div>
                        </td>
                        <td><Badge label={d.disponibilite||"—"} color="#8b5cf6" bg="#f5f3ff" /></td>
                        <td className={styles.tdPrice}>{d.tarif?`${Number(d.tarif).toLocaleString("fr-FR")} XOF/j`:"—"}</td>
                        <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.zone||d.ville||"—"}</td>
                        <td className={styles.tdDate}>{fmtDate(d.createdAt)}</td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button className={styles.btnApprove} onClick={() => setConfirm({ message:`Approuver ${d.firstName} ${d.lastName} ?`, action:()=>updateDriverStatus(d._id,"approved") })}>✅ Valider</button>
                            <button className={styles.btnReject} onClick={() => { setDriverRejectModal({ did:d._id, name:`${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Rejeter</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chauffeurs actifs */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>✅ Chauffeurs actifs ({users.filter(u=>u.role==="chauffeur"&&u.isActive).length})</h3>
            {users.filter(u=>u.role==="chauffeur").length === 0 ? (
              <p style={{ color:"#64748b", fontSize:"0.9rem" }}>Aucun chauffeur enregistré.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Chauffeur</th><th>Email</th><th>Statut</th><th>Inscrit le</th><th>Actions</th></tr></thead>
                  <tbody>
                    {users.filter(u=>u.role==="chauffeur").map(u => (
                      <tr key={u._id} className={styles.tr}>
                        <td>
                          <div className={styles.userCell}>
                            <div className={styles.avatar}>{u.firstName?.[0]?.toUpperCase()||"?"}</div>
                            <strong>{u.firstName} {u.lastName}</strong>
                          </div>
                        </td>
                        <td className={styles.tdEmail}>{u.email}</td>
                        <td>{u.isActive ? <Badge label="Actif" color="#10b981" bg="#ecfdf5" /> : <Badge label="Bloqué" color="#ef4444" bg="#fef2f2" />}</td>
                        <td className={styles.tdDate}>{fmtDate(u.createdAt)}</td>
                        <td>
                          <button className={u.isActive ? styles.btnBlock : styles.btnUnblock}
                            onClick={() => setConfirm({ message:`${u.isActive?"Bloquer":"Débloquer"} ${u.firstName} ?`, action:()=>toggleBlock(u._id) })}>
                            {u.isActive ? "🚫 Bloquer" : "✅ Débloquer"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB NOTIFICATIONS ══════════════════════ */}
      {activeTab === "notifications" && (
        <div className={styles.tabContent}>
          <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 1.5rem" }}>🔔 Centre de notifications</h2>

          {/* Broadcast */}
          <div className={styles.chartCard} style={{ marginBottom:"1.5rem" }}>
            <h3 className={styles.chartTitle}>📢 Envoyer une notification groupée</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:10, maxWidth:520 }}>
              <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
                placeholder="Titre *" value={broadcastForm.titre}
                onChange={e => setBroadcastForm({ ...broadcastForm, titre: e.target.value })} />
              <textarea style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", resize:"vertical", fontFamily:"inherit" }}
                rows={3} placeholder="Message *" value={broadcastForm.message}
                onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              <select style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem" }}
                value={broadcastForm.targetRole} onChange={e => setBroadcastForm({ ...broadcastForm, targetRole: e.target.value })}>
                <option value="all">Tous les utilisateurs</option>
                <option value="client">Clients uniquement</option>
                <option value="partenaire">Partenaires uniquement</option>
                <option value="chauffeur">Chauffeurs uniquement</option>
                <option value="importateur">Importateurs</option>
              </select>
              <input style={{ borderRadius:8, border:"1.5px solid #e2e8f0", padding:"10px 14px", fontSize:"0.9rem", fontFamily:"inherit" }}
                placeholder="Lien interne (ex: /catalogue) — optionnel" value={broadcastForm.lien}
                onChange={e => setBroadcastForm({ ...broadcastForm, lien: e.target.value })} />
              <button className={styles.btnPrimary} style={{ width:"fit-content" }}
                disabled={broadcastSending} onClick={sendBroadcast}>
                {broadcastSending ? "Envoi en cours…" : "📤 Envoyer la notification"}
              </button>
            </div>
          </div>

          {/* Canaux disponibles */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>📡 Canaux de communication</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
              {[
                { icon:"🔔", label:"Notifications in-app",  status:"Actif",       color:"#10b981" },
                { icon:"📧", label:"Email (Nodemailer)",    status:"À configurer", color:"#f59e0b" },
                { icon:"📱", label:"SMS",                   status:"Bientôt",     color:"#94a3b8" },
                { icon:"💬", label:"WhatsApp Business",     status:"Bientôt",     color:"#94a3b8" },
                { icon:"🌐", label:"Push Web (PWA)",        status:"Bientôt",     color:"#94a3b8" },
              ].map(c => (
                <div key={c.label} style={{ background:"#f8fafc", borderRadius:12, padding:"16px", border:"1.5px solid #e2e8f0" }}>
                  <div style={{ fontSize:"1.5rem", marginBottom:8 }}>{c.icon}</div>
                  <div style={{ fontWeight:700, fontSize:"0.88rem", color:"#0f1b3f", marginBottom:4 }}>{c.label}</div>
                  <Badge label={c.status} color={c.color} bg={c.color+"18"} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ WIP STUBS ══════════════════════ */}
      {activeTab === "analytics" && <WipSection icon="📈" title="Analytics Avancé" subtitle="Rapports financiers, analyse par pays, prévisions de croissance et tendances du marché automobile." features={["Rapports financiers détaillés (CA, bénéfices, marges)","Analyse par pays et par devise","Graphiques de croissance mensuelle / annuelle","Export PDF / Excel","Comparaison des performances par région"]} />}
      {activeTab === "transport"   && <WipSection icon="🚢" title="Transport International" subtitle="Suivi des cargaisons, gestion des compagnies de transport et documents douaniers." features={["Gestion compagnies maritimes / routières / aériennes","Suivi GPS des cargaisons en temps réel","Documents de transport : BL, CMR, Factures","Coordination douane & transit international"]} />}
      {activeTab === "financement" && <WipSection icon="🏦" title="Financement Automobile" subtitle="Crédit auto, simulation de mensualités et intégration des partenaires financiers." features={["Demandes de crédit automobile en ligne","Simulation de mensualités et taux","Intégration banques & sociétés de leasing","Décision rapide : Accepté / Refusé / En étude"]} />}
      {activeTab === "assurance"   && <WipSection icon="🔒" title="Assurance Automobile" subtitle="Gestion des demandes d'assurance auto, location et import/export." features={["Demandes assurance : auto / location / import","Gestion des sinistres et indemnisations","Partenaires assureurs intégrés","Renouvellement automatique"]} />}
      {activeTab === "paiements"   && <WipSection icon="💳" title="Tableau de Bord Paiements" subtitle="Transactions en temps réel, détection de fraude et intégration des passerelles de paiement." features={["Transactions en temps réel (Stripe, Orange Money, Wave)","Détection automatique de fraude","Blocage / validation / remboursement","Rapports financiers par devise et par pays"]} />}
      {activeTab === "escrow"      && <WipSection icon="🔐" title="Compte Séquestre (Escrow)" subtitle="Sécurisez les transactions : fonds bloqués à la commande, libérés après confirmation du service." features={["Blocage des fonds à la commande","Libération conditionnelle après service effectué","Remboursement immédiat en cas de litige","Traçabilité complète des flux financiers"]} />}
      {activeTab === "partner_verif" && (
        <PartnerVerifSection
          token={token}
          headers={headers}
          pvList={pvList}
          pvStats={pvStats}
          pvLoading={pvLoading}
          pvFilter={pvFilter}
          setPvFilter={setPvFilter}
          pvDetail={pvDetail}
          setPvDetail={setPvDetail}
          pvCreateModal={pvCreateModal}
          setPvCreateModal={setPvCreateModal}
          pvCreateForm={pvCreateForm}
          setPvCreateForm={setPvCreateForm}
          pvSaving={pvSaving}
          setPvSaving={setPvSaving}
          pvCriterionLoading={pvCriterionLoading}
          setPvCriterionLoading={setPvCriterionLoading}
          users={users}
          onRefresh={loadPartnerVerif}
          showToast={showToast}
        />
      )}
      {/* ══════════════════════ TAB PMS PARTNERS ══════════════════════ */}
      {activeTab === "pms_partners" && (
        <div className={styles.tabContent}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.2rem", flexWrap:"wrap", gap:12 }}>
            <div>
              <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🏪 Partner Hub PMS</h2>
              <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Showrooms, leads et devis de tous les partenaires.</p>
            </div>
            <button className={styles.btnRefresh} onClick={loadPMSAdmin}>↻ Actualiser</button>
          </div>

          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:"1.5rem" }}>
            {[
              { icon:"🏪", label:"Showrooms total",  value: pmsStats?.totalShowrooms  || 0, color:"#6366f1" },
              { icon:"🌐", label:"Publiés",           value: pmsStats?.publishedShowrooms || 0, color:"#10b981" },
              { icon:"🎯", label:"Leads total",       value: pmsStats?.totalLeads      || 0, color:"#3b82f6" },
              { icon:"🏆", label:"Leads gagnés",      value: pmsStats?.wonLeads        || 0, color:"#059669" },
              { icon:"📄", label:"Devis total",       value: pmsStats?.totalQuotes     || 0, color:"#8b5cf6" },
              { icon:"✅", label:"Devis acceptés",    value: pmsStats?.acceptedQuotes  || 0, color:"#d97706" },
            ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
          </div>

          {/* Filtres */}
          <div className={styles.filterBar}>
            {[
              { v:"all",       l:"Tous les showrooms" },
              { v:"published", l:"✅ Publiés" },
              { v:"hidden",    l:"👁 Non publiés" },
            ].map(f => (
              <button key={f.v} onClick={() => { setPmsFilter(f.v); }}
                style={{ padding:"6px 14px", borderRadius:8, border:`2px solid ${pmsFilter===f.v?"#6366f1":"#e2e8f0"}`,
                  background: pmsFilter===f.v?"#6366f1":"#fff", color: pmsFilter===f.v?"#fff":"#374151",
                  fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                {f.l}
              </button>
            ))}
          </div>

          {/* Table showrooms */}
          {pmsLoading ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>Chargement…</div>
          ) : pmsShowrooms.length === 0 ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
              <div style={{ fontSize:"3rem", marginBottom:12 }}>🏪</div>
              <p style={{ fontWeight:600 }}>Aucun showroom partenaire pour le moment.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Partenaire</th>
                    <th>Showroom</th>
                    <th>Pays</th>
                    <th>Trust Score</th>
                    <th>Vues</th>
                    <th>KYC</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pmsShowrooms.map((s) => {
                    const p = s.partnerId || {};
                    const KYC_COLOR = { VERIFIE:"#16a34a", EN_ATTENTE:"#d97706", REFUSE:"#dc2626" };
                    const kycColor = KYC_COLOR[p.kycStatus] || "#94a3b8";
                    const score = s.trustScore?.overall || 0;
                    const scoreColor = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
                    return (
                      <tr key={s._id} className={styles.tr}>
                        <td>
                          <div style={{ fontWeight:700, fontSize:".85rem" }}>
                            {p.firstName} {p.lastName}
                          </div>
                          <div style={{ fontSize:".73rem", color:"#64748b" }}>{p.email}</div>
                          <div style={{ fontSize:".72rem", marginTop:2 }}>
                            <span style={{ color: kycColor, fontWeight:700 }}>
                              {p.kycStatus === "VERIFIE" ? "✅ KYC" : p.kycStatus === "REFUSE" ? "❌ KYC" : "⏳ KYC"}
                            </span>
                            {!p.isActive && <span style={{ marginLeft:6, color:"#ef4444", fontWeight:700 }}>● Bloqué</span>}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight:700, fontSize:".85rem" }}>{s.companyName || "—"}</div>
                          {s.tagline && <div style={{ fontSize:".73rem", color:"#64748b" }}>{s.tagline}</div>}
                          {s.slug && <div style={{ fontSize:".72rem", color:"#94a3b8" }}>/{s.slug}</div>}
                        </td>
                        <td style={{ fontSize:".82rem" }}>{s.country || "—"}</td>
                        <td>
                          <span style={{ fontWeight:800, color: scoreColor, fontSize:".9rem" }}>{score}/100</span>
                        </td>
                        <td style={{ fontSize:".82rem", color:"#64748b" }}>{s.viewCount || 0}</td>
                        <td>
                          {p.certificationBadge === "premium"   && <Badge label="⭐ Premium"   color="#7c3aed" bg="#ede9fe" />}
                          {p.certificationBadge === "fondateur" && <Badge label="🏆 Fondateur" color="#d97706" bg="#fef3c7" />}
                          {p.certificationBadge === "verifie"   && <Badge label="🟢 Vérifié"  color="#16a34a" bg="#dcfce7" />}
                          {!p.certificationBadge && <span style={{ color:"#cbd5e1", fontSize:".75rem" }}>—</span>}
                        </td>
                        <td>
                          {s.isPublished
                            ? <Badge label="🌐 En ligne"   color="#16a34a" bg="#dcfce7" />
                            : <Badge label="👁 Brouillon"  color="#d97706" bg="#fef3c7" />}
                        </td>
                        <td>
                          <div className={styles.actionBtns}>
                            <button
                              onClick={() => adminToggleShowroom(s._id)}
                              style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid",
                                borderColor: s.isPublished ? "#fca5a5" : "#86efac",
                                background:  s.isPublished ? "#fef2f2" : "#f0fdf4",
                                color:       s.isPublished ? "#dc2626" : "#16a34a",
                                fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                              {s.isPublished ? "Dépublier" : "Publier"}
                            </button>
                            {s.slug && (
                              <a href={`/showroom/${s.slug}`} target="_blank" rel="noopener noreferrer"
                                style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid #bfdbfe",
                                  background:"#eff6ff", color:"#2563eb", fontWeight:700,
                                  fontSize:".75rem", textDecoration:"none" }}>
                                Voir →
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "founding_partners" && (() => {
        const ST = {
          brouillon:    { l: "Brouillon",      c: "#94a3b8", bg: "#f8fafc" },
          soumis:       { l: "Soumis ⏳",      c: "#d97706", bg: "#fef3c7" },
          en_review:    { l: "En Review",      c: "#3b82f6", bg: "#eff6ff" },
          loi_envoyee:  { l: "LOI Envoyée",    c: "#7c3aed", bg: "#f5f3ff" },
          loi_signee:   { l: "LOI Signée ✓",  c: "#059669", bg: "#d1fae5" },
          accord_envoye:{ l: "Accord Envoyé",  c: "#f59e0b", bg: "#fff7ed" },
          accord_signe: { l: "Accord Signé ✓", c: "#059669", bg: "#d1fae5" },
          actif:        { l: "Actif 🌟",       c: "#16a34a", bg: "#dcfce7" },
          rejete:       { l: "Rejeté",         c: "#dc2626", bg: "#fee2e2" },
          info_demandee:{ l: "Info Requise",   c: "#d97706", bg: "#fef3c7" },
        };
        return (
          <div className={styles.tabContent}>
            {/* Header + vue toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🌟 Founding Partners</h2>
                <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Programme exclusif — 20 partenaires fondateurs maximum.</p>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ display:"flex", background:"#f1f5f9", borderRadius:10, padding:3, gap:2 }}>
                  {[{v:"onboarding",l:"📋 Onboarding"},{v:"crm",l:"🗂️ CRM Directory"}].map(({v,l})=>(
                    <button key={v} onClick={()=>setFoundingView(v)}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", fontWeight:700, fontSize:".8rem", cursor:"pointer",
                        background: foundingView===v ? "#0f1b3f" : "transparent",
                        color: foundingView===v ? "#fff" : "#64748b" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <button className={styles.btnRefresh} onClick={loadFoundingPartners}>↻</button>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:"1.2rem" }}>
              {[
                { icon:"📋", label:"Total dossiers",    value: foundingStats?.total        || 0, color:"#0f1b3f" },
                { icon:"⏳", label:"En attente",         value: foundingPending              || 0, color:"#d97706" },
                { icon:"✍️", label:"LOI envoyées",       value: foundingStats?.byStatus?.loi_envoyee || 0, color:"#7c3aed" },
                { icon:"📜", label:"Accords envoyés",    value: foundingStats?.byStatus?.accord_envoye || 0, color:"#f59e0b" },
                { icon:"🌟", label:"Fondateurs actifs",  value: foundingStats?.activeFounders || 0, color:"#16a34a" },
                { icon:"❌", label:"Rejetés",             value: foundingStats?.byStatus?.rejete || 0, color:"#dc2626" },
              ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
            </div>

            {/* ── VUE CRM DIRECTORY ──────────────────────────────────────────── */}
            {foundingView === "crm" && (() => {
              const CRM_STATUS = {
                interested: { l:"Intéressé",  c:"#d97706", bg:"#fef3c7" },
                reserved:   { l:"Réservé",    c:"#7c3aed", bg:"#f5f3ff" },
                verified:   { l:"Vérifié ✓",  c:"#0284c7", bg:"#e0f2fe" },
                active:     { l:"Actif 🌟",   c:"#16a34a", bg:"#dcfce7" },
                inactive:   { l:"Inactif",    c:"#94a3b8", bg:"#f8fafc" },
              };
              const PRIORITY_ST = {
                high:   { l:"🔴 Haute",   c:"#dc2626" },
                medium: { l:"🟡 Moyenne", c:"#d97706" },
                low:    { l:"🟢 Basse",   c:"#16a34a" },
              };
              const CHANNELS = { whatsapp:"WhatsApp", wechat:"WeChat", email:"Email", phone:"Téléphone", meeting:"RDV", other:"Autre", "":"—" };
              const today = new Date();
              const overdue = (d) => d && new Date(d) < today;

              const filtered = foundingCRMFilter
                ? foundingList.filter(o => (o.adminCRM?.crmStatus || "interested") === foundingCRMFilter)
                : foundingList;

              return (
                <div>
                  {/* Barre de filtres CRM */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, alignItems:"center" }}>
                    <span style={{ fontSize:".8rem", fontWeight:700, color:"#64748b" }}>Filtrer :</span>
                    {[{v:"",l:"Tous"},
                      {v:"interested",l:"Intéressé"},
                      {v:"reserved",l:"Réservé"},
                      {v:"verified",l:"Vérifié"},
                      {v:"active",l:"Actif"},
                      {v:"inactive",l:"Inactif"},
                    ].map(({v,l})=>(
                      <button key={v} onClick={()=>setFoundingCRMFilter(v)}
                        style={{ padding:"5px 12px", borderRadius:20, border:"1.5px solid", fontWeight:700, fontSize:".76rem", cursor:"pointer",
                          borderColor: foundingCRMFilter===v ? "#0f1b3f" : "#e2e8f0",
                          background: foundingCRMFilter===v ? "#0f1b3f" : "#fff",
                          color: foundingCRMFilter===v ? "#fff" : "#64748b" }}>
                        {l}
                      </button>
                    ))}
                    <span style={{ marginLeft:"auto", fontSize:".76rem", color:"#94a3b8" }}>{filtered.length} entrée(s)</span>
                  </div>

                  {/* Table CRM */}
                  {foundingLoading ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>Chargement…</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"2rem", color:"#94a3b8" }}>
                      <div style={{ fontSize:"2rem", marginBottom:8 }}>🗂️</div>
                      <p style={{ fontWeight:600 }}>Aucun partenaire dans ce filtre.</p>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {filtered.map((o) => {
                        const crm   = o.adminCRM || {};
                        const ci    = o.companyInfo || {};
                        const bv    = o.businessVerification || {};
                        const crmSt = CRM_STATUS[crm.crmStatus || "interested"] || CRM_STATUS.interested;
                        const pri   = PRIORITY_ST[crm.priority || "medium"] || PRIORITY_ST.medium;
                        const isEdit = foundingCRMEdit?.id === o._id;
                        const editData = foundingCRMEdit?.data || {};

                        return (
                          <div key={o._id} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.04)" }}>
                            {/* Ligne principale CRM */}
                            <div style={{ display:"grid", gridTemplateColumns:"2fr 1.5fr 1.5fr 1fr 1fr auto", gap:12, padding:"12px 16px", alignItems:"center" }}>
                              {/* Entreprise */}
                              <div>
                                <div style={{ fontWeight:800, fontSize:".88rem", color:"#0f1b3f" }}>{ci.legalName || "—"}</div>
                                <div style={{ fontSize:".74rem", color:"#64748b", marginTop:2 }}>
                                  {ci.registrationCountry || "—"} · {bv.entityTypes?.join(", ") || "—"}
                                </div>
                                <div style={{ fontSize:".73rem", color:"#94a3b8", marginTop:1 }}>
                                  {bv.brands?.slice(0,3).join(", ") || "—"}
                                  {bv.brands?.length > 3 ? ` +${bv.brands.length - 3}` : ""}
                                </div>
                              </div>
                              {/* Contact */}
                              <div style={{ fontSize:".8rem" }}>
                                <div style={{ fontWeight:600, color:"#0f1b3f" }}>{ci.mainContact || `${(o.userId?.firstName||"")} ${(o.userId?.lastName||"")}`}</div>
                                {ci.whatsapp && <div style={{ color:"#16a34a", marginTop:1 }}>📱 {ci.whatsapp}</div>}
                                {ci.wechat   && <div style={{ color:"#07c160", marginTop:1 }}>💬 {ci.wechat}</div>}
                                {ci.email    && <div style={{ color:"#3b82f6", marginTop:1 }}>✉️ {ci.email}</div>}
                              </div>
                              {/* Dernière contact / Next follow-up */}
                              <div style={{ fontSize:".78rem" }}>
                                <div style={{ color:"#64748b" }}>
                                  Dernier contact : <strong style={{ color:"#0f1b3f" }}>
                                    {crm.lastContactDate ? new Date(crm.lastContactDate).toLocaleDateString("fr-FR") : "—"}
                                  </strong>
                                  {crm.lastContactChannel && <span style={{ color:"#94a3b8" }}> via {CHANNELS[crm.lastContactChannel]}</span>}
                                </div>
                                <div style={{ marginTop:4, color: overdue(crm.nextFollowUpDate) ? "#dc2626" : "#64748b" }}>
                                  Prochain suivi : <strong style={{ color: overdue(crm.nextFollowUpDate) ? "#dc2626" : "#0f1b3f" }}>
                                    {crm.nextFollowUpDate ? new Date(crm.nextFollowUpDate).toLocaleDateString("fr-FR") : "—"}
                                  </strong>
                                  {overdue(crm.nextFollowUpDate) && <span style={{ color:"#dc2626", fontWeight:700 }}> ⚠️ En retard</span>}
                                </div>
                                {crm.internalNotes && (
                                  <div style={{ marginTop:4, color:"#64748b", fontSize:".72rem", fontStyle:"italic",
                                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}
                                    title={crm.internalNotes}>
                                    📝 {crm.internalNotes}
                                  </div>
                                )}
                              </div>
                              {/* CRM Status */}
                              <div style={{ textAlign:"center" }}>
                                <span style={{ display:"inline-block", fontSize:".72rem", fontWeight:700, padding:"4px 10px", borderRadius:20,
                                  background:crmSt.bg, color:crmSt.c }}>
                                  {crmSt.l}
                                </span>
                              </div>
                              {/* Priorité */}
                              <div style={{ textAlign:"center", fontSize:".76rem", fontWeight:700, color:pri.c }}>{pri.l}</div>
                              {/* Actions */}
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => setFoundingCRMEdit(isEdit ? null : { id: o._id, data: {
                                  crmStatus:          crm.crmStatus || "interested",
                                  lastContactDate:    crm.lastContactDate ? new Date(crm.lastContactDate).toISOString().slice(0,10) : "",
                                  lastContactChannel: crm.lastContactChannel || "",
                                  nextFollowUpDate:   crm.nextFollowUpDate  ? new Date(crm.nextFollowUpDate).toISOString().slice(0,10) : "",
                                  internalNotes:      crm.internalNotes || "",
                                  priority:           crm.priority || "medium",
                                }})}
                                  style={{ padding:"5px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, background: isEdit ? "#0f1b3f" : "#fff",
                                    color: isEdit ? "#fff" : "#64748b", fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                                  {isEdit ? "✕" : "✏️"}
                                </button>
                                {ci.whatsapp && (
                                  <a href={`https://wa.me/${ci.whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                                    style={{ display:"flex", alignItems:"center", padding:"5px 10px", border:"1.5px solid #dcfce7",
                                      borderRadius:8, background:"#f0fdf4", color:"#16a34a", fontWeight:700, fontSize:".75rem", textDecoration:"none" }}>
                                    WA
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Formulaire d'édition CRM inline */}
                            {isEdit && (
                              <div style={{ borderTop:"1px solid #f1f5f9", padding:"14px 16px", background:"#f8fafc" }}>
                                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12, marginBottom:12 }}>
                                  {/* CRM Status */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Statut CRM</label>
                                    <select value={editData.crmStatus}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, crmStatus: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="interested">Intéressé</option>
                                      <option value="reserved">Réservé</option>
                                      <option value="verified">Vérifié</option>
                                      <option value="active">Actif</option>
                                      <option value="inactive">Inactif</option>
                                    </select>
                                  </div>
                                  {/* Priorité */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Priorité</label>
                                    <select value={editData.priority}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, priority: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="high">🔴 Haute</option>
                                      <option value="medium">🟡 Moyenne</option>
                                      <option value="low">🟢 Basse</option>
                                    </select>
                                  </div>
                                  {/* Dernier contact */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Dernier contact</label>
                                    <input type="date" value={editData.lastContactDate}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, lastContactDate: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", boxSizing:"border-box" }} />
                                  </div>
                                  {/* Canal */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Canal</label>
                                    <select value={editData.lastContactChannel}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, lastContactChannel: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem" }}>
                                      <option value="">— Sélectionner</option>
                                      <option value="whatsapp">WhatsApp</option>
                                      <option value="wechat">WeChat</option>
                                      <option value="email">Email</option>
                                      <option value="phone">Téléphone</option>
                                      <option value="meeting">RDV physique</option>
                                      <option value="other">Autre</option>
                                    </select>
                                  </div>
                                  {/* Prochain suivi */}
                                  <div>
                                    <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Prochain suivi</label>
                                    <input type="date" value={editData.nextFollowUpDate}
                                      onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, nextFollowUpDate: e.target.value } }))}
                                      style={{ width:"100%", padding:"6px 8px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", boxSizing:"border-box" }} />
                                  </div>
                                </div>
                                {/* Notes internes */}
                                <div style={{ marginBottom:12 }}>
                                  <label style={{ fontSize:".73rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:4 }}>Notes internes</label>
                                  <textarea value={editData.internalNotes}
                                    onChange={e => setFoundingCRMEdit(prev => ({ ...prev, data: { ...prev.data, internalNotes: e.target.value } }))}
                                    rows={2}
                                    placeholder="Observations, historique, points clés de la négociation…"
                                    style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:".82rem", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                                </div>
                                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                  <button onClick={() => setFoundingCRMEdit(null)}
                                    style={{ padding:"7px 16px", border:"1.5px solid #e2e8f0", borderRadius:8, background:"#fff", color:"#64748b", fontWeight:700, fontSize:".82rem", cursor:"pointer" }}>
                                    Annuler
                                  </button>
                                  <button onClick={() => foundingUpdateCRM(o._id, editData)}
                                    style={{ padding:"7px 18px", border:"none", borderRadius:8, background:"#0f1b3f", color:"#fff", fontWeight:800, fontSize:".82rem", cursor:"pointer" }}>
                                    💾 Sauvegarder
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── VUE ONBOARDING ─────────────────────────────────────────────── */}
            {/* ── Lien d'invitation universel ─────────────────────────────────── */}
            {(() => {
              if (foundingView !== "onboarding") return null;
              const inviteLink = `${window.location.origin}/partner-onboarding`;
              const waMsg = encodeURIComponent(
                `Bonjour ! 👋\n\nVIT-AUTO vous invite à rejoindre notre *Programme Partenaire Fondateur* — places limitées à 20 partenaires.\n\n✅ *Avantages exclusifs Founding Partner :*\n• Commission Location : *10%* (standard 15%)\n• Commission Vente : *2%* (standard 3%)\n• Abonnement Premium *OFFERT 12 mois* (valeur 300€+)\n• Badge exclusif *"Founding Partner"* sur toutes vos annonces\n• Placement prioritaire dans le catalogue international\n• Accès anticipé à toutes les nouvelles fonctionnalités\n\n🔗 *Inscrivez-vous et déposez votre dossier directement ici :*\n${inviteLink}\n\nDes questions ? Contactez-nous : contact@vit-auto.com\n\n_VIT-AUTO — Plateforme Automobile Internationale_`
              );
              const mailSubject = encodeURIComponent("Rejoignez le Programme Founding Partner VIT-AUTO");
              const mailBody = encodeURIComponent(
                `Bonjour,\n\nVIT-AUTO vous invite à rejoindre son Programme Partenaire Fondateur — places limitées à 20 partenaires.\n\nAvantages exclusifs Founding Partner :\n• Commission Location : 10% (standard 15%)\n• Commission Vente : 2% (standard 3%)\n• Abonnement Premium OFFERT 12 mois (valeur 300€+)\n• Badge exclusif "Founding Partner" sur toutes vos annonces\n• Placement prioritaire dans le catalogue international\n\nInscrivez-vous et déposez votre dossier directement ici :\n${inviteLink}\n\nCordialement,\nManassé N'DRI N'GUESSAN — Founder & CEO\nVIT-AUTO | contact@vit-auto.com`
              );
              return (
                <div style={{ background:"#fff", border:"2px solid #e2e8f0", borderRadius:14, padding:"18px 20px", marginBottom:"1.5rem" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                    <span style={{ fontSize:"1.3rem" }}>🔗</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f" }}>Lien d'invitation universel</div>
                      <div style={{ fontSize:".76rem", color:"#64748b" }}>À envoyer à n'importe quel partenaire potentiel — fonctionne pour tout le monde, tant qu'il reste des places</div>
                    </div>
                  </div>
                  {/* Lien */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"10px 14px", marginBottom:12, flexWrap:"wrap" }}>
                    <code style={{ flex:1, fontSize:".82rem", color:"#0f1b3f", fontFamily:"monospace", wordBreak:"break-all" }}>{inviteLink}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteLink); showToast("Lien copié !", "success"); }}
                      style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#0f1b3f", color:"#fff", fontWeight:700, fontSize:".78rem", cursor:"pointer", whiteSpace:"nowrap" }}>
                      📋 Copier
                    </button>
                  </div>
                  {/* Boutons de partage */}
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#25D366", color:"#fff", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:800, fontSize:".82rem" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                    <a href={`mailto:?subject=${mailSubject}&body=${mailBody}`}
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#3b82f6", color:"#fff", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:800, fontSize:".82rem" }}>
                      ✉️ Email
                    </a>
                    <a href={inviteLink} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:7, background:"#f8fafc", color:"#0f1b3f", textDecoration:"none", padding:"9px 16px", borderRadius:10, fontWeight:700, fontSize:".82rem", border:"1.5px solid #e2e8f0" }}>
                      👁 Aperçu
                    </a>
                  </div>
                  <p style={{ margin:"10px 0 0", fontSize:".73rem", color:"#94a3b8" }}>
                    Ce lien fonctionne pour tout partenaire : s'il n'a pas de compte → il s'inscrit puis accède au portail. S'il a déjà un compte partenaire → il arrive directement sur son dossier. Les 20 places du programme restent la seule limite — au-delà, l'inscription affiche automatiquement "programme complet".
                  </p>
                </div>
              );
            })()}

            {/* Lien sécurisé généré (à envoyer par WhatsApp) */}
            {foundingView === "onboarding" && foundingSignLink && (
              <div style={{ background:"linear-gradient(135deg,#0f1b3f,#1a3a6e)", borderRadius:14, padding:"20px 24px", marginBottom:"1.5rem", color:"#fff" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:"1.5rem" }}>🔐</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:"1rem" }}>
                      Lien sécurisé généré — {foundingSignLink.type === "loi" ? "LOI" : "Accord de Partenariat"}
                    </div>
                    <div style={{ fontSize:".8rem", opacity:.75 }}>{foundingSignLink.companyName} · Valable 7 jours · Usage unique</div>
                  </div>
                  <button onClick={() => setFoundingSignLink(null)}
                    style={{ marginLeft:"auto", background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:".8rem" }}>
                    ✕ Fermer
                  </button>
                </div>
                {/* Lien affiché */}
                <div style={{ background:"rgba(0,0,0,.3)", borderRadius:10, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <code style={{ flex:1, fontSize:".78rem", color:"#93c5fd", wordBreak:"break-all", fontFamily:"monospace" }}>
                    {foundingSignLink.link}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(foundingSignLink.link); showToast("Lien copié !", "success"); }}
                    style={{ background:"#ff4d2d", border:"none", color:"#fff", borderRadius:8, padding:"8px 16px", fontWeight:700, cursor:"pointer", fontSize:".82rem", whiteSpace:"nowrap" }}>
                    📋 Copier
                  </button>
                </div>
                {/* Boutons de partage */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      foundingSignLink.type === "loi"
                        ? `Bonjour ! Votre Lettre d'Intention VIT-AUTO (${foundingSignLink.companyName}) est prête pour signature. Cliquez ici pour lire et signer votre LOI : ${foundingSignLink.link}\n\nCe lien est sécurisé, valable 7 jours et à usage unique.\n\nVIT-AUTO — contact@vit-auto.com`
                        : `Bonjour ! Votre Accord de Partenariat Fondateur VIT-AUTO (${foundingSignLink.companyName}) est prêt. Cliquez ici pour signer et activer votre statut Founding Partner : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nVIT-AUTO — contact@vit-auto.com`
                    )}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#25D366", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:800, fontSize:".88rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Envoyer via WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=VIT-AUTO%20—%20${encodeURIComponent(foundingSignLink.type === "loi" ? "Votre LOI est prête" : "Votre Accord est prêt")}&body=${encodeURIComponent(
                      foundingSignLink.type === "loi"
                        ? `Bonjour,\n\nVotre Lettre d'Intention VIT-AUTO est prête pour signature.\n\nCliquez ici pour signer : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nCordialement,\nVIT-AUTO — contact@vit-auto.com`
                        : `Bonjour,\n\nVotre Accord de Partenariat Fondateur VIT-AUTO est prêt.\n\nCliquez ici pour signer et activer votre statut : ${foundingSignLink.link}\n\nCe lien expire dans 7 jours.\n\nCordialement,\nVIT-AUTO — contact@vit-auto.com`
                    )}`}
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#3b82f6", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:800, fontSize:".88rem" }}>
                    ✉️ Email manuel
                  </a>
                  <a href={foundingSignLink.link} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.15)", color:"#fff", textDecoration:"none", padding:"10px 18px", borderRadius:10, fontWeight:700, fontSize:".88rem", border:"1.5px solid rgba(255,255,255,.25)" }}>
                    🔗 Ouvrir le lien
                  </a>
                </div>
              </div>
            )}

            {/* Modal Approbation / Rejet */}
            {foundingView === "onboarding" && foundingAction && (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                <div style={{ background:"#fff", borderRadius:16, padding:24, maxWidth:440, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
                  <h3 style={{ margin:"0 0 12px", color:"#0f1b3f", fontSize:"1rem", fontWeight:800 }}>
                    {foundingAction.type === "approve" ? "✅ Approuver la candidature" : "❌ Rejeter le dossier"}
                  </h3>
                  <p style={{ fontSize:".85rem", color:"#64748b", marginBottom:16 }}>
                    {foundingAction.type === "approve"
                      ? "La LOI sera générée et envoyée par email. Un lien sécurisé sera affiché ici pour partage WhatsApp."
                      : "Cette action est définitive. Le partenaire recevra une notification."}
                  </p>
                  <textarea
                    value={foundingNote}
                    onChange={e => setFoundingNote(e.target.value)}
                    placeholder={foundingAction.type === "approve" ? "Note interne (optionnelle)…" : "Motif du rejet (obligatoire)…"}
                    style={{ width:"100%", minHeight:90, padding:12, border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".85rem", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}
                  />
                  <div style={{ display:"flex", gap:10, marginTop:14 }}>
                    <button onClick={() => { setFoundingAction(null); setFoundingNote(""); }}
                      style={{ flex:1, padding:"10px", border:"1.5px solid #e2e8f0", borderRadius:10, background:"#f8fafc", cursor:"pointer", fontWeight:700, fontSize:".85rem" }}>
                      Annuler
                    </button>
                    <button
                      onClick={() => foundingAction.type === "approve"
                        ? foundingApprove(foundingAction.id, foundingNote)
                        : foundingReject(foundingAction.id, foundingNote)}
                      disabled={foundingSubmitting}
                      style={{ flex:2, padding:"10px", border:"none", borderRadius:10, cursor: foundingSubmitting ? "not-allowed" : "pointer", fontWeight:800, fontSize:".85rem", opacity: foundingSubmitting ? 0.6 : 1,
                        background: foundingAction.type === "approve" ? "#16a34a" : "#dc2626", color:"#fff" }}>
                      {foundingSubmitting ? "Envoi…" : foundingAction.type === "approve" ? "Approuver & Envoyer LOI" : "Confirmer le rejet"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Liste des dossiers */}
            {foundingView === "onboarding" && foundingLoading && (
              <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>Chargement…</div>
            )}
            {foundingView === "onboarding" && !foundingLoading && foundingList.length === 0 && (
              <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
                <div style={{ fontSize:"3rem", marginBottom:12 }}>🌟</div>
                <p style={{ fontWeight:600 }}>Aucune candidature Founding Partner pour le moment.</p>
              </div>
            )}
            {foundingView === "onboarding" && !foundingLoading && foundingList.length !== 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {foundingList.map((o) => {
                  const st = ST[o.status] || { l: o.status, c: "#64748b", bg: "#f8fafc" };
                  const user = o.userId || {};
                  const isDetail = foundingDetail === o._id;
                  return (
                    <div key={o._id} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
                      {/* Ligne principale */}
                      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", cursor:"pointer" }}
                        onClick={() => setFoundingDetail(isDetail ? null : o._id)}>
                        <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#0f1b3f,#1a3a6e)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:".9rem", flexShrink:0 }}>
                          {(o.companyInfo?.legalName || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            {o.companyInfo?.legalName || "Société non renseignée"}
                            <span style={{ fontSize:".7rem", background:st.bg, color:st.c, padding:"2px 8px", borderRadius:20, fontWeight:700 }}>{st.l}</span>
                            {o.isFoundingPartner && <span style={{ fontSize:".7rem", background:"#fef3c7", color:"#b45309", padding:"2px 8px", borderRadius:20, fontWeight:700 }}>🌟 FP</span>}
                          </div>
                          <div style={{ fontSize:".76rem", color:"#64748b", marginTop:2 }}>
                            {user.firstName} {user.lastName} · {user.email}
                            <span style={{ marginLeft:8, color:"#94a3b8" }}>Réf: {o.referenceNumber || "—"}</span>
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          {/* Actions rapides selon le statut */}
                          {["soumis","en_review"].includes(o.status) && (
                            <>
                              <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"approve" }); setFoundingNote(""); }}
                                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                                ✅ Approuver
                              </button>
                              <button onClick={e => { e.stopPropagation(); setFoundingAction({ id: o._id, type:"reject" }); setFoundingNote(""); }}
                                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:".76rem", cursor:"pointer" }}>
                                ❌ Rejeter
                              </button>
                            </>
                          )}
                          {o.status === "loi_signee" && (
                            <button onClick={e => { e.stopPropagation(); foundingSendAgreement(o._id); }}
                              disabled={foundingSubmitting}
                              style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, fontSize:".76rem", cursor: foundingSubmitting ? "not-allowed" : "pointer", opacity: foundingSubmitting ? 0.6 : 1 }}>
                              📜 Envoyer Accord
                            </button>
                          )}
                          {["loi_envoyee","accord_envoye"].includes(o.status) && (
                            <span style={{ fontSize:".75rem", color:"#7c3aed", fontWeight:600 }}>⏳ En attente signature</span>
                          )}
                          {["accord_signe","actif"].includes(o.status) && (
                            <span style={{ fontSize:".75rem", color:"#16a34a", fontWeight:700 }}>🌟 Actif</span>
                          )}
                          <span style={{ color:"#94a3b8", fontSize:".9rem" }}>{isDetail ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Détail expandable */}
                      {isDetail && (
                        <div style={{ borderTop:"1px solid #f1f5f9", padding:"16px 18px", background:"#fafbfd" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Entreprise</div>
                              <div style={{ fontSize:".84rem", color:"#0f1b3f", fontWeight:700 }}>{o.companyInfo?.legalName || "—"}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.registrationCountry || "—"} · {o.companyInfo?.email || "—"}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.phone || "—"} · {o.companyInfo?.whatsapp || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Contact</div>
                              <div style={{ fontSize:".84rem", color:"#0f1b3f", fontWeight:700 }}>{o.companyInfo?.mainContact || `${user.firstName} ${user.lastName}`}</div>
                              <div style={{ fontSize:".77rem", color:"#64748b" }}>{o.companyInfo?.mainContactPosition || "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Commissions</div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Location: <strong>{o.commissions?.location || 10}%</strong></div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Vente: <strong>{o.commissions?.vente || 2}%</strong></div>
                              <div style={{ fontSize:".82rem", color:"#0f1b3f" }}>Chauffeur: <strong>{o.commissions?.chauffeur || 10}%</strong></div>
                            </div>
                            <div>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Documents LOI/Accord</div>
                              <div style={{ fontSize:".8rem" }}>
                                LOI: {o.loi?.signedAt ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ Signée {new Date(o.loi.signedAt).toLocaleDateString("fr-FR")}</span> : o.loi?.sentAt ? <span style={{ color:"#7c3aed" }}>Envoyée</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                              </div>
                              <div style={{ fontSize:".8rem" }}>
                                Accord: {o.agreement?.signedAt ? <span style={{ color:"#16a34a", fontWeight:700 }}>✓ Signé {new Date(o.agreement.signedAt).toLocaleDateString("fr-FR")}</span> : o.agreement?.sentAt ? <span style={{ color:"#f59e0b" }}>Envoyé</span> : <span style={{ color:"#94a3b8" }}>—</span>}
                              </div>
                              {o.loi?.signerName && <div style={{ fontSize:".76rem", color:"#64748b", marginTop:4 }}>Signataire: {o.loi.signerName}</div>}
                            </div>
                          </div>
                          <FoundingDocs o={o} />
                          {/* Regénérer le lien sécurisé */}
                          {o.status === "loi_envoyee" && (
                            <div style={{ background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                              <p style={{ margin:"0 0 8px", fontSize:".8rem", color:"#4c1d95", fontWeight:700 }}>🔐 Partenaire n'a pas encore signé la LOI</p>
                              <p style={{ margin:"0 0 10px", fontSize:".77rem", color:"#6d28d9" }}>Vous pouvez re-générer et re-partager un nouveau lien en approuvant à nouveau si nécessaire.</p>
                            </div>
                          )}
                          {o.status === "accord_envoye" && (
                            <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"10px 14px", marginTop:8 }}>
                              <p style={{ margin:"0 0 8px", fontSize:".8rem", color:"#92400e", fontWeight:700 }}>⏳ En attente de signature de l'accord</p>
                              <button
                                onClick={() => { foundingSendAgreement(o._id); }}
                                disabled={foundingSubmitting}
                                style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#f59e0b", color:"#fff", fontWeight:700, fontSize:".78rem", cursor: foundingSubmitting ? "not-allowed" : "pointer", opacity: foundingSubmitting ? 0.6 : 1 }}>
                                🔄 Renvoyer l'accord
                              </button>
                            </div>
                          )}
                          {o.auditLog?.length > 0 && (
                            <div style={{ marginTop:12 }}>
                              <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>Historique</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                {o.auditLog.slice(-5).reverse().map((a, i) => (
                                  <div key={i} style={{ fontSize:".74rem", color:"#64748b", display:"flex", gap:8 }}>
                                    <span style={{ color:"#94a3b8" }}>{new Date(a.timestamp).toLocaleDateString("fr-FR")}</span>
                                    <span style={{ fontWeight:700, color:"#0f1b3f" }}>{a.action}</span>
                                    {a.note && <span>— {a.note}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === "partenaires" && <WipSection icon="🤝" title="Gestion des Partenariats" subtitle="Contrats partenaires, commissions, et tableau de bord dédié par partenaire stratégique." features={["Concessionnaires, loueurs, assureurs, banques","Contrats : date, commission, statut","Tableau de bord commissions par partenaire","Catégories : BYD, Hyundai, Total, NSIA..."]} />}
      {activeTab === "ads"         && <WipSection icon="📢" title="Publicités & Sponsoring" subtitle="Bannières publicitaires, annonces sponsorisées et gestion des campagnes marketing." features={["Bannières homepage et catégories","Véhicules sponsorisés : mise en avant","Gestion des budgets de campagne","Statistiques de clics et de conversions"]} />}
      {activeTab === "support" && (
        <div className={styles.tabContent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🎧 Support Client</h2>
              <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Conversations client_support / partner_support — file partagée entre tous les admins actifs.</p>
            </div>
            <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
              onClick={loadSupportChats}>↻ Actualiser</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, minHeight: 480, alignItems: "stretch" }}>
            {/* ── Liste des conversations ── */}
            <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e2e8f0", fontSize: ".78rem", fontWeight: 700, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                <span>{supportChats.length} conversation{supportChats.length > 1 ? "s" : ""}</span>
                {supportChats.some((c) => c.needsReply) && (
                  <span style={{ color: "#dc2626" }}>{supportChats.filter((c) => c.needsReply).length} en attente</span>
                )}
              </div>
              <div style={{ overflowY: "auto", flex: 1, maxHeight: 520 }}>
                {supportLoading && supportChats.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                ) : supportChats.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>💬</div>
                    <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Aucune conversation support.</p>
                  </div>
                ) : supportChats.map((c) => {
                  const isActive = supportActive?._id === c._id;
                  const name = c.requester ? `${c.requester.firstName} ${c.requester.lastName}` : "Utilisateur";
                  return (
                    <div key={c._id} onClick={() => openSupportChat(c)}
                      style={{
                        padding: "11px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
                        background: isActive ? "#eff6ff" : c.needsReply ? "#fffbeb" : "#fff",
                        borderBottom: "1px solid #f1f5f9",
                      }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: c.type === "partner_support" ? "#fff7ed" : "#f0f6ff",
                        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".85rem",
                        color: c.type === "partner_support" ? "#d97706" : "#3b82f6",
                      }}>
                        {(c.requester?.firstName?.[0] || "?").toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <strong style={{ fontSize: ".85rem", color: "#0f1b3f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</strong>
                          <span style={{ fontSize: ".7rem", color: "#94a3b8", flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
                        </div>
                        <div style={{ fontSize: ".76rem", color: c.needsReply ? "#92400e" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: c.needsReply ? 700 : 400 }}>
                          {c.type === "partner_support" ? "🤝 " : ""}{c.lastMessage || "Conversation ouverte"}
                        </div>
                      </div>
                      {c.unread > 0 && (
                        <span style={{ background: "#dc2626", color: "#fff", borderRadius: 99, fontSize: ".68rem", fontWeight: 800, padding: "2px 6px", flexShrink: 0 }}>{c.unread}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Fil de conversation ── */}
            <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
              {!supportActive ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: "2.4rem" }}>🎧</div>
                  <p style={{ fontSize: ".85rem", fontWeight: 600 }}>Sélectionnez une conversation pour répondre.</p>
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1.5px solid #e2e8f0", fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>
                    {supportActive.requester ? `${supportActive.requester.firstName} ${supportActive.requester.lastName}` : "Utilisateur"}
                    <span style={{ marginLeft: 8, fontSize: ".72rem", fontWeight: 600, color: "#94a3b8" }}>
                      {supportActive.type === "partner_support" ? "Support Partenaires" : "Service Client"} · {supportActive.requester?.email}
                    </span>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 420 }}>
                    {supportMsgLoading ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</div>
                    ) : supportMessages.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>Aucun message pour l'instant.</div>
                    ) : supportMessages.map((m) => {
                      const isAdminMsg = m.senderRole === "admin";
                      return (
                        <div key={m._id} style={{ alignSelf: isAdminMsg ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                          <div style={{
                            padding: "8px 12px", borderRadius: 12,
                            background: isAdminMsg ? "#0f1b3f" : "#f1f5f9",
                            color: isAdminMsg ? "#fff" : "#0f1b3f",
                            fontSize: ".85rem", whiteSpace: "pre-wrap", wordBreak: "break-word",
                          }}>
                            {m.content}
                          </div>
                          <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 3, textAlign: isAdminMsg ? "right" : "left" }}>
                            {timeAgo(m.createdAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: 12, borderTop: "1.5px solid #e2e8f0", display: "flex", gap: 8 }}>
                    <textarea
                      value={supportReply}
                      onChange={(e) => setSupportReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSupportReply(); } }}
                      placeholder="Votre réponse…"
                      rows={1}
                      style={{ flex: 1, resize: "none", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "9px 12px", fontSize: ".85rem", fontFamily: "inherit" }}
                    />
                    <button onClick={sendSupportReply} disabled={supportSending || !supportReply.trim()}
                      style={{ background: "#0f1b3f", color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 700, cursor: "pointer", fontSize: ".85rem" }}>
                      {supportSending ? "…" : "Envoyer"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {activeTab === "roles"       && <WipSection icon="🔑" title="Rôles Admin" subtitle="Gestion fine des permissions par rôle : Super Admin, Finance, KYC, Import, Support, Modérateur." features={["Super Admin — accès total","Admin Finance — paiements et commissions","Admin KYC — identités et documents","Admin Import/Export — dossiers internationaux","Admin Support — tickets clients","Modérateur — annonces et contenu"]} />}
      {activeTab === "audit"       && <WipSection icon="📜" title="Audit Logs" subtitle="Journal complet et inviolable de toutes les actions effectuées par les administrateurs." features={["Historique complet de chaque action admin","Filtres par date, admin, type d'action","Export CSV / PDF pour conformité réglementaire","Alertes automatiques sur les actions sensibles"]} />}

        </div>
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// PARTNER VERIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const CRITERIA_CONFIG = [
  { key: "businessLicense",   label: "Licence commerciale vérifiée", icon: "📋", weight: 20, desc: "RCCM, Kbis, Business License ou équivalent" },
  { key: "repIdentified",     label: "Représentant identifié",        icon: "👤", weight: 18, desc: "Identité du représentant légal confirmée" },
  { key: "exportCapacity",    label: "Capacité d'export confirmée",   icon: "🚢", weight: 18, desc: "Volume, pays, ports et modes de transport" },
  { key: "documentsReceived", label: "Documents reçus",               icon: "📁", weight: 15, desc: "Tous les documents demandés ont été fournis" },
  { key: "addressVerified",   label: "Adresse vérifiée",              icon: "📍", weight: 12, desc: "Adresse physique de l'entreprise confirmée" },
  { key: "websiteVerified",   label: "Site web vérifié",              icon: "🌐", weight: 10, desc: "Site web actif et cohérent avec le profil" },
  { key: "verificationDone",  label: "Vérification terminée",         icon: "✅", weight:  7, desc: "Dossier complet, revue finale effectuée" },
];

const TRUST_LEVEL_CONFIG = {
  non_verifie: { label: "Non vérifié", color: "#94a3b8", bg: "#f8fafc" },
  bronze:      { label: "Bronze",      color: "#92400e", bg: "#fef3c7" },
  argent:      { label: "Argent",      color: "#475569", bg: "#f1f5f9" },
  or:          { label: "Or",          color: "#b45309", bg: "#fffbeb" },
  platine:     { label: "Platine",     color: "#6d28d9", bg: "#f5f3ff" },
};

const STATUS_PV_CONFIG = {
  en_cours:   { label: "En cours",    color: "#0284c7", bg: "#e0f2fe" },
  en_attente: { label: "En attente",  color: "#d97706", bg: "#fef3c7" },
  verifie:    { label: "Vérifié",     color: "#16a34a", bg: "#dcfce7" },
  suspendu:   { label: "Suspendu",    color: "#dc2626", bg: "#fef2f2" },
  rejete:     { label: "Rejeté",      color: "#64748b", bg: "#f8fafc" },
};

const COMPANY_TYPES = [
  { value: "importateur",    label: "Importateur" },
  { value: "exportateur",    label: "Exportateur" },
  { value: "import_export",  label: "Import / Export" },
  { value: "transitaire",    label: "Transitaire" },
  { value: "concessionnaire",label: "Concessionnaire" },
  { value: "loueur",         label: "Loueur" },
  { value: "assureur",       label: "Assureur" },
  { value: "banque",         label: "Banque / Finance" },
  { value: "autre",          label: "Autre" },
];

function TrustScoreRing({ score }) {
  const r = 28; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const level = score >= 95 ? "platine" : score >= 75 ? "or" : score >= 50 ? "argent" : score >= 25 ? "bronze" : "non_verifie";
  const colors = { non_verifie: "#cbd5e1", bronze: "#d97706", argent: "#64748b", or: "#f59e0b", platine: "#8b5cf6" };
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={colors[level]} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 900, color: colors[level], lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: "0.55rem", color: "#94a3b8", fontWeight: 700 }}>/ 100</span>
      </div>
    </div>
  );
}

function PartnerVerifSection({ token, headers, pvList, pvStats, pvLoading, pvFilter, setPvFilter, pvDetail, setPvDetail, pvCreateModal, setPvCreateModal, pvCreateForm, setPvCreateForm, pvSaving, setPvSaving, pvCriterionLoading, setPvCriterionLoading, users, onRefresh, showToast }) {
  const [detailTab, setDetailTab] = useState("dossier");
  const [editInfoMode, setEditInfoMode] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState({});
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [criterionNote, setCriterionNote] = useState({});

  const openDetail = async (userId) => {
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}`, { headers });
      const d = await res.json();
      setPvDetail(d.verification || { userId: d.user, criteria: {} });
      setDetailTab("dossier");
      setEditInfoMode(false);
    } catch { showToast("Erreur chargement dossier", "error"); }
  };

  const handleCreate = async () => {
    if (!pvCreateForm.userId || !pvCreateForm.companyName) { showToast("userId et nom entreprise requis", "error"); return; }
    setPvSaving(true);
    try {
      const res = await fetch("/api/partner-verif/admin", {
        method: "POST", headers,
        body: JSON.stringify(pvCreateForm),
      });
      const d = await res.json();
      if (res.ok) {
        showToast("Dossier créé avec succès");
        setPvCreateModal(false);
        setPvCreateForm({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
        onRefresh();
        openDetail(pvCreateForm.userId);
      } else showToast(d.message || "Erreur création", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handleToggleCriterion = async (criterion, currentVal) => {
    if (!pvDetail) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvCriterionLoading(criterion);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/criterion`, {
        method: "PATCH", headers,
        body: JSON.stringify({ criterion, verified: !currentVal, note: criterionNote[criterion] || "" }),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, criteria: d.verification.criteria, trustScore: d.trustScore, trustLevel: d.trustLevel, status: d.verification.status }));
        onRefresh();
        showToast(!currentVal ? "Critère validé" : "Critère retiré");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvCriterionLoading("");
  };

  const handleUpdateInfo = async () => {
    if (!pvDetail) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/info`, {
        method: "PATCH", headers,
        body: JSON.stringify(editInfoForm),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, ...d.verification }));
        setEditInfoMode(false);
        onRefresh();
        showToast("Informations mises à jour");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handleUpdateStatus = async () => {
    if (!pvDetail || !newStatus || pvSaving) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/status`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, status: newStatus }));
        setStatusModal(null);
        onRefresh();
        showToast("Statut mis à jour");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const totalPv = pvStats?.total || 0;
  const verifPv = pvStats?.byStatus?.verifie || 0;
  const avgScore = pvStats?.avgScore || 0;

  return (
    <div className={styles.scrollZone}>
      {/* ── En-tête stats ── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#6d28d9" }}>
          <div className={styles.pvStatVal}>{totalPv}</div>
          <div className={styles.pvStatLbl}>Dossiers total</div>
        </div>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#16a34a" }}>
          <div className={styles.pvStatVal}>{verifPv}</div>
          <div className={styles.pvStatLbl}>Partenaires vérifiés</div>
        </div>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#f59e0b" }}>
          <div className={styles.pvStatVal}>{avgScore}</div>
          <div className={styles.pvStatLbl}>Score moyen / 100</div>
        </div>
        {Object.entries(pvStats?.byLevel || {}).map(([lv, cnt]) => (
          <div key={lv} className={styles.pvStatCard} style={{ borderLeftColor: TRUST_LEVEL_CONFIG[lv]?.color || "#94a3b8" }}>
            <div className={styles.pvStatVal}>{cnt}</div>
            <div className={styles.pvStatLbl}>{TRUST_LEVEL_CONFIG[lv]?.label || lv}</div>
          </div>
        ))}
      </div>

      {/* ── Filtres + bouton créer ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <input className={styles.searchInput} placeholder="Rechercher entreprise, email, pays…"
          value={pvFilter.search} onChange={(e) => setPvFilter((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && onRefresh()}
          style={{ minWidth: 220, flex: 1 }} />
        <select className={styles.filterSelect} value={pvFilter.status} onChange={(e) => setPvFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_PV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={pvFilter.trustLevel} onChange={(e) => setPvFilter((f) => ({ ...f, trustLevel: e.target.value }))}>
          <option value="">Tous niveaux</option>
          {Object.entries(TRUST_LEVEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={pvFilter.companyType} onChange={(e) => setPvFilter((f) => ({ ...f, companyType: e.target.value }))}>
          <option value="">Tous types</option>
          {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className={styles.btnPrimary} onClick={onRefresh} disabled={pvLoading}>
          {pvLoading ? "…" : "🔍 Filtrer"}
        </button>
        <button className={styles.btnPrimary} style={{ background: "#6d28d9" }} onClick={() => setPvCreateModal(true)}>
          + Nouveau dossier
        </button>
      </div>

      {/* ── Table partenaires ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Entreprise</th>
              <th>Type</th>
              <th>Pays</th>
              <th>Trust Score</th>
              <th>Niveau</th>
              <th>Critères</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pvLoading && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Chargement…</td></tr>
            )}
            {!pvLoading && pvList.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "2.5rem", color: "#94a3b8" }}>
                Aucun dossier. Cliquez sur « + Nouveau dossier » pour commencer.
              </td></tr>
            )}
            {pvList.map((pv) => {
              const verified = CRITERIA_CONFIG.filter((c) => pv.criteria?.[c.key]?.verified).length;
              const sl = STATUS_PV_CONFIG[pv.status] || STATUS_PV_CONFIG.en_cours;
              const tl = TRUST_LEVEL_CONFIG[pv.trustLevel] || TRUST_LEVEL_CONFIG.non_verifie;
              return (
                <tr key={pv._id} style={{ cursor: "pointer" }} onClick={() => openDetail(pv.userId?._id || pv.userId)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {pv.logoUrl
                        ? <img src={pv.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                        : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, color: "#64748b" }}>{pv.companyName?.[0]?.toUpperCase()}</div>
                      }
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f1b3f" }}>{pv.companyName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{pv.email || pv.userId?.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: "0.78rem", color: "#475569" }}>{COMPANY_TYPES.find((t) => t.value === pv.companyType)?.label || pv.companyType}</span></td>
                  <td><span style={{ fontSize: "0.82rem" }}>{pv.country || "—"}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 60 }}>
                        <div style={{ height: "100%", width: `${pv.trustScore}%`, background: pv.trustScore >= 75 ? "#16a34a" : pv.trustScore >= 50 ? "#f59e0b" : "#ef4444", borderRadius: 4, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f1b3f", minWidth: 28 }}>{pv.trustScore}</span>
                    </div>
                  </td>
                  <td><span className={styles.badge} style={{ color: tl.color, background: tl.bg }}>{tl.label}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {CRITERIA_CONFIG.map((c) => (
                        <span key={c.key} title={c.label}
                          style={{ fontSize: "0.85rem", opacity: pv.criteria?.[c.key]?.verified ? 1 : 0.2 }}>
                          {c.icon}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td><span className={styles.badge} style={{ color: sl.color, background: sl.bg }}>{sl.label}</span></td>
                  <td>
                    <button className={styles.btnSmall} onClick={(e) => { e.stopPropagation(); openDetail(pv.userId?._id || pv.userId); }}>
                      Ouvrir →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ Modal : Nouveau dossier ══ */}
      {pvCreateModal && (
        <div className={styles.overlay} onClick={() => setPvCreateModal(false)}>
          <div className={styles.pvModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pvModalHeader}>
              <h3 style={{ margin: 0, fontWeight: 900, fontSize: "1rem", color: "#0f1b3f" }}>Nouveau dossier partenaire</h3>
              <button className={styles.btnGhost} onClick={() => setPvCreateModal(false)}>✕</button>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "65vh", overflowY: "auto" }}>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Compte utilisateur (ID ou email)</label>
                <input className={styles.pvInput} placeholder="ID MongoDB du partenaire"
                  value={pvCreateForm.userId} onChange={(e) => setPvCreateForm((f) => ({ ...f, userId: e.target.value }))} />
                <div style={{ marginTop: 4 }}>
                  <select className={styles.pvInput} onChange={(e) => setPvCreateForm((f) => ({ ...f, userId: e.target.value, companyName: f.companyName || "" }))}>
                    <option value="">— Sélectionner dans la liste —</option>
                    {users.filter((u) => u.role === "partenaire").map((u) => (
                      <option key={u._id} value={u._id}>{u.firstName} {u.lastName} — {u.email}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Nom de l'entreprise *</label>
                <input className={styles.pvInput} placeholder="Ex : DAKAR AUTO EXPORT SARL"
                  value={pvCreateForm.companyName} onChange={(e) => setPvCreateForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Type d'entreprise</label>
                  <select className={styles.pvInput} value={pvCreateForm.companyType} onChange={(e) => setPvCreateForm((f) => ({ ...f, companyType: e.target.value }))}>
                    {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Pays</label>
                  <input className={styles.pvInput} placeholder="Côte d'Ivoire"
                    value={pvCreateForm.country} onChange={(e) => setPvCreateForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Ville</label>
                  <input className={styles.pvInput} placeholder="Abidjan"
                    value={pvCreateForm.city} onChange={(e) => setPvCreateForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Site web</label>
                  <input className={styles.pvInput} placeholder="https://"
                    value={pvCreateForm.website} onChange={(e) => setPvCreateForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Email pro</label>
                  <input className={styles.pvInput} placeholder="contact@..."
                    value={pvCreateForm.email} onChange={(e) => setPvCreateForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Téléphone</label>
                  <input className={styles.pvInput} placeholder="+225..."
                    value={pvCreateForm.phone} onChange={(e) => setPvCreateForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Description</label>
                <textarea className={styles.pvInput} rows={2} placeholder="Présentation courte de l'entreprise…"
                  value={pvCreateForm.description} onChange={(e) => setPvCreateForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Note admin interne</label>
                <textarea className={styles.pvInput} rows={2} placeholder="Notes internes (non visibles par le partenaire)…"
                  value={pvCreateForm.adminNote} onChange={(e) => setPvCreateForm((f) => ({ ...f, adminNote: e.target.value }))} />
              </div>
              <button className={styles.btnPrimary} style={{ marginTop: 4 }} onClick={handleCreate} disabled={pvSaving}>
                {pvSaving ? "Création…" : "Créer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Drawer : Détail dossier ══ */}
      {pvDetail && (
        <div className={styles.overlay} onClick={() => setPvDetail(null)}>
          <div className={styles.pvDrawer} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.pvDrawerHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <TrustScoreRing score={pvDetail.trustScore || 0} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: "1.05rem", color: "#0f1b3f" }}>{pvDetail.companyName}</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{COMPANY_TYPES.find((t) => t.value === pvDetail.companyType)?.label} · {pvDetail.country || "—"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {(() => { const sl = STATUS_PV_CONFIG[pvDetail.status] || STATUS_PV_CONFIG.en_cours; const tl = TRUST_LEVEL_CONFIG[pvDetail.trustLevel] || TRUST_LEVEL_CONFIG.non_verifie; return (<><span className={styles.badge} style={{ color: sl.color, background: sl.bg }}>{sl.label}</span><span className={styles.badge} style={{ color: tl.color, background: tl.bg }}>⭐ {tl.label}</span></>); })()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.btnSmall} onClick={() => { setNewStatus(pvDetail.status); setStatusModal(true); }}>Changer statut</button>
                <button className={styles.btnGhost} onClick={() => setPvDetail(null)}>✕</button>
              </div>
            </div>

            {/* Onglets internes */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", padding: "0 20px" }}>
              {[["dossier","📋 Dossier"],["criteres","✅ Critères"],["docs","📁 Documents"],["audit","📜 Audit"]].map(([k, lbl]) => (
                <button key={k} onClick={() => setDetailTab(k)}
                  style={{ padding: "10px 16px", fontSize: "0.82rem", fontWeight: 700, border: "none", cursor: "pointer", background: "none", borderBottom: detailTab === k ? "3px solid #6d28d9" : "3px solid transparent", color: detailTab === k ? "#6d28d9" : "#64748b" }}>
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>

              {/* ── Onglet Dossier ── */}
              {detailTab === "dossier" && (
                <div>
                  {!editInfoMode ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16 }}>
                        {[
                          ["Nom entreprise", pvDetail.companyName],
                          ["Type", COMPANY_TYPES.find((t) => t.value === pvDetail.companyType)?.label],
                          ["Pays", pvDetail.country],
                          ["Ville", pvDetail.city],
                          ["Site web", pvDetail.website ? <a href={safeHref(pvDetail.website)} target="_blank" rel="noreferrer noopener" style={{ color: "#6d28d9" }}>{pvDetail.website}</a> : "—"],
                          ["Email pro", pvDetail.email],
                          ["Téléphone", pvDetail.phone],
                          ["Exp. (années)", pvDetail.yearsExperience],
                          ["Volume annuel", pvDetail.annualVolume],
                          ["Partenaire (User)", `${pvDetail.userId?.firstName || ""} ${pvDetail.userId?.lastName || ""} — ${pvDetail.userId?.email || ""}`],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                            <div style={{ fontSize: "0.88rem", color: "#0f1b3f", fontWeight: 600, marginTop: 2 }}>{v || "—"}</div>
                          </div>
                        ))}
                      </div>
                      {pvDetail.description && <div style={{ fontSize: "0.85rem", color: "#475569", marginBottom: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>{pvDetail.description}</div>}
                      {pvDetail.exportCountries?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Pays d'export</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {pvDetail.exportCountries.map((c) => <span key={c} style={{ background: "#ede9fe", color: "#6d28d9", padding: "2px 10px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 600 }}>{c}</span>)}
                          </div>
                        </div>
                      )}
                      {pvDetail.adminNote && (
                        <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: "0.85rem", color: "#92400e", marginBottom: 10 }}>
                          <strong>Note admin :</strong> {pvDetail.adminNote}
                        </div>
                      )}
                      <button className={styles.btnSmall} onClick={() => { setEditInfoMode(true); setEditInfoForm({ companyName: pvDetail.companyName, companyType: pvDetail.companyType, country: pvDetail.country, city: pvDetail.city, website: pvDetail.website, phone: pvDetail.phone, email: pvDetail.email, description: pvDetail.description, yearsExperience: pvDetail.yearsExperience, annualVolume: pvDetail.annualVolume, adminNote: pvDetail.adminNote, internalRating: pvDetail.internalRating, exportCountries: pvDetail.exportCountries?.join(", ") || "" }); }}>
                        Modifier les infos
                      </button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className={styles.pvLabel}>Nom entreprise</label><input className={styles.pvInput} value={editInfoForm.companyName || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, companyName: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Type</label>
                          <select className={styles.pvInput} value={editInfoForm.companyType || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, companyType: e.target.value }))}>
                            {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div><label className={styles.pvLabel}>Pays</label><input className={styles.pvInput} value={editInfoForm.country || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, country: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Ville</label><input className={styles.pvInput} value={editInfoForm.city || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, city: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Site web</label><input className={styles.pvInput} value={editInfoForm.website || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, website: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Email pro</label><input className={styles.pvInput} value={editInfoForm.email || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, email: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Téléphone</label><input className={styles.pvInput} value={editInfoForm.phone || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Exp. (années)</label><input className={styles.pvInput} type="number" value={editInfoForm.yearsExperience || 0} onChange={(e) => setEditInfoForm((f) => ({ ...f, yearsExperience: Number(e.target.value) }))} /></div>
                      </div>
                      <div><label className={styles.pvLabel}>Volume annuel</label><input className={styles.pvInput} value={editInfoForm.annualVolume || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, annualVolume: e.target.value }))} /></div>
                      <div><label className={styles.pvLabel}>Pays d'export (séparés par virgule)</label><input className={styles.pvInput} value={editInfoForm.exportCountries || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, exportCountries: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} /></div>
                      <div><label className={styles.pvLabel}>Description</label><textarea className={styles.pvInput} rows={2} value={editInfoForm.description || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, description: e.target.value }))} /></div>
                      <div><label className={styles.pvLabel}>Note admin</label><textarea className={styles.pvInput} rows={2} value={editInfoForm.adminNote || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, adminNote: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className={styles.btnPrimary} onClick={handleUpdateInfo} disabled={pvSaving}>{pvSaving ? "Sauvegarde…" : "Enregistrer"}</button>
                        <button className={styles.btnGhost} onClick={() => setEditInfoMode(false)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Onglet Critères ── */}
              {detailTab === "criteres" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Jauge globale */}
                  <div style={{ background: "linear-gradient(135deg, #0f1b3f, #1e3a8a)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 20, marginBottom: 8 }}>
                    <TrustScoreRing score={pvDetail.trustScore || 0} />
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900, fontSize: "1rem" }}>Trust Score Global</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>
                        {CRITERIA_CONFIG.filter((c) => pvDetail.criteria?.[c.key]?.verified).length} / {CRITERIA_CONFIG.length} critères validés
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.82rem", marginTop: 4 }}>
                        Niveau : <strong>{TRUST_LEVEL_CONFIG[pvDetail.trustLevel]?.label || "Non vérifié"}</strong>
                      </div>
                    </div>
                  </div>

                  {CRITERIA_CONFIG.map((c) => {
                    const isVerified = pvDetail.criteria?.[c.key]?.verified || false;
                    const verif = pvDetail.criteria?.[c.key];
                    const isLoading = pvCriterionLoading === c.key;
                    return (
                      <div key={c.key} className={styles.pvCriterionCard} style={{ borderLeft: `4px solid ${isVerified ? "#16a34a" : "#e2e8f0"}` }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ fontSize: "1.5rem", lineHeight: 1, marginTop: 2 }}>{c.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f1b3f" }}>{c.label}</span>
                              <span style={{ fontSize: "0.72rem", color: "#6d28d9", fontWeight: 700, background: "#ede9fe", padding: "1px 8px", borderRadius: 12 }}>+{c.weight} pts</span>
                              {isVerified && verif?.verifiedAt && (
                                <span style={{ fontSize: "0.72rem", color: "#16a34a" }}>Validé le {new Date(verif.verifiedAt).toLocaleDateString("fr-FR")}</span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 2 }}>{c.desc}</div>
                            {verif?.note && <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: 4, fontStyle: "italic" }}>"{verif.note}"</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => handleToggleCriterion(c.key, isVerified)}
                              disabled={isLoading}
                              className={isVerified ? styles.btnDanger : styles.btnPrimary}
                              style={{ fontSize: "0.78rem", padding: "5px 14px", minWidth: 100 }}>
                              {isLoading ? "…" : isVerified ? "✕ Retirer" : "✓ Valider"}
                            </button>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input className={styles.pvInput} placeholder="Note (optionnel)…"
                            style={{ flex: 1, fontSize: "0.78rem", padding: "4px 10px" }}
                            value={criterionNote[c.key] || verif?.note || ""}
                            onChange={(e) => setCriterionNote((n) => ({ ...n, [c.key]: e.target.value }))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Onglet Documents ── */}
              {detailTab === "docs" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["Licence commerciale", "businessLicenseDoc"],
                      ["RCCM",               "rccmDoc"],
                      ["NIF / Taxe",         "taxIdDoc"],
                      ["Relevé bancaire",    "bankStatementDoc"],
                      ["Pièce d'identité rep.", "repIdDoc"],
                      ["Autre document",     "otherDoc"],
                    ].map(([label, key]) => (
                      <div key={key} style={{ border: "1px dashed #e2e8f0", borderRadius: 10, padding: "14px", display: "flex", flexDirection: "column", gap: 8, background: "#fafbfc" }}>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>{label}</div>
                        {pvDetail.documents?.[key] ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <img src={pvDetail.documents[key]} alt={label} style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} onError={(e) => { e.target.style.display = "none"; }} />
                            <a href={safeHref(pvDetail.documents[key])} target="_blank" rel="noreferrer noopener"
                              style={{ fontSize: "0.78rem", color: "#6d28d9", textDecoration: "underline" }}>Voir le document</a>
                          </div>
                        ) : (
                          <div style={{ color: "#cbd5e1", fontSize: "0.8rem", textAlign: "center", padding: "10px 0" }}>Aucun document</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Onglet Audit ── */}
              {detailTab === "audit" && (
                <div>
                  {(!pvDetail.auditLog || pvDetail.auditLog.length === 0) && (
                    <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Aucune entrée d'audit</div>
                  )}
                  {pvDetail.auditLog?.slice().reverse().map((log, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, borderBottom: "1px solid #f1f5f9", marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6d28d9", marginTop: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f1b3f" }}>{log.action}</span>
                          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString("fr-FR")}</span>
                        </div>
                        {log.criterion && <div style={{ fontSize: "0.75rem", color: "#6d28d9", marginTop: 1 }}>Critère : {log.criterion}</div>}
                        {log.note && <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: 2 }}>{log.note}</div>}
                        {log.performedBy && <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 1 }}>Par : {log.performedBy?.firstName} {log.performedBy?.lastName}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal : Changer statut ══ */}
      {statusModal && pvDetail && (
        <div className={styles.overlay} onClick={() => setStatusModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg} style={{ marginBottom: 14 }}>Changer le statut du dossier <strong>{pvDetail.companyName}</strong></p>
            <select className={styles.pvInput} style={{ marginBottom: 16 }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {Object.entries(STATUS_PV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={handleUpdateStatus} disabled={pvSaving}>{pvSaving ? "…" : "Confirmer"}</button>
              <button className={styles.btnGhost} onClick={() => setStatusModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOGUE SECTION — Annonces & Validations (combiné)
// ═══════════════════════════════════════════════════════════════════════════════
function CatalogueSection({ vehicles, drivers, bookings, headers, token, onRefresh, showToast, setConfirm, rejectModal, setRejectModal, rejectReason, setRejectReason, driverRejectModal, setDriverRejectModal, driverRejectReason, setDriverRejectReason, updateVehicleStatus, deleteVehicle }) {
  const [subTab,         setSubTab]         = useState("pending");
  const [vehSearch,      setVehSearch]      = useState("");
  const [vehPage,        setVehPage]        = useState(1);
  const [previewVehicle, setPreviewVehicle] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImgIdx,  setPreviewImgIdx]  = useState(0);
  const PAGE = 12;

  const openPreview = async (vid) => {
    setPreviewLoading(true);
    setPreviewVehicle(null);
    setPreviewImgIdx(0);
    try {
      const r = await fetch(`/api/vehicles/${vid}`, { headers });
      const d = await r.json();
      if (r.ok) setPreviewVehicle(d.vehicle);
      else showToast("Impossible de charger l'annonce", "error");
    } catch { showToast("Erreur réseau", "error"); }
    setPreviewLoading(false);
  };

  const filtered = vehicles.filter((v) => {
    if (subTab === "pending")   return v.status === "pending";
    if (subTab === "approved")  return v.status === "approved";
    if (subTab === "rejected")  return v.status === "rejected";
    return true;
  }).filter((v) => {
    if (!vehSearch) return true;
    const q = vehSearch.toLowerCase();
    return [v.title, v.name, v.marque, v.modele].some((f) => f?.toLowerCase().includes(q));
  });

  const paginated = filtered.slice((vehPage - 1) * PAGE, vehPage * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  const SUB_TABS = [
    { k: "pending",  l: "En attente",  icon: "⏳", count: vehicles.filter(v => v.status === "pending").length, color: "#f59e0b" },
    { k: "approved", l: "Publiées",    icon: "✅", count: vehicles.filter(v => v.status === "approved").length, color: "#16a34a" },
    { k: "rejected", l: "Rejetées",    icon: "❌", count: vehicles.filter(v => v.status === "rejected").length, color: "#ef4444" },
    { k: "drivers",  l: "Chauffeurs",  icon: "👨‍✈️", count: drivers.length, color: "#8b5cf6" },
    { k: "all",      l: "Toutes",      icon: "📋", count: vehicles.length, color: "#64748b" },
  ];

  const handleApproveDriver = async (id) => {
    const r = await fetch(`/api/drivers/${id}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "approved" }) });
    if (r.ok) { showToast("Chauffeur approuvé"); onRefresh(); }
    else showToast("Erreur approbation", "error");
  };
  const handleRejectDriver = async (id, reason) => {
    const r = await fetch(`/api/drivers/${id}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "rejected", rejectionReason: reason }) });
    if (r.ok) { showToast("Chauffeur refusé"); setDriverRejectModal(null); setDriverRejectReason(""); onRefresh(); }
    else showToast("Erreur refus", "error");
  };
  const handleRejectVehicle = async () => {
    const r = await fetch(`/api/vehicles/${rejectModal.vid}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "rejected", rejectionReason: rejectReason }) });
    if (r.ok) { showToast("Annonce rejetée"); setRejectModal(null); setRejectReason(""); onRefresh(); }
    else showToast("Erreur", "error");
  };

  return (
    <div className={styles.scrollZone}>
      {/* Stats rapides */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {SUB_TABS.slice(0, 4).map((t) => (
          <div key={t.k} className={styles.pvStatCard} style={{ borderLeftColor: t.color, cursor: "pointer" }} onClick={() => setSubTab(t.k)}>
            <div className={styles.pvStatVal} style={{ color: t.color }}>{t.count}</div>
            <div className={styles.pvStatLbl}>{t.l}</div>
          </div>
        ))}
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
        {SUB_TABS.map((t) => (
          <button key={t.k} onClick={() => { setSubTab(t.k); setVehPage(1); }}
            style={{ padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem", borderBottom: subTab === t.k ? `3px solid ${t.color}` : "3px solid transparent", color: subTab === t.k ? t.color : "#64748b", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            {t.icon} {t.l}
            <span style={{ fontSize: ".72rem", background: subTab === t.k ? t.color : "#e2e8f0", color: subTab === t.k ? "#fff" : "#64748b", borderRadius: 12, padding: "1px 7px", minWidth: 20, textAlign: "center" }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Contenu Annonces */}
      {subTab !== "drivers" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input className={styles.searchInput} placeholder="Rechercher une annonce…" value={vehSearch}
              onChange={(e) => { setVehSearch(e.target.value); setVehPage(1); }}
              style={{ flex: 1, minWidth: 200 }} />
            <button className={styles.btnSmall} onClick={onRefresh}>↻ Actualiser</button>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚗</div>
              <p style={{ fontWeight: 600 }}>Aucune annonce dans cette catégorie</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Véhicule</th><th>Propriétaire</th><th>Type</th><th>Prix</th><th>Score</th><th>Statut</th><th>Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((v) => {
                    const vid = v._id || v.id;
                    const score = v.validationScore;
                    const SC = { approved: { l: "Publiée", c: "#16a34a", bg: "#dcfce7" }, pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" } };
                    const sc = SC[v.status] || SC.pending;
                    const owner = v.owner || v.userId;
                    return (
                      <tr key={vid} className={styles.tr}>
                        <td>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {(v.images?.[0] || v.image)
                              ? <img src={v.images?.[0] || v.image} alt="" style={{ width: 46, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                              : <div style={{ width: 46, height: 36, borderRadius: 6, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>🚗</div>
                            }
                            <div>
                              <div style={{ fontWeight: 700, fontSize: ".87rem", color: "#0f1b3f" }}>{v.title || v.name}</div>
                              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{v.marque} {v.modele} {v.annee}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: ".82rem" }}>
                          {owner?.firstName || owner?.name || "—"}
                          <div style={{ fontSize: ".73rem", color: "#94a3b8" }}>{owner?.email || "—"}</div>
                        </td>
                        <td><span className={styles.badge} style={{ color: "#64748b", background: "#f1f5f9" }}>{v.type === "location" ? "📅 Location" : "💰 Vente"}</span></td>
                        <td style={{ fontSize: ".85rem", fontWeight: 700 }}>
                          {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString()} /j` : v.priceForSale ? `${Number(v.priceForSale).toLocaleString()}` : "—"}
                        </td>
                        <td>
                          {score != null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${score}%`, background: score >= 65 ? "#16a34a" : score >= 40 ? "#f59e0b" : "#ef4444", borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: ".78rem", fontWeight: 700 }}>{score}</span>
                            </div>
                          )}
                        </td>
                        <td><span className={styles.badge} style={{ color: sc.c, background: sc.bg }}>{sc.l}</span></td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button title="Visualiser l'annonce complète"
                              onClick={() => openPreview(vid)}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1.5px solid #bfdbfe", borderRadius: 6, cursor: "pointer" }}>
                              👁
                            </button>
                            {v.status !== "approved" && (
                              <button className={styles.btnApprove} style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                onClick={() => setConfirm({ message: `Approuver "${v.title || v.name}" ?`, action: () => updateVehicleStatus(vid, "approved") })}>
                                ✅
                              </button>
                            )}
                            {v.status !== "rejected" && (
                              <button className={styles.btnReject} style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                onClick={() => { setRejectModal({ vid, name: v.title || v.name }); setRejectReason(""); }}>
                                ✕
                              </button>
                            )}
                            <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }}
                              onClick={() => setConfirm({ message: "Supprimer cette annonce ?", danger: true, action: () => deleteVehicle(vid) })}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} onClick={() => setVehPage(p => Math.max(1, p-1))} disabled={vehPage === 1}>‹</button>
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i+1).map(p => (
                <button key={p} className={`${styles.pageBtn} ${p === vehPage ? styles.pageBtnActive : ""}`} onClick={() => setVehPage(p)}>{p}</button>
              ))}
              <button className={styles.pageBtn} onClick={() => setVehPage(p => Math.min(totalPages, p+1))} disabled={vehPage === totalPages}>›</button>
            </div>
          )}
        </>
      )}

      {/* Contenu Chauffeurs */}
      {subTab === "drivers" && (
        <div>
          {drivers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>👨‍✈️</div>
              <p style={{ fontWeight: 600 }}>Aucun profil chauffeur en attente</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Chauffeur</th><th>Permis</th><th>Expérience</th><th>Langues</th><th>Soumis le</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {drivers.map((d) => {
                    const u = d.userId || {};
                    return (
                      <tr key={d._id} className={styles.tr}>
                        <td>
                          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                            {u.profilePhoto ? <img src={u.profilePhoto} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>}
                            <div>
                              <strong style={{ fontSize: ".87rem" }}>{u.firstName} {u.lastName}</strong>
                              <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: ".82rem" }}>{d.licenseNumber || "—"} <span style={{ color: "#94a3b8" }}>({d.licenseCategory || "—"})</span></td>
                        <td style={{ fontSize: ".82rem" }}>{d.yearsExperience ?? 0} an(s)</td>
                        <td style={{ fontSize: ".78rem" }}>{d.languages?.join(", ") || "—"}</td>
                        <td style={{ fontSize: ".78rem", color: "#94a3b8" }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button className={styles.btnApprove} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => handleApproveDriver(d._id)}>✅ Valider</button>
                            <button className={styles.btnReject} style={{ fontSize: ".75rem", padding: "4px 10px" }} onClick={() => { setDriverRejectModal({ id: d._id, name: `${u.firstName} ${u.lastName}` }); setDriverRejectReason(""); }}>✕ Refuser</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal rejet annonce */}
      {rejectModal && (
        <div className={styles.overlay} onClick={() => setRejectModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du rejet pour « {rejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Photos insuffisantes, description incomplète…"
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={handleRejectVehicle}>Rejeter</button>
              <button className={styles.btnGhost} onClick={() => setRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rejet chauffeur */}
      {driverRejectModal && (
        <div className={styles.overlay} onClick={() => setDriverRejectModal(null)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du refus pour « {driverRejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Documents insuffisants…"
              value={driverRejectReason} onChange={e => setDriverRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={() => handleRejectDriver(driverRejectModal.id, driverRejectReason)}>Refuser</button>
              <button className={styles.btnGhost} onClick={() => setDriverRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL PRÉVISUALISATION ANNONCE ══ */}
      {(previewLoading || previewVehicle) && (
        <div className={styles.overlay} onClick={() => { setPreviewVehicle(null); setPreviewLoading(false); }}
          style={{ alignItems: "flex-start", paddingTop: "2vh", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "min(900px, 96vw)", maxHeight: "95dvh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.22)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1.5px solid #e2e8f0", flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 900, color: "#0f1b3f" }}>
                  👁 Prévisualisation de l'annonce
                </h2>
                {previewVehicle && <p style={{ margin: "2px 0 0", fontSize: ".78rem", color: "#94a3b8" }}>ID : {previewVehicle._id}</p>}
              </div>
              <button onClick={() => { setPreviewVehicle(null); setPreviewLoading(false); }}
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", padding: "20px 24px 24px", flex: 1 }}>
              {previewLoading && !previewVehicle ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 10 }}>⏳</div>
                  <p>Chargement de l'annonce…</p>
                </div>
              ) : previewVehicle ? (() => {
                const v = previewVehicle;
                const imgs = v.images?.length ? v.images : v.image ? [v.image] : [];
                const o = v.owner || {};
                const KYC_COLORS = { VERIFIE: "#059669", EN_ATTENTE: "#d97706", REFUSE: "#dc2626", A_REVOIR_MANUELLEMENT: "#2563eb" };
                const kycC = KYC_COLORS[o.kycStatus] || "#94a3b8";
                const STATUS_CFG = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Publiée", c: "#059669", bg: "#dcfce7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" } };
                const sc = STATUS_CFG[v.status] || STATUS_CFG.pending;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Statut + actions rapides */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ background: sc.bg, color: sc.c, padding: "4px 14px", borderRadius: 99, fontWeight: 800, fontSize: ".82rem" }}>{sc.l}</span>
                      {v.autoValidated && <span style={{ background: "#ede9fe", color: "#7c3aed", padding: "4px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".78rem" }}>✨ Validé automatiquement</span>}
                      {v.validationScore != null && (
                        <span style={{ background: v.validationScore >= 65 ? "#dcfce7" : v.validationScore >= 40 ? "#fef3c7" : "#fee2e2", color: v.validationScore >= 65 ? "#059669" : v.validationScore >= 40 ? "#d97706" : "#dc2626", padding: "4px 12px", borderRadius: 99, fontWeight: 700, fontSize: ".78rem" }}>
                          Score {v.validationScore}/100
                        </span>
                      )}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {v.status !== "approved" && (
                          <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
                            onClick={() => { updateVehicleStatus(v._id, "approved"); setPreviewVehicle(null); }}>✅ Valider</button>
                        )}
                        {v.status !== "rejected" && (
                          <button className={styles.btnReject} style={{ fontSize: ".8rem" }}
                            onClick={() => { setRejectModal({ vid: v._id, name: v.title }); setRejectReason(""); setPreviewVehicle(null); }}>✕ Rejeter</button>
                        )}
                      </div>
                    </div>

                    {/* Galerie photos */}
                    {imgs.length > 0 ? (
                      <div>
                        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f1b3f", height: 280 }}>
                          <img src={imgs[previewImgIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          {imgs.length > 1 && (
                            <>
                              <button onClick={() => setPreviewImgIdx(i => (i - 1 + imgs.length) % imgs.length)}
                                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer" }}>‹</button>
                              <button onClick={() => setPreviewImgIdx(i => (i + 1) % imgs.length)}
                                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.5)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer" }}>›</button>
                              <span style={{ position: "absolute", bottom: 10, right: 14, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: ".75rem", padding: "2px 10px", borderRadius: 99 }}>{previewImgIdx + 1} / {imgs.length}</span>
                            </>
                          )}
                        </div>
                        {imgs.length > 1 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
                            {imgs.map((img, i) => (
                              <img key={i} src={img} alt="" onClick={() => setPreviewImgIdx(i)}
                                style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: i === previewImgIdx ? "2.5px solid #2563eb" : "2px solid #e2e8f0", flexShrink: 0 }} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ height: 160, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", color: "#cbd5e1" }}>🚗</div>
                    )}

                    {/* Deux colonnes : détails annonce + annonceur */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* ── Détails de l'annonce ── */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".9rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>🚗 Détails de l'annonce</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          <h4 style={{ margin: "0 0 4px", fontSize: "1rem", fontWeight: 900, color: "#0f1b3f" }}>{v.title}</h4>
                          {[
                            ["Type", v.type === "location" ? "📅 Location" : "💰 Vente"],
                            ["Catégorie", v.vehicleType],
                            ["Marque / Modèle", [v.marque, v.modele].filter(Boolean).join(" ") || "—"],
                            ["Année", v.annee],
                            ["Couleur", v.couleur],
                            ["Kilométrage", v.kilometrage != null ? `${Number(v.kilometrage).toLocaleString("fr-FR")} km` : "—"],
                            ["État", v.etat],
                            ["Carburant", v.carburant],
                            ["Transmission", v.transmission],
                            ["Places", v.nombrePlaces],
                            ["Portes", v.nombrePortes],
                            ["Climatisation", v.climatisation ? "✅ Oui" : "❌ Non"],
                            ["Avec chauffeur", v.withDriver ? "✅ Oui" : "Non"],
                            v.type === "location" ? ["Prix / jour", v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString("fr-FR")} XOF` : "—"] : ["Prix vente", v.priceForSale ? `${Number(v.priceForSale).toLocaleString("fr-FR")} XOF` : "—"],
                            v.type === "location" && v.caution ? ["Caution", `${Number(v.caution).toLocaleString("fr-FR")} XOF`] : null,
                            ["Ville", v.ville || "—"],
                            ["Adresse", v.adresse || "—"],
                            ["Âge min", v.ageMin ? `${v.ageMin} ans` : "—"],
                            ["Vues", v.vues || 0],
                            ["Note moy.", v.noteMoyenne ? `${v.noteMoyenne}/5 (${v.nombreAvis} avis)` : "—"],
                            ["Publié le", v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR") : "—"],
                          ].filter(Boolean).map(([k, val]) => val != null && val !== "—" && (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", gap: 8 }}>
                              <span style={{ color: "#64748b", flexShrink: 0 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#0f1b3f", textAlign: "right" }}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {v.leasing?.disponible && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "#ede9fe", borderRadius: 8 }}>
                            <div style={{ fontSize: ".78rem", fontWeight: 800, color: "#6d28d9", marginBottom: 4 }}>🏦 Leasing disponible</div>
                            <div style={{ fontSize: ".78rem", color: "#4c1d95" }}>Apport : {Number(v.leasing.apportInitial).toLocaleString("fr-FR")} XOF • {v.leasing.mensualite && `${Number(v.leasing.mensualite).toLocaleString("fr-FR")} XOF/mois`} • {v.leasing.duree} mois • {v.leasing.tauxInteret}%</div>
                          </div>
                        )}
                      </div>

                      {/* ── Détails de l'annonceur ── */}
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
                        <h3 style={{ margin: "0 0 14px", fontSize: ".9rem", fontWeight: 800, color: "#0f1b3f", borderBottom: "1.5px solid #e2e8f0", paddingBottom: 8 }}>👤 Annonceur</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                          {o.profilePhoto
                            ? <img src={o.profilePhoto} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid #e2e8f0" }} />
                            : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>👤</div>}
                          <div>
                            <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#0f1b3f" }}>{o.firstName} {o.lastName}</div>
                            <div style={{ fontSize: ".78rem", color: "#64748b" }}>{o.role || "partenaire"}</div>
                            {o.certificationBadge && <span style={{ fontSize: ".72rem", background: "#fef3c7", color: "#d97706", padding: "1px 8px", borderRadius: 99, fontWeight: 700 }}>🏆 {o.certificationBadge}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {[
                            ["Email", o.email],
                            ["Téléphone", o.phone],
                            ["Ville", o.ville],
                            ["Statut compte", o.isActive === false ? "🚫 Bloqué" : "✅ Actif"],
                            ["Membre depuis", o.createdAt ? new Date(o.createdAt).toLocaleDateString("fr-FR") : "—"],
                          ].filter(([, val]) => val).map(([k, val]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", gap: 8 }}>
                              <span style={{ color: "#64748b", flexShrink: 0 }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#0f1b3f", textAlign: "right" }}>{val}</span>
                            </div>
                          ))}
                          {o.kycStatus && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem" }}>
                              <span style={{ color: "#64748b" }}>KYC</span>
                              <span style={{ fontWeight: 700, color: kycC }}>{o.kycStatus === "VERIFIE" ? "✅ Vérifié" : o.kycStatus === "REFUSE" ? "❌ Refusé" : o.kycStatus === "EN_ATTENTE" ? "⏳ En attente" : "🔄 En révision"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {v.description && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 18px" }}>
                        <h3 style={{ margin: "0 0 8px", fontSize: ".85rem", fontWeight: 800, color: "#0f1b3f" }}>📝 Description</h3>
                        <p style={{ margin: 0, fontSize: ".85rem", color: "#475569", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{v.description}</p>
                      </div>
                    )}

                    {/* Erreurs / avertissements de validation */}
                    {(v.validationErrors?.length > 0 || v.validationWarnings?.length > 0) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {v.validationErrors?.length > 0 && (
                          <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#dc2626", marginBottom: 6 }}>❌ Erreurs de validation</div>
                            {v.validationErrors.map((e, i) => <div key={i} style={{ fontSize: ".8rem", color: "#b91c1c" }}>• {e}</div>)}
                          </div>
                        )}
                        {v.validationWarnings?.length > 0 && (
                          <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "12px 16px" }}>
                            <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#d97706", marginBottom: 6 }}>⚠️ Avertissements</div>
                            {v.validationWarnings.map((w, i) => <div key={i} style={{ fontSize: ".8rem", color: "#92400e" }}>• {w}</div>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Raison de rejet */}
                    {v.rejectionReason && (
                      <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 16px" }}>
                        <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#dc2626", marginBottom: 4 }}>💬 Raison du rejet</div>
                        <p style={{ margin: 0, fontSize: ".85rem", color: "#b91c1c" }}>{v.rejectionReason}</p>
                      </div>
                    )}

                  </div>
                );
              })() : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETING SECTION — CMS, Accueil, Vedette & Campagnes (combiné)
// ═══════════════════════════════════════════════════════════════════════════════
const MAX_SPOTLIGHTS_M = 5;

function MarketingSection({ vehicles, token, onRefresh }) {
  const approved = vehicles.filter((v) => v.status === "approved" || v.available);
  const [subTab, setSubTab] = useState("accueil");

  // ── Accueil / Hero ──────────────────────────────────────────────────────────
  const [spotlightIds, setSpotlightIds] = useState(() => {
    try {
      const saved = localStorage.getItem("vit_hero_spotlights");
      if (saved) return JSON.parse(saved);
      const legacy = localStorage.getItem("vit_hero_spotlight");
      return legacy ? [legacy] : [];
    } catch { return []; }
  });
  const [heroText, setHeroText] = useState(() => localStorage.getItem("vit_hero_title") || "");
  const [heroSub,  setHeroSub]  = useState(() => localStorage.getItem("vit_hero_sub")   || "");
  const [savedMsg, setSavedMsg] = useState("");

  const flash = (msg) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 2800); };

  const saveSpotlights = (ids) => {
    localStorage.setItem("vit_hero_spotlights", JSON.stringify(ids));
    localStorage.setItem("vit_hero_spotlight", ids[0] || "");
    setSpotlightIds(ids);
  };

  const toggleSpotlight = (vid) => {
    const str = String(vid);
    if (spotlightIds.includes(str)) {
      saveSpotlights(spotlightIds.filter((id) => id !== str));
      flash("Retiré du carrousel hero");
    } else if (spotlightIds.length >= MAX_SPOTLIGHTS_M) {
      flash(`Maximum ${MAX_SPOTLIGHTS_M} véhicules dans le carrousel`);
    } else {
      saveSpotlights([...spotlightIds, str]);
      flash("Ajouté au carrousel hero ✅");
    }
  };

  const saveHero = () => {
    localStorage.setItem("vit_hero_title", heroText);
    localStorage.setItem("vit_hero_sub", heroSub);
    flash("Texte héro sauvegardé ✅");
  };

  // ── Vedette ─────────────────────────────────────────────────────────────────
  const [featuredLoading, setFeaturedLoading] = useState(null);

  const toggleFeatured = async (vid, isFeatured) => {
    setFeaturedLoading(vid);
    try {
      const r = await fetch(`/api/vehicles/${vid}/feature`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ featured: !isFeatured }),
      });
      if (r.ok) { onRefresh(); flash(!isFeatured ? "Véhicule en vedette ⭐" : "Retiré de la vedette"); }
    } catch { flash("Erreur"); }
    setFeaturedLoading(null);
  };

  const featuredCount = approved.filter((v) => v.featured).length;

  const SUB_TABS_M = [
    { k: "accueil",  l: "🏠 Page d'accueil",       desc: "Texte hero & carrousel" },
    { k: "vedette",  l: "⭐ Véhicules en vedette",  desc: "Mise en avant catalogue" },
    { k: "campagnes",l: "📢 Campagnes",             desc: "Bannières & promotions (bientôt)" },
  ];

  return (
    <div className={styles.scrollZone}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { l: "Annonces publiées", v: approved.length, c: "#16a34a" },
          { l: "En vedette",        v: featuredCount,   c: "#f59e0b" },
          { l: "Dans le carrousel", v: spotlightIds.length, c: "#6366f1" },
        ].map(({ l, v, c }) => (
          <div key={l} className={styles.pvStatCard} style={{ borderLeftColor: c }}>
            <div className={styles.pvStatVal} style={{ color: c }}>{v}</div>
            <div className={styles.pvStatLbl}>{l}</div>
          </div>
        ))}
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {SUB_TABS_M.map((t) => (
          <button key={t.k} onClick={() => setSubTab(t.k)}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: ".82rem", borderBottom: subTab === t.k ? "3px solid #6366f1" : "3px solid transparent", color: subTab === t.k ? "#6366f1" : "#64748b", fontFamily: "inherit" }}>
            {t.l}
          </button>
        ))}
      </div>

      {savedMsg && <div style={{ background: "#dcfce7", color: "#16a34a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontWeight: 700 }}>{savedMsg}</div>}

      {/* ── Accueil ── */}
      {subTab === "accueil" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Texte hero */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>✏️ Texte de la bannière principale</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className={styles.pvLabel}>Titre principal</label>
                <input className={styles.pvInput} value={heroText} onChange={e => setHeroText(e.target.value)} placeholder="Ex : Trouvez votre véhicule idéal en Afrique" />
              </div>
              <div><label className={styles.pvLabel}>Sous-titre</label>
                <input className={styles.pvInput} value={heroSub} onChange={e => setHeroSub(e.target.value)} placeholder="Ex : Location, vente et import/export dans 14 pays" />
              </div>
              <button className={styles.btnPrimary} style={{ alignSelf: "flex-start" }} onClick={saveHero}>Sauvegarder</button>
            </div>
          </div>

          {/* Carrousel hero */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🎠 Carrousel Hero ({spotlightIds.length}/{MAX_SPOTLIGHTS_M})</h3>
              <button className={styles.btnSmall} onClick={() => saveSpotlights([])}>Vider</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {approved.map((v) => {
                const vid = String(v._id || v.id);
                const inSpotlight = spotlightIds.includes(vid);
                return (
                  <div key={vid} style={{ border: `2px solid ${inSpotlight ? "#6366f1" : "#e2e8f0"}`, borderRadius: 10, overflow: "hidden", transition: "border-color .2s" }}>
                    {(v.images?.[0] || v.image)
                      ? <img src={v.images?.[0] || v.image} alt="" style={{ width: "100%", height: 90, objectFit: "cover" }} />
                      : <div style={{ height: 90, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>🚗</div>
                    }
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#0f1b3f", marginBottom: 6 }}>{v.title || `${v.marque} ${v.modele}`}</div>
                      <button onClick={() => toggleSpotlight(vid)}
                        style={{ width: "100%", padding: "4px 0", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".74rem",
                          background: inSpotlight ? "#6366f1" : "#f1f5f9", color: inSpotlight ? "#fff" : "#475569" }}>
                        {inSpotlight ? "✓ Dans le carrousel" : "+ Ajouter"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Vedette ── */}
      {subTab === "vedette" && (
        <div className={styles.chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 className={styles.chartTitle} style={{ margin: 0 }}>⭐ Véhicules en vedette ({featuredCount} actifs)</h3>
            <span style={{ fontSize: ".78rem", color: "#94a3b8" }}>Véhicules mis en avant sur la page catalogue</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
            {approved.map((v) => {
              const vid = v._id || v.id;
              return (
                <div key={vid} style={{ border: `2px solid ${v.featured ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 12, overflow: "hidden", transition: "border-color .2s" }}>
                  {(v.images?.[0] || v.image)
                    ? <img src={v.images?.[0] || v.image} alt="" style={{ width: "100%", height: 100, objectFit: "cover" }} />
                    : <div style={{ height: 100, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }}>🚗</div>
                  }
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#0f1b3f", marginBottom: 8 }}>{v.title || `${v.marque} ${v.modele} ${v.annee}`}</div>
                    <button onClick={() => toggleFeatured(vid, v.featured)} disabled={featuredLoading === vid}
                      style={{ width: "100%", padding: "5px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".78rem",
                        background: v.featured ? "#fef3c7" : "#f1f5f9", color: v.featured ? "#b45309" : "#475569" }}>
                      {featuredLoading === vid ? "…" : v.featured ? "⭐ Retirer vedette" : "+ Mettre en vedette"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Campagnes ── */}
      {subTab === "campagnes" && (
        <WipSection icon="📢" title="Campagnes & Publicités" subtitle="Gérez vos bannières promotionnelles, annonces sponsorisées et campagnes marketing sur le site." features={["Bannières homepage personnalisées","Véhicules sponsorisés avec budget","Statistiques de clics et conversions","Envoi de newsletter ciblée","Codes promo et réductions"]} />
      )}
    </div>
  );
}

// ─── WIP Section ───────────────────────────────────────────────────────────────
function WipSection({ icon, title, subtitle, features = [] }) {
  return (
    <div className={styles.wipSection}>
      <div className={styles.wipIcon}>{icon}</div>
      <h2 className={styles.wipTitle}>{title}</h2>
      <p className={styles.wipSubtitle}>{subtitle || "Ce module sera disponible prochainement."}</p>
      {features.length > 0 && (
        <>
          <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 10 }}>Fonctionnalités prévues :</p>
          <div className={styles.wipFeatures}>
            {features.map((f) => (
              <span key={f} className={styles.wipFeature}>⚡ {f}</span>
            ))}
          </div>
        </>
      )}
      <div className={styles.wipBanner}>🚀 En développement — Bientôt disponible</div>
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────────
function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div className={styles.pagination}>
      <button className={styles.pageBtn} onClick={() => onChange(page - 1)} disabled={page === 1}>‹</button>
      {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
        <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
          onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className={styles.pageBtn} onClick={() => onChange(page + 1)} disabled={page === total}>›</button>
    </div>
  );
}
