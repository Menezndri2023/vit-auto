import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import styles from "./AdminPanel.module.css";

// ─── Utilitaires ───────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " FCFA";
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
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats,     setStats]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [vehicles,  setVehicles]  = useState([]);
  const [bookings,  setBookings]  = useState([]);
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

  // ── Toasts ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) navigate("/login");
    else if (user?.role !== "admin") navigate("/");
  }, [isAuthenticated, user, navigate]);

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
      const [sRes, uRes, vRes, bRes] = await Promise.all([
        fetch("/api/users/stats",    { headers }),
        fetch("/api/users?limit=200", { headers }),
        fetch("/api/vehicles?limit=200&status=all", { headers }),
        fetch("/api/bookings?limit=200", { headers }),
      ]);
      if (sRes.ok) setStats((await sRes.json()));
      if (uRes.ok) setUsers((await uRes.json()).users || []);
      if (vRes.ok) {
        const d = await vRes.json();
        setVehicles(Array.isArray(d) ? d : d.vehicles || []);
      }
      if (bRes.ok) setBookings((await bRes.json()).bookings || []);
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

      {/* ── Header ── */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>⚙️ Dashboard Admin</h1>
          <p className={styles.headerSub}>VIT AUTO — Gestion interne complète</p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.adminBadge}>🔐 {user.firstName} · Admin</span>
          <button className={styles.btnRefresh} onClick={loadAll} title="Actualiser">↻ Actualiser</button>
        </div>
      </header>

      {/* ── Navigation ── */}
      <nav className={styles.tabs}>
        {[
          { key: "dashboard", icon: "📊", label: "Dashboard" },
          { key: "users",     icon: "👥", label: `Utilisateurs (${users.length})` },
          { key: "vehicles",  icon: "🚗", label: `Annonces (${vehicles.length})` },
          { key: "bookings",  icon: "📋", label: `Commandes (${bookings.length})` },
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
                  value={Number(stats?.revenue?.total || 0).toLocaleString("fr-FR") + " FCFA"}
                  sub={`Ce mois : ${Number(stats?.revenue?.thisMonth || 0).toLocaleString("fr-FR")} FCFA`}
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
                            {v.pricePerDay ? `${Number(v.pricePerDay).toLocaleString("fr-FR")} FCFA/j` :
                             v.priceForSale ? `${Number(v.priceForSale).toLocaleString("fr-FR")} FCFA` : "—"}
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
                                  onClick={() => setConfirm({
                                    message: `Rejeter l'annonce "${v.title || v.name}" ?`,
                                    danger: true,
                                    action: () => updateVehicleStatus(vid, "rejected"),
                                  })}>✕ Rejeter</button>
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
                            {b.montantTotal > 0 ? `${Number(b.montantTotal).toLocaleString("fr-FR")} FCFA` : "—"}
                          </td>
                          <td><Badge label={bs.label} color={bs.color} bg={bs.bg} /></td>
                          <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                          <td>
                            {b.contract ? (
                              <a href={`/contract/${b._id}`} target="_blank" rel="noopener noreferrer"
                                className={styles.contractLink}>📄</a>
                            ) : <span className={styles.noContract}>—</span>}
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
        </>
      )}
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
