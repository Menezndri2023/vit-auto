// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
// Constantes, helpers et petits composants partagés par les onglets d'administration.
/* eslint-disable react-refresh/only-export-components */
import styles from "../AdminPanel.module.css";
import { INCOTERMS as IE_LISTING_INCOTERMS } from "../../constants/incoterms";

// Drapeau pays — reconnaissance rapide du pays d'un partenaire/client par
// l'admin, à partir du code ISO stocké sur User/Vehicle/Driver (voir
// CurrencyContext.COUNTRIES_CONFIG pour la liste des pays supportés).
export const CountryFlag = ({ code, countriesConfig }) => {
  if (!code) return null;
  const c = countriesConfig.find((x) => x.code === code);
  if (!c) return null;
  return <span title={c.name} style={{ marginLeft: 6 }}>{c.flag}</span>;
};

// ─── Utilitaires ───────────────────────────────────────────────────────────────
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const timeAgo = (d) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1)  return "à l'instant";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

export const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Tarification saisonnière (CatalogueSection, voir openSeasonalModal) — noms complets pour le sélecteur.
export const MOIS_LONGS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export const PLAN_TIER_LABELS = { individuel_plus: "Individuel Plus", business: "Business", exportateur: "Exportateur" };

// Sanitise une URL avant de l'utiliser dans href (bloque javascript: et autres schémas dangereux)
export const safeHref = (url) => {
  if (!url) return "#";
  const s = String(url).trim();
  if (/^(https?|mailto):/i.test(s)) return s;
  return "#";
};

// Version pour les images : autorise aussi les data:image/... (KYC documents stockés en base64)
export const safeImgHref = (url) => {
  if (!url) return "#";
  const s = String(url).trim();
  if (/^(https?|data:image\/)/.test(s)) return s;
  return "#";
};

export const ROLE_CONFIG = {
  client:     { label: "Client",     color: "#3b82f6", bg: "#eff6ff" },
  partenaire: { label: "Partenaire", color: "#10b981", bg: "#ecfdf5" },
  admin:      { label: "Admin",      color: "#f59e0b", bg: "#fffbeb" },
  chauffeur:  { label: "Chauffeur",  color: "#8b5cf6", bg: "#f5f3ff" },
};

export const KYC_CFG = {
  VERIFIE:               { label: "✅ Vérifié",    color: "#16a34a", bg: "#dcfce7" },
  EN_ATTENTE:            { label: "⏳ Attente",    color: "#d97706", bg: "#fef3c7" },
  REFUSE:                { label: "❌ Refusé",     color: "#dc2626", bg: "#fee2e2" },
  A_REVOIR_MANUELLEMENT: { label: "🔍 À revoir",  color: "#7c3aed", bg: "#ede9fe" },
};

export const CERTIF_CFG = {
  premium:   { label: "⭐ Premium",   color: "#7c3aed", bg: "#ede9fe" },
  fondateur: { label: "🏆 Fondateur", color: "#d97706", bg: "#fef3c7" },
  verifie:   { label: "🟢 Vérifié",  color: "#16a34a", bg: "#dcfce7" },
};

