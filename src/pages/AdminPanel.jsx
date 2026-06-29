import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import styles from "./AdminPanel.module.css";

// ─── Utilitaires ───────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const ROLE_CONFIG = {
  client:     { label: "Client",     color: "#3b82f6", bg: "#eff6ff" },
  partenaire: { label: "Partenaire", color: "#10b981", bg: "#ecfdf5" },
  admin:      { label: "Admin",      color: "#f59e0b", bg: "#fffbeb" },
  chauffeur:  { label: "Chauffeur",  color: "#8b5cf6", bg: "#f5f3ff" },
};

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
  // KYC Admin
  const [kycList,       setKycList]       = useState([]);
  const [kycLoading,    setKycLoading]    = useState(false);
  const [kycFilter,     setKycFilter]     = useState("");
  const [kycDetailUser, setKycDetailUser] = useState(null);
  const [kycReviewForm, setKycReviewForm] = useState({ decision: "VERIFIE", note: "" });
  const [kycReviewLoading, setKycReviewLoading] = useState(false);
  const [kycReviewMsg,  setKycReviewMsg]  = useState("");
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

  const [stats,     setStats]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [vehicles,  setVehicles]  = useState([]);
  const [bookings,  setBookings]  = useState([]);
  const [drivers,   setDrivers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

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

  useEffect(() => {
    if (activeTab === "import_export") loadImportExport();
    if (activeTab === "importeurs")    loadImporters();
    if (activeTab === "commissions")   loadCommissions();
    if (activeTab === "factures")      loadInvoices();
    if (activeTab === "kyc")           loadKycList(kycFilter);
    if (activeTab === "certification") loadCertList();
  }, [activeTab, loadImportExport, loadImporters, loadCommissions, loadInvoices, loadKycList, kycFilter, loadCertList]);

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
  }, [bkStatus, token]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  const NAV_GROUPS = [
    {
      label: "TABLEAU DE BORD",
      items: [
        { key: "dashboard",  icon: "📊", label: "Vue d'ensemble" },
        { key: "analytics",  icon: "📈", label: "Analytics", wip: true },
      ],
    },
    {
      label: "UTILISATEURS",
      items: [
        { key: "users",      icon: "👥", label: `Comptes (${users.length})` },
        { key: "kyc",        icon: "🛡️", label: "KYC / Identités", badge: pendingKyc },
      ],
    },
    {
      label: "CATALOGUE",
      items: [
        { key: "vehicles",    icon: "🚗", label: "Annonces", badge: pendingVeh },
        { key: "validations", icon: "✅", label: "Validations", badge: pendingVeh + drivers.length + pendingBk },
      ],
    },
    {
      label: "CONTENU",
      items: [
        { key: "accueil", icon: "🏠", label: "Accueil & CMS" },
        { key: "vedette", icon: "⭐", label: "Vedette" },
      ],
    },
    {
      label: "SERVICES",
      items: [
        { key: "bookings",     icon: "📋", label: "Réservations", badge: pendingBk },
        { key: "litiges",      icon: "⚖️", label: "Litiges", badge: disputedBk },
        { key: "chauffeurs",   icon: "👨‍✈️", label: "Chauffeurs", badge: drivers.length },
        { key: "import_export",icon: "🌍", label: "Import / Export", badge: pendingIe },
        { key: "importeurs",   icon: "🏅", label: "Importateurs", badge: pendingImp },
        { key: "transport",    icon: "🚢", label: "Transport Intl.", wip: true },
        { key: "financement",  icon: "🏦", label: "Financement", wip: true },
        { key: "assurance",    icon: "🔒", label: "Assurance", wip: true },
      ],
    },
    {
      label: "FINANCE",
      items: [
        { key: "commissions", icon: "💰", label: "Commissions" },
        { key: "factures",    icon: "📄", label: "Factures", badge: pendingInv },
        { key: "paiements",   icon: "💳", label: "Paiements", wip: true },
        { key: "escrow",      icon: "🔐", label: "Escrow / Séquestre", wip: true },
      ],
    },
    {
      label: "PARTENARIATS",
      items: [
        { key: "certification", icon: "🏆", label: "Certifications", badge: pendingCert },
        { key: "partenaires",   icon: "🤝", label: "Partenaires", wip: true },
        { key: "ads",           icon: "📢", label: "Publicités", wip: true },
      ],
    },
    {
      label: "COMMUNICATION",
      items: [
        { key: "notifications", icon: "🔔", label: "Notifications" },
        { key: "support",       icon: "🎧", label: "Support Client", wip: true },
      ],
    },
    {
      label: "SYSTÈME",
      items: [
        { key: "roles", icon: "🔑", label: "Rôles Admin", wip: true },
        { key: "audit", icon: "📜", label: "Audit Logs",  wip: true },
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

      {/* ── Reject driver modal ── */}
      {driverRejectModal && (
        <div className={styles.overlay} onClick={() => setDriverRejectModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du rejet pour « {driverRejectModal.name} » (facultatif)</p>
            <textarea
              style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Documents insuffisants, informations incomplètes..."
              value={driverRejectReason} onChange={(e) => setDriverRejectReason(e.target.value)}
            />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={() => {
                updateDriverStatus(driverRejectModal.did, "rejected", driverRejectReason);
                setDriverRejectModal(null); setDriverRejectReason("");
              }}>Confirmer le rejet</button>
              <button className={styles.btnGhost} onClick={() => { setDriverRejectModal(null); setDriverRejectReason(""); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject vehicle modal ── */}
      {rejectModal && (
        <div className={styles.overlay} onClick={() => setRejectModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du rejet pour « {rejectModal.name} » (facultatif)</p>
            <textarea
              style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: "0.6rem", fontSize: "0.9rem", marginBottom: "0.75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Images insuffisantes, informations incomplètes..."
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={() => {
                updateVehicleStatus(rejectModal.vid, "rejected", rejectReason);
                setRejectModal(null); setRejectReason("");
              }}>Confirmer le rejet</button>
              <button className={styles.btnGhost} onClick={() => { setRejectModal(null); setRejectReason(""); }}>Annuler</button>
            </div>
          </div>
        </div>
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
            <span className={styles.adminBadge}>🔐 {user.firstName} · Admin</span>

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
          {/* ══════════════════════ TAB ACCUEIL ══════════════════════ */}
          {activeTab === "accueil" && (
            <AccueilSection vehicles={vehicles} token={token} onRefresh={loadAll} />
          )}

          {/* ══════════════════════ TAB VALIDATIONS ══════════════════ */}
          {activeTab === "validations" && (
            <div className={styles.tabContent}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", marginBottom: "1.25rem" }}>
                ✅ File de validation
              </h2>

              {/* Annonces en attente */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <h3 className={styles.chartTitle}>🚗 Annonces en attente ({vehicles.filter((v) => v.status === "pending").length})</h3>
                {vehicles.filter((v) => v.status === "pending").length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "0.9rem", padding: "0.5rem 0" }}>Aucune annonce en attente.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Véhicule</th><th>Type</th><th>Prix</th><th>Score</th><th>Soumis le</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {vehicles.filter((v) => v.status === "pending").map((v) => {
                          const vid = v._id || v.id;
                          const score = v.validationScore;
                          return (
                            <tr key={vid} className={styles.tr}>
                              <td>
                                <div className={styles.vehicleCell}>
                                  {(v.images?.[0] || v.image)
                                    ? <img src={v.images?.[0] || v.image} alt="" className={styles.vehThumb} />
                                    : <div className={styles.vehThumbPlaceholder}>🚗</div>}
                                  <div>
                                    <strong>{v.title || v.name}</strong>
                                    <span className={styles.vehMeta}>{v.marque} {v.modele} {v.annee}</span>
                                  </div>
                                </div>
                              </td>
                              <td><Badge label={v.type === "location" ? "📅 Location" : "💰 Vente"} color="#64748b" bg="#f1f5f9" /></td>
                              <td className={styles.tdPrice}>
                                {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString("fr-FR")} DH/j` :
                                 v.priceForSale ? `${Number(v.priceForSale).toLocaleString("fr-FR")} DH` : "—"}
                              </td>
                              <td>
                                {score != null && (
                                  <span className={styles.scoreChip}
                                    style={{ color: score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444" }}>
                                    {score}/100
                                  </span>
                                )}
                              </td>
                              <td className={styles.tdDate}>{fmtDate(v.createdAt)}</td>
                              <td>
                                <div className={styles.actionBtns}>
                                  <button className={styles.btnApprove}
                                    onClick={() => setConfirm({
                                      message: `Approuver l'annonce "${v.title || v.name}" ?`,
                                      action: () => updateVehicleStatus(vid, "approved"),
                                    })}>✅ Valider</button>
                                  <button className={styles.btnReject}
                                    onClick={() => { setRejectModal({ vid, name: v.title || v.name }); setRejectReason(""); }}>
                                    ✕ Rejeter
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
              </div>

              {/* Chauffeurs en attente */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <h3 className={styles.chartTitle}>👨‍✈️ Chauffeurs en attente ({drivers.length})</h3>
                {drivers.length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "0.9rem", padding: "0.5rem 0" }}>Aucun profil chauffeur en attente.</p>
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
                                {d.profilePhoto
                                  ? <img src={d.profilePhoto} alt="" className={styles.vehThumb} style={{ borderRadius: "50%" }} />
                                  : <div className={styles.vehThumbPlaceholder}>👤</div>}
                                <div>
                                  <strong>{d.firstName} {d.lastName}</strong>
                                  <span className={styles.vehMeta}>{d.title}</span>
                                  {d.owner && <span className={styles.vehMeta} style={{ color: "#64748b" }}>par {d.owner.firstName} {d.owner.lastName}</span>}
                                </div>
                              </div>
                            </td>
                            <td><Badge label={d.disponibilite || "—"} color="#8b5cf6" bg="#f5f3ff" /></td>
                            <td className={styles.tdPrice}>
                              {d.tarif ? `${Number(d.tarif).toLocaleString("fr-FR")} DH/j` : "—"}
                            </td>
                            <td style={{ fontSize: "0.85rem", color: "#64748b" }}>{d.zone || d.ville || "—"}</td>
                            <td className={styles.tdDate}>{fmtDate(d.createdAt)}</td>
                            <td>
                              <div className={styles.actionBtns}>
                                <button className={styles.btnApprove}
                                  onClick={() => setConfirm({
                                    message: `Approuver le profil de ${d.firstName} ${d.lastName} ?`,
                                    action: () => updateDriverStatus(d._id, "approved"),
                                  })}>✅ Valider</button>
                                <button className={styles.btnReject}
                                  onClick={() => { setDriverRejectModal({ did: d._id, name: `${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>
                                  ✕ Rejeter
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Commandes en attente */}
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>📋 Commandes en attente ({bookings.filter((b) => b.status === "pending").length})</h3>
                {bookings.filter((b) => b.status === "pending").length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "0.9rem", padding: "0.5rem 0" }}>Aucune commande en attente.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Client</th><th>Véhicule</th><th>Type</th><th>Montant</th><th>Date</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {bookings.filter((b) => b.status === "pending").map((b) => {
                          const clientName = `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim() || "—";
                          const vName = b.vehicle
                            ? [b.vehicle.title, b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ")
                            : "—";
                          const typeLabels = { location: "📅 Location", essai: "🔑 Essai", chauffeur: "🚘 Chauffeur", leasing: "🏦 Leasing", import_export: "🌍 Import/Export" };
                          return (
                            <tr key={b._id} className={styles.tr}>
                              <td><div><strong>{clientName}</strong><span className={styles.vehMeta}>{b.clientInfo?.email}</span></div></td>
                              <td className={styles.tdVeh}>{vName}</td>
                              <td><Badge label={typeLabels[b.type] || b.type} color="#64748b" bg="#f1f5f9" /></td>
                              <td className={styles.tdPrice}>
                                {b.montantTotal > 0 ? `${Number(b.montantTotal).toLocaleString("fr-FR")} DH` : "—"}
                              </td>
                              <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                              <td>
                                <div className={styles.actionBtns}>
                                  <button className={styles.btnApprove}
                                    onClick={() => setBkActionModal({ id: b._id, name: clientName, action: "confirmed" })}>
                                    ✅ Confirmer
                                  </button>
                                  <button className={styles.btnReject}
                                    onClick={() => { setBkActionModal({ id: b._id, name: clientName, action: "cancelled" }); setBkCancelReason(""); }}>
                                    ✕ Annuler
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
              </div>
            </div>
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
                  value={Number(stats?.revenue?.total || 0).toLocaleString("fr-FR") + " DH"}
                  sub={`Ce mois : ${Number(stats?.revenue?.thisMonth || 0).toLocaleString("fr-FR")} DH`}
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
                  <button className={styles.alertBtn} onClick={() => setActiveTab("vehicles")}>Voir →</button>
                </div>
              )}
              {(stats?.bookings?.pending || 0) > 0 && (
                <div className={styles.alertBanner} style={{ borderColor: "#6366f1", background: "#f0f4ff" }}>
                  <span>📋</span>
                  <span>{stats.bookings.pending} commande{stats.bookings.pending > 1 ? "s" : ""} en attente de confirmation partenaire</span>
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
                          <div
                            className={styles.chartBar}
                            style={{ height: `${Math.round((m.total / maxRev) * 100)}%` }}
                          />
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

              {/* Résumé utilisateurs */}
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
              {/* Filtres */}
              <div className={styles.filterBar}>
                <input
                  className={styles.searchInput}
                  placeholder="🔍 Rechercher un utilisateur..."
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                />
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

              {/* Table */}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Utilisateur</th>
                      <th>Email</th>
                      <th>Rôle</th>
                      <th>Statut</th>
                      <th>Inscrit le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(filteredUsers, userPage).map((u) => {
                      const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.client;
                      const isSelf = u._id === user._id;
                      return (
                        <tr key={u._id} className={`${styles.tr} ${!u.isActive ? styles.trBlocked : ""}`}>
                          <td>
                            <div className={styles.userCell}>
                              <div className={styles.avatar}>
                                {u.profilePhoto
                                  ? <img src={u.profilePhoto} alt="" />
                                  : <span>{(u.firstName?.[0] || "?").toUpperCase()}</span>}
                              </div>
                              <div>
                                <strong>{u.firstName} {u.lastName}</strong>
                                {isSelf && <span className={styles.selfTag}>Vous</span>}
                              </div>
                            </div>
                          </td>
                          <td className={styles.tdEmail}>{u.email}</td>
                          <td>
                            <select
                              className={styles.roleSelect}
                              value={u.role}
                              disabled={isSelf}
                              onChange={(e) => setConfirm({
                                message: `Changer le rôle de ${u.firstName} en "${e.target.value}" ?`,
                                action: () => changeRole(u._id, e.target.value),
                              })}
                              style={{ color: rc.color, background: rc.bg, borderColor: rc.color + "60" }}
                            >
                              <option value="client">Client</option>
                              <option value="partenaire">Partenaire</option>
                              <option value="admin">Admin</option>
                              <option value="chauffeur">Chauffeur</option>
                            </select>
                          </td>
                          <td>
                            {u.isActive
                              ? <Badge label="Actif" color="#10b981" bg="#ecfdf5" />
                              : <Badge label="Bloqué" color="#ef4444" bg="#fef2f2" />}
                          </td>
                          <td className={styles.tdDate}>{fmtDate(u.createdAt)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              {!isSelf && (
                                <button
                                  className={u.isActive ? styles.btnBlock : styles.btnUnblock}
                                  onClick={() => setConfirm({
                                    message: `${u.isActive ? "Bloquer" : "Débloquer"} le compte de ${u.firstName} ${u.lastName} ?`,
                                    action: () => toggleBlock(u._id),
                                  })}
                                  title={u.isActive ? "Bloquer" : "Débloquer"}
                                >
                                  {u.isActive ? "🚫 Bloquer" : "✅ Débloquer"}
                                </button>
                              )}
                              {!isSelf && (
                                <button
                                  className={styles.btnDeleteSm}
                                  onClick={() => setConfirm({
                                    message: `Supprimer définitivement ${u.firstName} ${u.lastName} ? Cette action est irréversible.`,
                                    danger: true,
                                    action: () => deleteUser(u._id),
                                  })}
                                  title="Supprimer"
                                >
                                  🗑️
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

              <Pagination page={userPage} total={totalPages(filteredUsers)} onChange={setUserPage} />
            </div>
          )}

          {/* ══════════════════════ TAB VÉHICULES ══════════════════════ */}
          {activeTab === "vehicles" && (
            <div className={styles.tabContent}>
              <div className={styles.filterBar}>
                <select className={styles.filterSelect} value={vehStatus}
                  onChange={(e) => { setVehStatus(e.target.value); setVehPage(1); }}>
                  <option value="all">Tous les statuts</option>
                  <option value="approved">Publiées</option>
                  <option value="pending">En attente</option>
                  <option value="rejected">Rejetées</option>
                </select>
                <span className={styles.filterCount}>{filteredVehicles.length} annonce{filteredVehicles.length !== 1 ? "s" : ""}</span>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Véhicule</th>
                      <th>Type</th>
                      <th>Prix</th>
                      <th>Score</th>
                      <th>Statut</th>
                      <th>Publié le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(filteredVehicles, vehPage).map((v) => {
                      const vid = v._id || v.id;
                      const sc  = STATUS_VEH[v.status] || STATUS_VEH.pending;
                      const score = v.validationScore;
                      return (
                        <tr key={vid} className={styles.tr}>
                          <td>
                            <div className={styles.vehicleCell}>
                              {(v.images?.[0] || v.image)
                                ? <img src={v.images?.[0] || v.image} alt="" className={styles.vehThumb} />
                                : <div className={styles.vehThumbPlaceholder}>🚗</div>}
                              <div>
                                <strong>{v.title || v.name}</strong>
                                <span className={styles.vehMeta}>{v.marque} {v.modele} {v.annee}</span>
                              </div>
                            </div>
                          </td>
                          <td><Badge label={v.type === "location" ? "📅 Location" : "💰 Vente"} color="#64748b" bg="#f1f5f9" /></td>
                          <td className={styles.tdPrice}>
                            {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString("fr-FR")} DH/j` :
                             v.priceForSale ? `${Number(v.priceForSale).toLocaleString("fr-FR")} DH` : "—"}
                          </td>
                          <td>
                            {score != null && (
                              <span className={styles.scoreChip}
                                style={{ color: score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444" }}>
                                {score}/100
                              </span>
                            )}
                          </td>
                          <td><Badge label={sc.label} color={sc.color} bg={sc.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(v.createdAt)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              {v.status !== "approved" && (
                                <button className={styles.btnApprove}
                                  onClick={() => setConfirm({
                                    message: `Approuver l'annonce "${v.title || v.name}" ?`,
                                    action: () => updateVehicleStatus(vid, "approved"),
                                  })}>✅ Valider</button>
                              )}
                              {v.status !== "rejected" && (
                                <button className={styles.btnReject}
                                  onClick={() => { setRejectModal({ vid, name: v.title || v.name }); setRejectReason(""); }}>
                                  ✕ Rejeter
                                </button>
                              )}
                              <button className={styles.btnDeleteSm}
                                onClick={() => setConfirm({
                                  message: `Supprimer définitivement cette annonce ?`,
                                  danger: true,
                                  action: () => deleteVehicle(vid),
                                })}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination page={vehPage} total={totalPages(filteredVehicles)} onChange={setVehPage} />
            </div>
          )}

          {/* ══════════════════════ TAB COMMANDES ══════════════════════ */}
          {activeTab === "bookings" && (
            <div className={styles.tabContent}>

              {/* ── KPIs commandes ── */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:10, marginBottom:16 }}>
                {[
                  { l:"Toutes",        v: bookings.length,                                                    c:"#6366f1", s:"all"  },
                  { l:"Nouvelles",     v: bookings.filter(b=>b.status==="pending").length,                    c:"#f59e0b", s:"pending" },
                  { l:"En cours",      v: bookings.filter(b=>["confirmed","preparing","ready","in_progress","client_arrived"].includes(b.status)).length, c:"#2563eb", s:"confirmed" },
                  { l:"À valider",     v: bookings.filter(b=>b.status==="waiting_client_validation").length,  c:"#d97706", s:"waiting_client_validation" },
                  { l:"Terminées",     v: bookings.filter(b=>b.status==="completed").length,                  c:"#059669", s:"completed" },
                  { l:"Litiges",       v: bookings.filter(b=>b.status==="disputed").length,                   c:"#dc2626", s:"disputed" },
                  { l:"Annulées",      v: bookings.filter(b=>b.status==="cancelled").length,                  c:"#94a3b8", s:"cancelled" },
                ].map(k => (
                  <button key={k.s} onClick={() => { setBkStatus(k.s); setBkPage(1); }}
                    style={{ background: bkStatus === k.s ? k.c : "#f8fafc", color: bkStatus===k.s?"#fff":k.c, border:`2px solid ${k.c}`, borderRadius:10, padding:"8px 6px", cursor:"pointer", fontWeight:700, fontSize:"0.8rem" }}>
                    <div style={{ fontSize:"1.3rem", lineHeight:1.2 }}>{k.v}</div>
                    <div style={{ fontSize:"0.7rem", opacity:.85 }}>{k.l}</div>
                  </button>
                ))}
              </div>

              {/* ── Barre filtres + recherche + export ── */}
              <div className={styles.filterBar} style={{ flexWrap:"wrap", gap:8 }}>
                <input type="search" placeholder="Ref., client, email, tel…" value={bkSearch}
                  onChange={e => { setBkSearch(e.target.value); setBkPage(1); }}
                  style={{ flex:1, minWidth:160, padding:"0.4rem 0.75rem", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:"0.85rem" }} />
                <select className={styles.filterSelect} value={bkType}
                  onChange={e => { setBkType(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous types</option>
                  <option value="location">📅 Location</option>
                  <option value="essai">🔑 Essai/Vente</option>
                  <option value="chauffeur">🚘 Chauffeur</option>
                  <option value="leasing">🏦 Leasing</option>
                </select>
                <select className={styles.filterSelect} value={bkStatus}
                  onChange={e => { setBkStatus(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous statuts</option>
                  <option value="pending">Nouvelles</option>
                  <option value="confirmed">Acceptées</option>
                  <option value="preparing">En préparation</option>
                  <option value="ready">Prêtes</option>
                  <option value="in_progress">En route</option>
                  <option value="client_arrived">Client présent</option>
                  <option value="waiting_client_validation">À valider</option>
                  <option value="completed">Terminées</option>
                  <option value="disputed">⚠️ Litiges</option>
                  <option value="cancelled">Annulées</option>
                </select>
                <span className={styles.filterCount}>{filteredBookings.length} résultat{filteredBookings.length!==1?"s":""}</span>
                <button onClick={() => exportBookings("csv")} style={{ padding:"0.4rem 0.9rem", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:"0.8rem", fontWeight:700 }}>
                  ⬇️ CSV
                </button>
                <button onClick={loadAll} className={styles.btnRefresh}>↻</button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Client / KYC</th>
                      <th>Véhicule / Type</th>
                      <th>Montant</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
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
                      const isActive   = !["completed","cancelled","disputed"].includes(b.status);

                      return (
                        <tr key={b._id} className={styles.tr} style={isDisputed ? { background:"#fff5f5" } : {}}>
                          <td>
                            <div>
                              <strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>
                                {b.reference || b._id?.slice(-6)}
                              </strong>
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
                              {/* Contrat */}
                              {b.contract && (
                                <Link to={`/contract/${b._id}`} target="_blank" rel="noopener noreferrer"
                                  className={styles.contractLink} title="Voir contrat">📄</Link>
                              )}
                              {/* Reçu PDF */}
                              <a href={`/api/bookings/${b._id}/receipt`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize:"0.7rem", padding:"2px 6px", background:"#f1f5f9", color:"#0f1b3f", borderRadius:6, textDecoration:"none" }} title="Reçu PDF">🧾</a>

                              {/* Confirmer si pending */}
                              {b.status === "pending" && (
                                <button className={styles.btnApprove} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                                  onClick={() => setBkActionModal({ id:b._id, name:clientName, action:"confirmed" })} title="Confirmer">✅</button>
                              )}

                              {/* Forcer complétion si commande bloquée */}
                              {isActive && b.status !== "pending" && (
                                <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#e0f2fe", color:"#0369a1", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                                  onClick={() => { setForceModal({ booking:b }); setForceAmount(b.montantTotal||""); setForceNote(""); }}
                                  title="Forcer complétion">⚡</button>
                              )}

                              {/* Résoudre litige */}
                              {isDisputed && (
                                <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                                  onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}
                                  title="Résoudre litige">⚖️</button>
                              )}

                              {/* Annuler */}
                              {!["cancelled","completed"].includes(b.status) && (
                                <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                                  onClick={() => { setBkActionModal({ id:b._id, name:clientName, action:"cancelled" }); setBkCancelReason(""); }}
                                  title="Annuler">✕</button>
                              )}

                              {/* Supprimer (cancelled uniquement) */}
                              {b.status === "cancelled" && (
                                <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", opacity:.7 }}
                                  onClick={() => setConfirm({ message:`Supprimer définitivement la commande ${b.reference||""}?`, onConfirm:()=>adminDeleteBooking(b._id), danger:true })}
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

          {/* ══════════════════════ TAB IMPORT/EXPORT ══════════════════════ */}
          {activeTab === "import_export" && (
            <div className={styles.tabContent}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
                  🌍 Demandes Import / Export International
                </h2>
                <button className={styles.btnRefresh} onClick={loadImportExport}>↻ Actualiser</button>
              </div>

              {/* KPIs Import/Export */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
                {[
                  { icon: "📥", label: "Total reçues",  value: ieRequests.length, color: "#6366f1" },
                  { icon: "⏳", label: "En attente",    value: ieRequests.filter((r) => r.status === "pending").length,   color: "#f59e0b" },
                  { icon: "✅", label: "Traitées",      value: ieRequests.filter((r) => r.status === "approved").length,  color: "#10b981" },
                  { icon: "❌", label: "Rejetées",      value: ieRequests.filter((r) => r.status === "rejected").length,  color: "#ef4444" },
                ].map((k) => (
                  <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />
                ))}
              </div>

              {/* Zones couvertes */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <h3 className={styles.chartTitle}>🗺️ Zones de couverture actives</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                  {[
                    { flag: "🇨🇳", label: "Chine", color: "#ef4444" },
                    { flag: "🇦🇪", label: "Dubaï / EAU", color: "#f59e0b" },
                    { flag: "🇩🇪", label: "Allemagne", color: "#3b82f6" },
                    { flag: "🇫🇷", label: "France", color: "#3b82f6" },
                    { flag: "🇧🇪", label: "Belgique", color: "#3b82f6" },
                    { flag: "🇳🇱", label: "Pays-Bas", color: "#3b82f6" },
                    { flag: "🇪🇸", label: "Espagne", color: "#3b82f6" },
                    { flag: "🇮🇹", label: "Italie", color: "#3b82f6" },
                    { flag: "🇲🇦", label: "Maroc", color: "#10b981" },
                    { flag: "🇩🇿", label: "Algérie", color: "#10b981" },
                    { flag: "🇹🇳", label: "Tunisie", color: "#10b981" },
                    { flag: "🇨🇮", label: "Côte d'Ivoire", color: "#10b981" },
                    { flag: "🇸🇳", label: "Sénégal", color: "#10b981" },
                    { flag: "🇬🇭", label: "Ghana", color: "#10b981" },
                    { flag: "🇳🇬", label: "Nigeria", color: "#10b981" },
                    { flag: "🇧🇯", label: "Bénin", color: "#10b981" },
                    { flag: "🇹🇬", label: "Togo", color: "#10b981" },
                    { flag: "🇲🇱", label: "Mali", color: "#10b981" },
                    { flag: "🇬🇳", label: "Guinée", color: "#10b981" },
                    { flag: "🇲🇷", label: "Mauritanie", color: "#10b981" },
                  ].map((z) => (
                    <span key={z.label} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "5px 12px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600,
                      background: z.color + "14", color: z.color, border: `1px solid ${z.color}30`,
                    }}>
                      {z.flag} {z.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Packs actifs */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <h3 className={styles.chartTitle}>📦 Packs Import Assist — Tarification</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 12, marginTop: 12 }}>
                  {[
                    { name: "Silver", price: "À partir de 299 €", color: "#94a3b8", features: ["Vérification vendeur", "Assistance achat", "Suivi dossier"] },
                    { name: "Gold",   price: "À partir de 599 €", color: "#f59e0b", features: ["+ Inspection pro", "Suivi logistique", "Support prioritaire"] },
                    { name: "Platinum", price: "Sur devis",       color: "#6366f1", features: ["Gestion complète", "Dédouanement", "Livraison porte-à-porte"] },
                    { name: "Executive", price: "Sur devis",      color: "#ff4d2d", features: ["Conciergerie 24h/7j", "Financement & assurance", "Garantie satisfaction"] },
                  ].map((p) => (
                    <div key={p.name} style={{
                      border: `1.5px solid ${p.color}33`, borderRadius: 12, padding: "16px 14px",
                      background: `${p.color}08`,
                    }}>
                      <div style={{ fontWeight: 900, color: p.color, fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{p.name}</div>
                      <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "1rem", marginBottom: 8 }}>{p.price}</div>
                      {p.features.map((f) => (
                        <div key={f} style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 3 }}>
                          <span style={{ color: p.color, marginRight: 5 }}>✓</span>{f}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Table des demandes */}
              {ieLoading ? (
                <div className={styles.loadingBox} style={{ minHeight: 120 }}>
                  <div className={styles.spinner} /><p>Chargement des demandes...</p>
                </div>
              ) : ieRequests.length === 0 ? (
                <div className={styles.chartCard}>
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🌍</div>
                    <p style={{ fontWeight: 700, color: "#64748b", margin: "0 0 6px" }}>Aucune demande Import/Export pour l'instant</p>
                    <p style={{ fontSize: "0.85rem", margin: 0 }}>Les demandes soumises via la page Import/Export apparaîtront ici.</p>
                    <a href="/import-export" target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-block", marginTop: 14, color: "#ff4d2d", fontWeight: 700, fontSize: "0.85rem", textDecoration: "none" }}>
                      Voir la page Import/Export →
                    </a>
                  </div>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Pack</th>
                        <th>Pays source</th>
                        <th>Destination</th>
                        <th>Budget</th>
                        <th>Statut</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ieRequests.map((r) => {
                        const stCfg = {
                          pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb" },
                          approved: { label: "Traité",      color: "#10b981", bg: "#ecfdf5" },
                          rejected: { label: "Rejeté",      color: "#ef4444", bg: "#fef2f2" },
                        }[r.status] || { label: r.status, color: "#94a3b8", bg: "#f8fafc" };
                        return (
                          <tr key={r._id} className={styles.tr}>
                            <td>
                              <strong>{r.firstName} {r.lastName}</strong>
                              <span className={styles.vehMeta}>{r.email}</span>
                            </td>
                            <td><Badge label={r.pack || "—"} color="#6366f1" bg="#f0f4ff" /></td>
                            <td style={{ fontSize: "0.85rem" }}>{r.sourceCountry || "—"}</td>
                            <td style={{ fontSize: "0.85rem" }}>{r.destCountry || "—"}</td>
                            <td className={styles.tdPrice}>{r.budget ? `${r.budget} €` : "—"}</td>
                            <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                            <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                            <td>
                              <div className={styles.actionBtns}>
                                {["pending", "processing", "approved", "contacted"].includes(r.status) && (
                                  <select
                                    style={{ padding: "5px 8px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".78rem", cursor: "pointer" }}
                                    value={r.status}
                                    onChange={async (e) => {
                                      await fetch(`/api/import-export/requests/${r._id}/status`, {
                                        method: "PATCH", headers,
                                        body: JSON.stringify({ status: e.target.value }),
                                      });
                                      loadImportExport();
                                      showToast(`Statut → ${e.target.value}`);
                                    }}
                                  >
                                    <option value="pending">⏳ En attente</option>
                                    <option value="processing">🔄 En traitement</option>
                                    <option value="contacted">📞 Contacté</option>
                                    <option value="approved">✅ Traité</option>
                                    <option value="rejected">❌ Rejeté</option>
                                  </select>
                                )}
                                <button
                                  className={styles.btnDanger}
                                  style={{ fontSize: ".75rem", padding: "4px 8px" }}
                                  onClick={async () => {
                                    if (!confirm("Supprimer cette demande ?")) return;
                                    await fetch(`/api/import-export/requests/${r._id}`, { method: "DELETE", headers });
                                    loadImportExport();
                                    showToast("Demande supprimée");
                                  }}
                                >🗑</button>
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

          {/* ══════════════════════ TAB VEDETTE ══════════════════════ */}
          {activeTab === "vedette" && (
            <VetteSection vehicles={vehicles} token={token} onRefresh={loadAll} />
          )}

          {/* ══════════════════════ TAB IMPORTATEURS ══════════════════════ */}
          {activeTab === "importeurs" && (
            <div className={styles.tabContent}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>
                  🏅 Partenaires Importateurs — Vérification & Annonces
                </h2>
                <button className={styles.btnRefresh} onClick={loadImporters}>↻ Actualiser</button>
              </div>

              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
                {[
                  { icon: "📋", label: "Total candidatures", value: importerProfiles.length, color: "#6366f1" },
                  { icon: "⏳", label: "En attente",          value: importerProfiles.filter(p => p.status === "pending").length,  color: "#f59e0b" },
                  { icon: "✅", label: "Vérifiés",            value: importerProfiles.filter(p => p.status === "verified").length, color: "#10b981" },
                  { icon: "❌", label: "Refusés",             value: importerProfiles.filter(p => p.status === "rejected").length, color: "#ef4444" },
                  { icon: "📢", label: "Annonces en attente", value: importerListings.filter(l => l.status === "pending").length,  color: "#f59e0b" },
                ].map((k) => (
                  <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />
                ))}
              </div>

              {/* ── SECTION 1 : Candidatures ── */}
              <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0 }}>📋 Candidatures importateurs</h3>
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
                                  {/* Voir documents */}
                                  {p.documents && Object.values(p.documents).some(Boolean) && (
                                    <button
                                      className={styles.btnGhost}
                                      style={{ fontSize: ".75rem", padding: "4px 10px" }}
                                      onClick={() => {
                                        const docs = p.documents;
                                        const keys = { rccmImage: "RCCM", taxIdImage: "NIF", licenseImage: "Agrément", companyLogo: "Logo", bankStatement: "Relevé" };
                                        const w = window.open("", "_blank");
                                        w.document.write(`<html><body style="background:#0f1b3f;color:#fff;font-family:sans-serif;padding:24px">`);
                                        w.document.write(`<h2>Documents — ${p.companyName}</h2>`);
                                        Object.entries(keys).forEach(([k, l]) => {
                                          if (docs[k]) w.document.write(`<div style="margin:16px 0"><h3>${l}</h3><img src="${docs[k]}" style="max-width:100%;border-radius:8px"/></div>`);
                                        });
                                        w.document.write(`</body></html>`);
                                      }}
                                    >📁 Docs</button>
                                  )}
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
                                          await fetch(`/api/import-export/listings/${l._id}/status`, {
                                            method: "PATCH", headers,
                                            body: JSON.stringify({ status: "approved" }),
                                          });
                                          showToast("Annonce publiée !");
                                          loadImporters();
                                        }}>✅ Publier</button>
                                      <button className={styles.btnReject}
                                        onClick={() => { setListingRejectModal(l); setListingRejectNote(""); }}>
                                        ✕ Refuser</button>
                                    </>
                                  )}
                                  {l.status === "approved" && (
                                    <button className={styles.btnReject}
                                      onClick={async () => {
                                        await fetch(`/api/import-export/listings/${l._id}/status`, {
                                          method: "PATCH", headers,
                                          body: JSON.stringify({ status: "archived" }),
                                        });
                                        showToast("Annonce archivée.");
                                        loadImporters();
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
                      await fetch(`/api/import-export/importer-profiles/${reviewModal._id}/review`, {
                        method: "PATCH", headers,
                        body: JSON.stringify(reviewDecision),
                      });
                      showToast(reviewDecision.status === "verified" ? "Profil validé !" : "Profil refusé.", reviewDecision.status === "rejected" ? "error" : "success");
                      setReviewModal(null);
                      loadImporters();
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
                      await fetch(`/api/import-export/listings/${listingRejectModal._id}/status`, {
                        method: "PATCH", headers,
                        body: JSON.stringify({ status: "rejected", adminNote: listingRejectNote }),
                      });
                      showToast("Annonce refusée.", "error");
                      setListingRejectModal(null);
                      loadImporters();
                    }}>Confirmer le refus</button>
                  <button className={styles.btnGhost} onClick={() => setListingRejectModal(null)}>Annuler</button>
                </div>
              </div>
            </div>
          )}
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
              { v: "",                      l: "En attente", ic: "📋" },
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
                      onClick={() => { setKycDetailUser(u); setKycReviewForm({ decision: u.kycStatus === "VERIFIE" ? "EN_ATTENTE" : "VERIFIE", note: "" }); setKycReviewMsg(""); }}
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
              <div style={{ background: "#fff", borderRadius: 20, padding: "0", maxWidth: 580, width: "96%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}
                onClick={(e) => e.stopPropagation()}>

                {/* Header modal */}
                <div style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: "20px 20px 0 0", padding: "20px 24px", color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>🛡️ Dossier KYC</div>
                      <div style={{ fontSize: ".95rem", opacity: .85, marginTop: 2 }}>{kycDetailUser.firstName} {kycDetailUser.lastName}</div>
                    </div>
                    <button onClick={() => setKycDetailUser(null)} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 1.1 + "rem", cursor: "pointer" }}>✕</button>
                  </div>
                </div>

                <div style={{ padding: "20px 24px" }}>
                  {/* Indicateurs rapides */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
                    {[
                      { l: "Score KYC", v: `${kycDetailUser.kycScore ?? 0}/100` },
                      { l: "OCR Confiance", v: `${kycDetailUser.kycOcrData?.ocrConfidence ?? 0}%` },
                      { l: "Face match", v: kycDetailUser.kycFaceMatchScore !== null ? `${kycDetailUser.kycFaceMatchScore}%` : "—" },
                    ].map(({ l, v }) => (
                      <div key={l} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: ".7rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f1b3f", marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Infos contact */}
                  <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", color: "#334155" }}>
                    <div><span style={{ color: "#94a3b8" }}>Email </span>{kycDetailUser.email} {kycDetailUser.emailVerified ? "✅" : "❌"}</div>
                    <div><span style={{ color: "#94a3b8" }}>Tél. </span>{kycDetailUser.phone || "—"} {kycDetailUser.phoneVerified ? "✅" : "❌"}</div>
                    <div><span style={{ color: "#94a3b8" }}>Rôle </span>{kycDetailUser.role}</div>
                    <div><span style={{ color: "#94a3b8" }}>Soumis </span>{kycDetailUser.kycSubmittedAt ? new Date(kycDetailUser.kycSubmittedAt).toLocaleDateString("fr-FR") : "—"}</div>
                  </div>

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
      {activeTab === "partenaires" && <WipSection icon="🤝" title="Gestion des Partenariats" subtitle="Contrats partenaires, commissions, et tableau de bord dédié par partenaire stratégique." features={["Concessionnaires, loueurs, assureurs, banques","Contrats : date, commission, statut","Tableau de bord commissions par partenaire","Catégories : BYD, Hyundai, Total, NSIA..."]} />}
      {activeTab === "ads"         && <WipSection icon="📢" title="Publicités & Sponsoring" subtitle="Bannières publicitaires, annonces sponsorisées et gestion des campagnes marketing." features={["Bannières homepage et catégories","Véhicules sponsorisés : mise en avant","Gestion des budgets de campagne","Statistiques de clics et de conversions"]} />}
      {activeTab === "support"     && <WipSection icon="🎧" title="Support Client" subtitle="Système de tickets multi-canal avec priorités et messagerie interne." features={["Tickets : technique / paiement / import / location","Priorités : Faible / Moyenne / Urgente","Messagerie admin ↔ client","SLA et temps de réponse moyen"]} />}
      {activeTab === "roles"       && <WipSection icon="🔑" title="Rôles Admin" subtitle="Gestion fine des permissions par rôle : Super Admin, Finance, KYC, Import, Support, Modérateur." features={["Super Admin — accès total","Admin Finance — paiements et commissions","Admin KYC — identités et documents","Admin Import/Export — dossiers internationaux","Admin Support — tickets clients","Modérateur — annonces et contenu"]} />}
      {activeTab === "audit"       && <WipSection icon="📜" title="Audit Logs" subtitle="Journal complet et inviolable de toutes les actions effectuées par les administrateurs." features={["Historique complet de chaque action admin","Filtres par date, admin, type d'action","Export CSV / PDF pour conformité réglementaire","Alertes automatiques sur les actions sensibles"]} />}

        </div>
      </div>
    </div>
  );
}

// ─── AccueilSection — Gestion de la page d'accueil ─────────────────────────────
const MAX_SPOTLIGHTS = 5;

function AccueilSection({ vehicles, token, onRefresh }) {
  const approved = vehicles.filter((v) => v.status === "approved" || v.available);

  // Tableau de IDs spotlight (jusqu'à 5) stocké en JSON
  const [spotlightIds, setSpotlightIds] = useState(() => {
    try {
      const saved = localStorage.getItem("vit_hero_spotlights");
      if (saved) return JSON.parse(saved);
      // Rétrocompat : ancienne clé unique
      const legacy = localStorage.getItem("vit_hero_spotlight");
      return legacy ? [legacy] : [];
    } catch { return []; }
  });

  const [saving, setSaving]     = useState(null);
  const [heroText, setHeroText] = useState(() => localStorage.getItem("vit_hero_title") || "");
  const [heroSub,  setHeroSub]  = useState(() => localStorage.getItem("vit_hero_sub")   || "");
  const [savedMsg, setSavedMsg] = useState("");

  const featuredCount = approved.filter((v) => v.featured).length;

  const flash = (msg) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 2800); };

  const saveSpotlights = (ids) => {
    localStorage.setItem("vit_hero_spotlights", JSON.stringify(ids));
    localStorage.setItem("vit_hero_spotlight", ids[0] || ""); // rétrocompat
    setSpotlightIds(ids);
  };

  const toggleSpotlight = (vid) => {
    const str = String(vid);
    if (spotlightIds.includes(str)) {
      const next = spotlightIds.filter((id) => id !== str);
      saveSpotlights(next);
      flash("Retiré du carrousel");
    } else if (spotlightIds.length >= MAX_SPOTLIGHTS) {
      flash(`Maximum ${MAX_SPOTLIGHTS} véhicules dans le carrousel`);
    } else {
      const next = [...spotlightIds, str];
      saveSpotlights(next);
      flash(`Ajouté au carrousel (${next.length}/${MAX_SPOTLIGHTS})`);
    }
  };

  const moveSpotlight = (idx, dir) => {
    const next = [...spotlightIds];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    saveSpotlights(next);
  };

  const saveTexts = () => {
    localStorage.setItem("vit_hero_title", heroText);
    localStorage.setItem("vit_hero_sub",   heroSub);
    flash("Textes sauvegardés !");
  };

  const toggleFeatured = async (vid, current) => {
    setSaving(String(vid));
    try {
      const res = await fetch(`/api/vehicles/${vid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ featured: !current }),
      });
      if (res.ok) onRefresh();
    } catch { /* */ }
    setSaving(null);
  };

  const s = {
    block: { background: "#fff", border: "1.5px solid #e8edf8", borderRadius: 16, padding: "20px 24px", marginBottom: 20 },
    label: { fontSize: "0.8rem", fontWeight: 700, color: "#0f1b3f", display: "block", marginBottom: 6 },
    input: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: "0.88rem", fontFamily: "inherit", boxSizing: "border-box" },
    row:   { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1.5px solid #e8edf8", borderRadius: 12, marginBottom: 8, background: "#fff" },
    badge: (color, bg) => ({ background: bg, color, fontSize: "0.68rem", fontWeight: 800, padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap" }),
    btn:   (bg, color = "#fff", extra = {}) => ({ background: bg, color, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra }),
  };

  return (
    <div style={{ padding: "1.5rem 0" }}>
      {/* Titre section */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ fontSize: "1.4rem" }}>🏠</span>
        <div>
          <h2 style={{ margin: "0 0 3px", fontSize: "1.2rem", color: "#0f1b3f", fontWeight: 800 }}>
            Gestion de la page d'accueil
          </h2>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#8493b0" }}>
            Carrousel Hero (3-5 slides), textes, vedette «Section du moment».
          </p>
        </div>
      </div>

      {savedMsg && (
        <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 10, padding: "10px 16px", marginBottom: 16, color: "#065f46", fontWeight: 700, fontSize: "0.88rem" }}>
          ✅ {savedMsg}
        </div>
      )}

      {/* ── Textes bannière ── */}
      <div style={s.block}>
        <h3 style={{ margin: "0 0 14px", fontSize: "0.95rem", color: "#0f1b3f", fontWeight: 800 }}>
          ✍️ Textes de la bannière principale
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={s.label}>Titre (laissez vide pour le titre par défaut)</label>
            <input style={s.input} value={heroText} onChange={(e) => setHeroText(e.target.value)}
              placeholder="Ex : Location & vente de véhicules premium" />
          </div>
          <div>
            <label style={s.label}>Sous-titre</label>
            <input style={s.input} value={heroSub} onChange={(e) => setHeroSub(e.target.value)}
              placeholder="Ex : Livraison GPS à domicile, paiement sécurisé, 14 pays..." />
          </div>
          <button style={{ ...s.btn("#0f1b3f"), width: "fit-content", marginTop: 4 }} onClick={saveTexts}>
            💾 Sauvegarder
          </button>
        </div>
      </div>

      {/* ── Carrousel Hero (3-5 véhicules) ── */}
      <div style={s.block}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "0.95rem", color: "#0f1b3f", fontWeight: 800 }}>
              🎬 Carrousel Hero — {spotlightIds.length}/{MAX_SPOTLIGHTS} slides sélectionnées
            </h3>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#8493b0" }}>
              Sélectionnez entre 1 et {MAX_SPOTLIGHTS} véhicules pour le carrousel principal de l'accueil (défilement 5 s).
            </p>
          </div>
          {spotlightIds.length > 0 && (
            <button style={{ ...s.btn("#ef4444"), fontSize: "0.72rem", padding: "4px 12px" }}
              onClick={() => { saveSpotlights([]); flash("Carrousel réinitialisé"); }}>
              Tout retirer
            </button>
          )}
        </div>

        {/* Ordre actuel */}
        {spotlightIds.length > 0 && (
          <div style={{ background: "#f8faff", border: "1px solid #e8edf8", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 10px", fontSize: "0.78rem", fontWeight: 700, color: "#5a6a8a" }}>
              Ordre d'affichage (glissez avec ↑↓) :
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {spotlightIds.map((sid, idx) => {
                const v = approved.find((x) => (x._id || x.id)?.toString() === sid);
                if (!v) return null;
                return (
                  <div key={sid} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e0e7ff", borderRadius: 8, padding: "7px 10px" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#6366f1", minWidth: 20 }}>#{idx + 1}</span>
                    {(v.images?.[0] || v.image) && <img src={v.images?.[0] || v.image} alt="" style={{ width: 36, height: 26, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
                    <span style={{ flex: 1, fontSize: "0.82rem", fontWeight: 600, color: "#0f1b3f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.title || v.name}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button disabled={idx === 0} style={{ ...s.btn("#e8edf8", "#5a6a8a", { padding: "3px 8px", opacity: idx === 0 ? 0.4 : 1 }) }} onClick={() => moveSpotlight(idx, -1)}>↑</button>
                      <button disabled={idx === spotlightIds.length - 1} style={{ ...s.btn("#e8edf8", "#5a6a8a", { padding: "3px 8px", opacity: idx === spotlightIds.length - 1 ? 0.4 : 1 }) }} onClick={() => moveSpotlight(idx, 1)}>↓</button>
                      <button style={{ ...s.btn("#fee2e2", "#ef4444", { padding: "3px 8px" }) }} onClick={() => toggleSpotlight(sid)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Liste des véhicules disponibles */}
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
          {approved.slice(0, 30).map((v) => {
            const vid = (v._id || v.id)?.toString();
            const posIdx = spotlightIds.indexOf(vid);
            const isIn  = posIdx !== -1;
            const full  = !isIn && spotlightIds.length >= MAX_SPOTLIGHTS;
            return (
              <div key={vid} style={{ ...s.row, borderColor: isIn ? "#6366f1" : "#e8edf8", background: isIn ? "#f5f3ff" : "#fff" }}>
                {(v.images?.[0] || v.image)
                  ? <img src={v.images?.[0] || v.image} alt="" style={{ width: 52, height: 38, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 38, background: "#e8edf8", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>🚗</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "#0f1b3f", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.title || v.name}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#8493b0" }}>
                    {v.ville || "—"} · {v.vehicleType || v.type || "—"}
                  </p>
                </div>
                {isIn && <span style={s.badge("#6366f1", "#eff0ff")}>#{posIdx + 1}</span>}
                {full && !isIn && <span style={s.badge("#94a3b8", "#f1f5f9")}>Complet</span>}
                <button
                  style={isIn ? s.btn("#ef4444") : s.btn(full ? "#cbd5e1" : "#6366f1")}
                  disabled={full && !isIn}
                  onClick={() => toggleSpotlight(vid)}
                >
                  {isIn ? "Retirer" : full ? "—" : "+ Ajouter"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Vedette Section du moment ── */}
      <div style={s.block}>
        <h3 style={{ margin: "0 0 4px", fontSize: "0.95rem", color: "#0f1b3f", fontWeight: 800 }}>
          ⭐ Véhicules en vedette — «Section du moment»
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: "0.78rem", color: "#8493b0" }}>
          {featuredCount} véhicule{featuredCount !== 1 ? "s" : ""} en vedette. Le carousel de l'accueil les affiche en priorité.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 420, overflowY: "auto" }}>
          {approved.map((v) => {
            const vid = (v._id || v.id)?.toString();
            const isSav = saving === vid;
            return (
              <div key={vid} style={{ ...s.row, borderColor: v.featured ? "#f59e0b" : "#e8edf8", background: v.featured ? "#fffbeb" : "#fff" }}>
                {(v.images?.[0] || v.image)
                  ? <img src={v.images?.[0] || v.image} alt="" style={{ width: 52, height: 38, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 38, background: "#e8edf8", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>🚗</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: "#0f1b3f", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.title || v.name}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.72rem", color: "#8493b0" }}>
                    {v.ville || "—"} · {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString("fr-FR")} DH/j` : v.priceForSale ? `${Number(v.priceForSale).toLocaleString("fr-FR")} DH` : "—"}
                  </p>
                </div>
                {v.featured && <span style={s.badge("#f59e0b", "#fffbeb")}>⭐</span>}
                <button
                  style={v.featured ? s.btn("#ef4444", "#fff", { opacity: isSav ? 0.6 : 1 }) : s.btn("#059669", "#fff", { opacity: isSav ? 0.6 : 1 })}
                  disabled={isSav}
                  onClick={() => toggleFeatured(vid, !!v.featured)}
                >
                  {isSav ? "..." : v.featured ? "Retirer" : "⭐ Vedette"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── VetteSection ───────────────────────────────────────────────────────────────
function VetteSection({ vehicles, token, onRefresh }) {
  const featured = vehicles.filter((v) => v.featured || v.status === "approved");
  const [saving, setSaving] = useState(null);
  const [spotlightId, setSpotlightId] = useState(
    () => localStorage.getItem("vit_hero_spotlight") || null
  );

  const toggleFeatured = async (vehicleId, currentlyFeatured) => {
    setSaving(vehicleId);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ featured: !currentlyFeatured }),
      });
      if (res.ok) onRefresh();
    } catch { /* */ }
    setSaving(null);
  };

  const setSpotlight = (vehicleId) => {
    localStorage.setItem("vit_hero_spotlight", vehicleId);
    setSpotlightId(vehicleId);
  };

  const removeSpotlight = () => {
    localStorage.removeItem("vit_hero_spotlight");
    setSpotlightId(null);
  };

  const spotlightVehicle = spotlightId ? vehicles.find((v) => (v._id || v.id)?.toString() === spotlightId) : null;

  return (
    <div style={{ padding: "1.5rem 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <span style={{ fontSize: "1.4rem" }}>⭐</span>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#0f1b3f" }}>Véhicules en vedette</h2>
          <p style={{ margin: 0, fontSize: "0.83rem", color: "#8493b0" }}>
            Gérez la sélection "Spotlight Hero" (panneau droit de l'accueil) et les véhicules en vedette.
          </p>
        </div>
      </div>

      {/* ── Spotlight Hero actuel ── */}
      <div style={{
        background: "#0f1b3f", color: "#fff", borderRadius: "14px",
        padding: "14px 18px", marginBottom: "20px",
        display: "flex", alignItems: "center", gap: "14px",
      }}>
        <span style={{ fontSize: "1.3rem" }}>🎯</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem" }}>Spotlight Hero (page d'accueil)</p>
          <p style={{ margin: 0, fontSize: "0.78rem", opacity: 0.7 }}>
            {spotlightVehicle
              ? (spotlightVehicle.title || spotlightVehicle.name || "Véhicule sélectionné")
              : "Aucun — affiche le premier véhicule featured"}
          </p>
        </div>
        {spotlightId && (
          <button
            onClick={removeSpotlight}
            style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Retirer
          </button>
        )}
      </div>

      {/* ── Liste des véhicules ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {featured.length === 0 && (
          <p style={{ color: "#8493b0", padding: "2rem", textAlign: "center" }}>
            Aucun véhicule approuvé disponible.
          </p>
        )}
        {featured.map((v) => (
          <div key={v._id} style={{
            display: "flex", alignItems: "center", gap: "14px",
            background: v.featured ? "#fffbeb" : "#fff",
            border: `1.5px solid ${(v._id || v.id)?.toString() === spotlightId ? "#6366f1" : v.featured ? "#f59e0b" : "#e8edf8"}`,
            borderRadius: "14px", padding: "12px 16px",
          }}>
            {(v.images?.[0] || v.image) ? (
              <img src={v.images?.[0] || v.image} alt={v.title || v.name}
                style={{ width: 60, height: 44, objectFit: "cover", borderRadius: "8px", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 60, height: 44, background: "#e8edf8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>🚗</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#0f1b3f", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.title || v.name}
              </p>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#8493b0" }}>
                {v.ville || v.city || "—"} · {v.type || "—"}
              </p>
            </div>
            {(v._id || v.id)?.toString() === spotlightId && (
              <span style={{ background: "#6366f1", color: "#fff", fontSize: "0.7rem", fontWeight: 700, padding: "2px 10px", borderRadius: "999px" }}>
                🎯 Spotlight
              </span>
            )}
            {v.featured && (
              <span style={{ background: "#f59e0b", color: "#fff", fontSize: "0.7rem", fontWeight: 700, padding: "2px 10px", borderRadius: "999px" }}>
                ⭐ Vedette
              </span>
            )}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setSpotlight((v._id || v.id)?.toString())}
                disabled={(v._id || v.id)?.toString() === spotlightId}
                style={{
                  background: (v._id || v.id)?.toString() === spotlightId ? "#6366f1" : "#e0e7ff",
                  color: (v._id || v.id)?.toString() === spotlightId ? "#fff" : "#6366f1",
                  border: "none", borderRadius: "8px",
                  padding: "7px 12px", fontSize: "0.78rem", fontWeight: 700,
                  cursor: (v._id || v.id)?.toString() === spotlightId ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                🎯
              </button>
              <button
                onClick={() => toggleFeatured(v._id, !!v.featured)}
                disabled={saving === v._id}
                style={{
                  background: v.featured ? "#ef4444" : "#059669",
                  color: "#fff", border: "none", borderRadius: "8px",
                  padding: "7px 14px", fontSize: "0.8rem", fontWeight: 700,
                  cursor: saving === v._id ? "not-allowed" : "pointer",
                  opacity: saving === v._id ? 0.6 : 1, fontFamily: "inherit",
                }}
              >
                {saving === v._id ? "..." : v.featured ? "Retirer" : "⭐ Vedette"}
              </button>
            </div>
          </div>
        ))}
      </div>
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
