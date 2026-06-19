import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
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
  "À confirmer": { label: "Nouvelle",    color: "#f59e0b", bg: "#fffbeb" },
  pending:        { label: "Nouvelle",    color: "#f59e0b", bg: "#fffbeb" },
  confirmed:      { label: "Acceptée",   color: "#10b981", bg: "#ecfdf5" },
  preparing:      { label: "En cours",   color: "#06b6d4", bg: "#ecfeff" },
  ready:          { label: "Prête",      color: "#8b5cf6", bg: "#f5f3ff" },
  in_progress:    { label: "En route",   color: "#3b82f6", bg: "#eff6ff" },
  completed:      { label: "Terminée",   color: "#64748b", bg: "#f8fafc" },
  cancelled:      { label: "Annulée",    color: "#ef4444", bg: "#fef2f2" },
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
  const { user, isAuthenticated, token } = useAuth();

  const [activeTab, setActiveTab] = useState("dashboard");
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
  const [bkActionModal, setBkActionModal] = useState(null); // { id, name, action }
  const [bkCancelReason, setBkCancelReason] = useState("");

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

  const filteredBookings = useMemo(() =>
    bkStatus === "all" ? bookings : bookings.filter((b) => b.status === bkStatus),
    [bookings, bkStatus]
  );

  const paginate = (arr, page) => arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = (arr) => Math.ceil(arr.length / PAGE_SIZE) || 1;

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!isAuthenticated || user?.role !== "admin") return null;

  // ── Revenue chart data ──────────────────────────────────────────────────────
  const revByMonth = stats?.revenue?.byMonth || [];
  const maxRev     = Math.max(...revByMonth.map((m) => m.total), 1);

  return (
    <div className={styles.page}>

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

      {/* ── Header ── */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>⚙️ Dashboard Admin</h1>
          <p className={styles.headerSub}>VIT AUTO — Gestion interne complète</p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.adminBadge}>🔐 {user.firstName} · Admin</span>
          <button className={styles.btnRefresh} onClick={() => setBroadcastModal(true)} title="Envoyer notification" style={{ background: "#6366f1", color: "#fff", border: "none" }}>
            📢 Broadcast
          </button>
          <button className={styles.btnRefresh} onClick={loadAll} title="Actualiser">↻ Actualiser</button>
        </div>
      </header>

      {/* ── Navigation ── */}
      <nav className={styles.tabs}>
        {[
          { key: "dashboard",   icon: "📊", label: "Dashboard" },
          { key: "accueil",     icon: "🏠", label: "Accueil" },
          { key: "validations", icon: "✅", label: "Validations" },
          { key: "users",       icon: "👥", label: `Utilisateurs (${users.length})` },
          { key: "vehicles",    icon: "🚗", label: `Annonces (${vehicles.length})` },
          { key: "bookings",    icon: "📋", label: `Commandes (${bookings.length})` },
          { key: "vedette",     icon: "⭐", label: "Vedette" },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {icon} {label}
            {key === "vehicles" && (stats?.vehicles?.pending || 0) > 0 && (
              <span className={styles.alertDot}>{stats.vehicles.pending}</span>
            )}
            {key === "validations" && (() => {
              const pendingV = vehicles.filter((v) => v.status === "pending").length;
              const pendingD = drivers.length;
              const pendingB = bookings.filter((b) => b.status === "pending").length;
              return (pendingV + pendingD + pendingB) > 0
                ? <span className={styles.alertDot}>{pendingV + pendingD + pendingB}</span>
                : null;
            })()}
          </button>
        ))}
      </nav>

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
                          const typeLabels = { location: "📅 Location", essai: "🔑 Essai", chauffeur: "🚘 Chauffeur", leasing: "🏦 Leasing" };
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
                      const colors = { location: "#3b82f6", essai: "#10b981", chauffeur: "#f59e0b", leasing: "#8b5cf6" };
                      const labels = { location: "📅 Location", essai: "🔑 Essai", chauffeur: "🚘 Chauffeur", leasing: "🏦 Leasing" };
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
              <div className={styles.filterBar}>
                <select className={styles.filterSelect} value={bkStatus}
                  onChange={(e) => { setBkStatus(e.target.value); setBkPage(1); }}>
                  <option value="all">Tous les statuts</option>
                  <option value="pending">Nouvelles</option>
                  <option value="confirmed">Acceptées</option>
                  <option value="completed">Terminées</option>
                  <option value="cancelled">Annulées</option>
                </select>
                <span className={styles.filterCount}>{filteredBookings.length} commande{filteredBookings.length !== 1 ? "s" : ""}</span>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Véhicule</th>
                      <th>Type</th>
                      <th>Montant</th>
                      <th>Statut</th>
                      <th>Date</th>
                      <th>Contrat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(filteredBookings, bkPage).map((b) => {
                      const bs = STATUS_BK[b.status] || STATUS_BK.pending;
                      const typeLabels = { location: "📅 Location", essai: "🔑 Essai", chauffeur: "🚘 Chauffeur", leasing: "🏦 Leasing" };
                      const vName = b.vehicle
                        ? [b.vehicle.title, b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ")
                        : "—";
                      return (
                        <tr key={b._id} className={styles.tr}>
                          <td>
                            <div>
                              <strong>{b.clientInfo?.firstName} {b.clientInfo?.lastName}</strong>
                              <span className={styles.vehMeta}>{b.clientInfo?.email}</span>
                            </div>
                          </td>
                          <td className={styles.tdVeh}>{vName}</td>
                          <td><Badge label={typeLabels[b.type] || b.type} color="#64748b" bg="#f1f5f9" /></td>
                          <td className={styles.tdPrice}>
                            {b.montantTotal > 0 ? `${Number(b.montantTotal).toLocaleString("fr-FR")} DH` : "—"}
                          </td>
                          <td><Badge label={bs.label} color={bs.color} bg={bs.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                          <td>
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              {b.contract && (
                                <Link to={`/contract/${b._id}`} target="_blank" rel="noopener noreferrer"
                                  className={styles.contractLink}>📄</Link>
                              )}
                              {b.status === "pending" && (
                                <button className={styles.btnApprove} style={{ padding: "0.25rem 0.6rem", fontSize: "0.76rem" }}
                                  onClick={() => setBkActionModal({ id: b._id, name: `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim(), action: "confirmed" })}>
                                  ✅
                                </button>
                              )}
                              {b.status !== "cancelled" && b.status !== "completed" && (
                                <button className={styles.btnReject} style={{ padding: "0.25rem 0.6rem", fontSize: "0.76rem" }}
                                  onClick={() => { setBkActionModal({ id: b._id, name: `${b.clientInfo?.firstName || ""} ${b.clientInfo?.lastName || ""}`.trim(), action: "cancelled" }); setBkCancelReason(""); }}>
                                  ✕
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

              <Pagination page={bkPage} total={totalPages(filteredBookings)} onChange={setBkPage} />
            </div>
          )}

          {/* ══════════════════════ TAB VEDETTE ══════════════════════ */}
          {activeTab === "vedette" && (
            <VetteSection vehicles={vehicles} token={token} onRefresh={loadAll} />
          )}
        </>
      )}
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