// Champs texte + documents soumis par niveau de certification partenaire (voir
// server/models/PartnerCertification.js) — utilisé pour afficher à l'admin ce que
// le partenaire a réellement soumis avant qu'il approuve/refuse un niveau (avant ce
// mapping, le modal d'examen ne montrait que le statut, jamais les données/documents).
export const CERT_LEVEL_FIELDS = {
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

export const fmtCertField = (f, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (f.bool) return v ? "✅ Oui" : "❌ Non";
  if (f.date) return new Date(v).toLocaleString("fr-FR");
  if (f.list) return Array.isArray(v) && v.length ? v.join(", ") : "—";
  return String(v);
};

// Sections du dossier Founding Partner remplies par le partenaire mais jusqu'ici
// jamais rendues dans le détail admin (voir server/models/PartnerOnboarding.js —
// businessVerification/vehicleInventory/exportCapabilities/paymentInfo/
// commercialTerms) : seuls companyInfo, legalDocs et platformMedia l'étaient.
export const ENTITY_TYPE_LABELS  = { factory: "Usine", dealer: "Concessionnaire", exporter: "Exportateur", importer: "Importateur", agent: "Agent" };

export const VEHICLE_INV_LABELS  = { newVehicles: "Neufs", usedVehicles: "Occasion", electricVehicles: "Électriques", hybridVehicles: "Hybrides", luxuryVehicles: "Luxe", commercialVehicles: "Utilitaires" };

export const INCOTERM_LABELS     = { exw: "EXW", fob: "FOB", cif: "CIF", dap: "DAP", ddp: "DDP" };

// Distinct de INCOTERM_LABELS ci-dessus (capacités déclaratives du Founding
// Partner à l'onboarding) — celui-ci couvre les 11 Incoterms 2020 épinglés
// sur une annonce ImportExportListing (voir src/constants/incoterms.js).
export const ieListingIncotermLabel = (code) => IE_LISTING_INCOTERMS.find((i) => i.code === code)?.label || code;

export const PAYMENT_MODE_LABELS = { wire_transfer: "Virement", lc: "Crédit documentaire", tt: "T/T", cash: "Espèces", escrow: "Séquestre" };

export function InfoField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: ".82rem", color: "#0f1b3f" }}>{value ?? "—"}</div>
    </div>
  );
}

export function TagList({ items, labels }) {
  if (!items?.length) return <span style={{ color: "#94a3b8" }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((v) => (
        <span key={v} style={{ fontSize: ".72rem", fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#eff6ff", color: "#1d4ed8" }}>
          {labels?.[v] || v}
        </span>
      ))}
    </div>
  );
}

// ── Onglet Analytics avancé — construit entièrement à partir des données déjà
// collectées (Booking/IETransaction/User), voir server/controllers/analyticsController.js.
// Palette catégorielle fixe (jamais réordonnée selon les données affichées) et
// une seule mesure par graphique (jamais deux échelles sur le même axe).
export const IE_STATUS_LABELS = {
  reserved: "Réservée", confirmed: "Confirmée", in_discussion: "Discussion",
  inspection_requested: "Inspection demandée", inspection_done: "Inspection faite",
  offer_sent: "Offre envoyée", offer_accepted: "Offre acceptée",
  payment_pending: "Paiement en attente", payment_submitted: "Paiement à vérifier",
  in_escrow: "En entiercement", preparing: "Préparation", shipped: "Expédiée",
  in_transit: "En transit", delivered: "Livrée", funds_released: "Fonds libérés",
  completed: "Terminée", disputed: "Litige", cancelled: "Annulée",
};

export const STATUS_VEH = {
  approved: { label: "Publiée",     color: "#10b981", bg: "#ecfdf5" },
  pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
  rejected: { label: "Rejetée",     color: "#ef4444", bg: "#fef2f2" },
};

export const STATUS_BK = {
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
export function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.miniBarWrap}>
      <div className={styles.miniBar} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─── Carte de stat ──────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub, color }) {
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
export function Badge({ label, color, bg }) {
  return <span className={styles.badge} style={{ color, background: bg }}>{label}</span>;
}

// ─── Modal confirmation ─────────────────────────────────────────────────────────
export function ConfirmModal({ message, onConfirm, onCancel, danger }) {
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
// PARTNER VERIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export const CRITERIA_CONFIG = [
  { key: "businessLicense",   label: "Licence commerciale vérifiée", icon: "📋", weight: 20, desc: "RCCM, Kbis, Business License ou équivalent" },
  { key: "repIdentified",     label: "Représentant identifié",        icon: "👤", weight: 18, desc: "Identité du représentant légal confirmée" },
  { key: "exportCapacity",    label: "Capacité d'export confirmée",   icon: "🚢", weight: 18, desc: "Volume, pays, ports et modes de transport" },
  { key: "documentsReceived", label: "Documents reçus",               icon: "📁", weight: 15, desc: "Tous les documents demandés ont été fournis" },
  { key: "addressVerified",   label: "Adresse vérifiée",              icon: "📍", weight: 12, desc: "Adresse physique de l'entreprise confirmée" },
  { key: "websiteVerified",   label: "Site web vérifié",              icon: "🌐", weight: 10, desc: "Site web actif et cohérent avec le profil" },
  { key: "verificationDone",  label: "Vérification terminée",         icon: "✅", weight:  7, desc: "Dossier complet, revue finale effectuée" },
];

export const TRUST_LEVEL_CONFIG = {
  non_verifie: { label: "Non vérifié", color: "#94a3b8", bg: "#f8fafc" },
  bronze:      { label: "Bronze",      color: "#92400e", bg: "#fef3c7" },
  argent:      { label: "Argent",      color: "#475569", bg: "#f1f5f9" },
  or:          { label: "Or",          color: "#b45309", bg: "#fffbeb" },
  platine:     { label: "Platine",     color: "#6d28d9", bg: "#f5f3ff" },
};

export const STATUS_PV_CONFIG = {
  en_cours:    { label: "En cours",       color: "#0284c7", bg: "#e0f2fe" },
  en_attente:  { label: "En attente",     color: "#d97706", bg: "#fef3c7" },
  verifie:     { label: "Vérifié",        color: "#16a34a", bg: "#dcfce7" },
  suspendu:    { label: "Suspendu",       color: "#dc2626", bg: "#fef2f2" },
  rejete:      { label: "Rejeté",         color: "#64748b", bg: "#f8fafc" },
  // Compte partenaire sans aucun dossier de vérification (voir orphanRows,
  // partnerVerificationController.adminList) — distinct de "en_cours" pour ne
  // pas laisser croire qu'un examen est déjà en route.
  not_started: { label: "Sans dossier ⚠️", color: "#dc2626", bg: "#fee2e2" },
};

export const COMPANY_TYPES = [
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

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETING SECTION — CMS, Accueil, Vedette & Campagnes (combiné)
// ═══════════════════════════════════════════════════════════════════════════════
export const MAX_SPOTLIGHTS_M = 5;

// ─── WIP Section ───────────────────────────────────────────────────────────────
export function WipSection({ icon, title, subtitle, features = [] }) {
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
export function Pagination({ page, total, onChange }) {
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

// Miroir EXACT de server/constants/adminScopes.js — toute permission ajoutée
// côté serveur doit apparaître ici, sinon elle devient inattribuable.
export const ADMIN_SCOPE_CFG = [
  { key: "finance",       label: "Finance",         icon: "💰", desc: "Factures, commissions, reversements, paiements, séquestre, tarification." },
  { key: "bookings",      label: "Réservations",    icon: "📋", desc: "Validation des demandes, litiges, statuts, export des commandes." },
  { key: "users",         label: "Comptes",         icon: "👥", desc: "Comptes clients et partenaires : rôles, activation, suppression." },
  { key: "catalogue",     label: "Catalogue",       icon: "🚗", desc: "Annonces véhicules, chauffeurs, activités et publicités." },
  { key: "partners",      label: "Partenaires",     icon: "🤝", desc: "Onboarding, certification, vérification, CRM, showrooms." },
  { key: "transitaire",   label: "Transit & Logistique", icon: "🚢", desc: "Assignation des dossiers export aux transitaires et agents, suivi d'expédition." },
  { key: "kyc",           label: "KYC & Identités", icon: "🛡️", desc: "Dossiers KYC et pièces d'identité soumises." },
  { key: "import_export", label: "Import / Export", icon: "🌍", desc: "Transactions internationales, annonces export, logistique." },
  { key: "support",       label: "Support client",  icon: "💬", desc: "Conversations, notifications, WhatsApp." },
  { key: "assistance",    label: "Demandes d'assistance", icon: "🎫", desc: "Billetterie partenaire — file ordonnée par échéance de réponse." },
  { key: "moderation",    label: "Modération",      icon: "🚩", desc: "Avis clients et signalements." },
];
