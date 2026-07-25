import { useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./DashboardStats.module.css";

const fmtNum = (n) => Number(n || 0).toLocaleString("fr-FR");

const STATUS_CFG = {
  pending:     { label: "En attente",  color: "#f59e0b" },
  confirmed:   { label: "Acceptée",   color: "#10b981" },
  preparing:   { label: "En cours",   color: "#06b6d4" },
  ready:       { label: "Prête",      color: "#8b5cf6" },
  in_progress: { label: "En route",   color: "#3b82f6" },
  completed:   { label: "Terminée",   color: "#64748b" },
  cancelled:   { label: "Annulée",    color: "#ef4444" },
  "À confirmer": { label: "En attente", color: "#f59e0b" },
};

const PERIODS = [
  { key: "7",   label: "7 jours"   },
  { key: "30",  label: "30 jours"  },
  { key: "90",  label: "3 mois"    },
  { key: "365", label: "12 mois"   },
];

/* ── Filtre par période ── */
function filterByPeriod(items, days, dateField = "createdAt") {
  if (!days) return items;
  const since = Date.now() - days * 86_400_000;
  return items.filter((b) => {
    const ts = b[dateField] ? new Date(b[dateField]).getTime() : 0;
    return ts >= since;
  });
}

/* ── Barres mensuelles (CSS pur) ── */
function MonthlyChart({ bookings, isAdmin, fmt }) {
  const months = useMemo(() => {
    const map = {};
    const now  = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[key] = { label: d.toLocaleDateString("fr-FR", { month: "short" }), revenue: 0, count: 0 };
    }
    bookings.forEach((b) => {
      if (!b.createdAt) return;
      const d   = new Date(b.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (map[key]) {
        const r = isAdmin
          ? (Number(b.total) || 0)
          : (Number(b.partnerPayout) || Number(b.total) || 0);
        map[key].revenue += r;
        map[key].count   += 1;
      }
    });
    return Object.values(map);
  }, [bookings, isAdmin]);

  const maxRev = Math.max(...months.map((m) => m.revenue), 1);

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartBars}>
        {months.map((m) => {
          const pct = Math.max((m.revenue / maxRev) * 100, m.count > 0 ? 4 : 0);
          return (
            <div key={m.label} className={styles.barCol}>
              <span className={styles.barTooltip}>{fmt(m.revenue)}</span>
              <div className={styles.barOuter}>
                <div className={styles.barInner} style={{ height: `${pct}%` }} />
              </div>
              <span className={styles.barLabel}>{m.label}</span>
              <span className={styles.barCount}>{m.count} rés.</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Donut statuts (CSS pur) ── */
function StatusDonut({ bookings }) {
  const counts = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const s = b.status || "pending";
      map[s]  = (map[s] || 0) + 1;
    });
    return map;
  }, [bookings]);

  const total  = bookings.length || 1;
  const colors = Object.keys(counts).map((s) => STATUS_CFG[s]?.color || "#94a3b8");

  let cumul = 0;
  const segments = Object.entries(counts).map(([s, c], i) => {
    const pct   = (c / total) * 100;
    const start = cumul;
    cumul += pct;
    return { status: s, count: c, pct, start, color: colors[i] };
  });

  const r  = 40;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;

  return (
    <div className={styles.donutWrap}>
      <svg width="120" height="120" viewBox="0 0 120 120" className={styles.donutSvg}>
        {segments.map((seg, i) => {
          const dash   = (seg.pct / 100) * circumference;
          const gap    = circumference - dash;
          const offset = circumference - (seg.start / 100) * circumference;
          return (
            <circle
              key={i}
              r={r} cx={cx} cy={cy}
              fill="none"
              stroke={seg.color}
              strokeWidth="20"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              style={{ transform: "rotate(-90deg)", transformOrigin: "60px 60px" }}
            />
          );
        })}
        <text x="60" y="55" textAnchor="middle" fontSize="18" fontWeight="900" fill="#0f1b3f">{total}</text>
        <text x="60" y="70" textAnchor="middle" fontSize="9"  fill="#8493b0">total</text>
      </svg>
      <div className={styles.donutLegend}>
        {segments.map((seg) => {
          const cfg = STATUS_CFG[seg.status] || { label: seg.status, color: "#94a3b8" };
          return (
            <div key={seg.status} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: cfg.color }} />
              <span className={styles.legendLabel}>{cfg.label}</span>
              <span className={styles.legendCount}>{seg.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Top véhicules ── */
function TopVehicles({ vehicles, bookings, isAdmin, fmt }) {
  const ranked = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const vid = String(b.vehicleId);
      if (!map[vid]) map[vid] = { name: b.vehicleName || vid, count: 0, revenue: 0 };
      map[vid].count   += 1;
      map[vid].revenue += isAdmin
        ? (Number(b.total) || 0)
        : (Number(b.partnerPayout) || Number(b.total) || 0);
    });

    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [bookings, isAdmin]);

  const maxRev = Math.max(...ranked.map((r) => r.revenue), 1);

  if (ranked.length === 0) {
    return <p className={styles.noData}>Aucune donnée sur la période.</p>;
  }

  return (
    <div className={styles.topList}>
      {ranked.map((v, i) => (
        <div key={v.name} className={styles.topItem}>
          <span className={styles.topRank}>{i + 1}</span>
          <div className={styles.topBody}>
            <div className={styles.topNameRow}>
              <span className={styles.topName}>{v.name}</span>
              <span className={styles.topRevenue}>{fmt(v.revenue)}</span>
            </div>
            <div className={styles.topBar}>
              <div
                className={styles.topBarFill}
                style={{
                  width: `${(v.revenue / maxRev) * 100}%`,
                  background: ["#ff4d2d","#f59e0b","#10b981","#6366f1","#0ea5e9"][i] || "#94a3b8",
                }}
              />
            </div>
            <span className={styles.topCount}>{v.count} réservation{v.count > 1 ? "s" : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Page principale ── */
const DashboardStats = () => {
  const { user, isAuthenticated } = useAuth();
  const { vehicles, bookings, partnerVehicles, partnerBookings } = useVehicles();
  const { fmt: fmtDH } = useCurrency();

  const [period, setPeriod] = useState("30");

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const isAdmin   = user?.role === "admin";
  const isPartner = user?.role === "partenaire" || isAdmin;

  /* ── Sélection des données selon le rôle ── */
  const allVehicles = isAdmin
    ? vehicles
    : partnerVehicles;

  const allBookings = isAdmin
    ? bookings
    : (partnerBookings || bookings.filter((b) =>
        partnerVehicles.some((v) =>
          String(v.id || v._id) === String(b.vehicleId)
        )
      ));

  const periodDays = Number(period);
  const periodBks  = filterByPeriod(allBookings, periodDays);

  /* ── KPIs ── */
  const totalVehicles   = allVehicles.length;
  const approvedCount   = allVehicles.filter((v) => v.status === "approved").length;
  const pendingCount    = allVehicles.filter((v) => v.status === "pending").length;

  const totalBks        = periodBks.length;
  const completedBks    = periodBks.filter((b) => b.status === "completed");
  const cancelledBks    = periodBks.filter((b) => b.status === "cancelled");
  const activeBks       = periodBks.filter((b) => !["completed","cancelled"].includes(b.status));

  const totalRevenue    = completedBks.reduce((s, b) =>
    s + (isAdmin ? (Number(b.total) || 0) : (Number(b.partnerPayout) || Number(b.total) || 0)), 0
  );

  const avgBasket       = completedBks.length
    ? totalRevenue / completedBks.length
    : 0;

  const conversionRate  = totalBks
    ? Math.round((completedBks.length / totalBks) * 100)
    : 0;

  const cancelRate      = totalBks
    ? Math.round((cancelledBks.length / totalBks) * 100)
    : 0;

  /* ── Données pour graphique mensuel (toujours 6 mois) ── */
  const chartData = filterByPeriod(allBookings, 180);

  return (
    <div className={styles.page}>

      {/* ── En-tête ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {isAdmin ? "📊 Statistiques globales" : "📊 Mes performances"}
          </h1>
          <p className={styles.sub}>
            {isAdmin
              ? "Vue d'ensemble de la plateforme VIT AUTO."
              : `Statistiques de ${user?.firstName || "vos annonces"} — ${approvedCount} annonce${approvedCount > 1 ? "s" : ""} publiée${approvedCount > 1 ? "s" : ""}.`}
          </p>
        </div>
        {/* Sélecteur période */}
        <div className={styles.periodSelector}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`${styles.periodBtn} ${period === p.key ? styles.periodBtnActive : ""}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: "rgba(99,102,241,.10)", color: "#6366f1" }}>🚗</div>
          <div className={styles.kpiBody}>
            <span className={styles.kpiValue}>{fmtNum(totalVehicles)}</span>
            <span className={styles.kpiLabel}>Véhicules total</span>
          </div>
          <div className={styles.kpiSub}>
            <span style={{ color: "#10b981" }}>✅ {approvedCount} publiés</span>
            {pendingCount > 0 && <span style={{ color: "#f59e0b" }}> · ⏳ {pendingCount} en attente</span>}
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: "rgba(16,185,129,.10)", color: "#10b981" }}>💰</div>
          <div className={styles.kpiBody}>
            <span className={styles.kpiValue}>{fmtDH(totalRevenue)}</span>
            <span className={styles.kpiLabel}>Revenus sur la période</span>
          </div>
          <div className={styles.kpiSub}>Panier moyen : {fmtDH(avgBasket)}</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: "rgba(59,130,246,.10)", color: "#3b82f6" }}>📋</div>
          <div className={styles.kpiBody}>
            <span className={styles.kpiValue}>{fmtNum(totalBks)}</span>
            <span className={styles.kpiLabel}>Réservations</span>
          </div>
          <div className={styles.kpiSub}>
            <span style={{ color: "#10b981" }}>{completedBks.length} terminées</span>
            {" · "}
            <span style={{ color: "#06b6d4" }}>{activeBks.length} en cours</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} ${conversionRate >= 60 ? styles.kpiGood : conversionRate >= 30 ? styles.kpiWarn : styles.kpiDanger}`}>
          <div className={styles.kpiIcon} style={{ background: "rgba(245,158,11,.10)", color: "#f59e0b" }}>🎯</div>
          <div className={styles.kpiBody}>
            <span className={styles.kpiValue}>{conversionRate} %</span>
            <span className={styles.kpiLabel}>Taux de conversion</span>
          </div>
          <div className={styles.kpiSub}>
            Annulations : <span style={{ color: "#ef4444" }}>{cancelRate} %</span>
          </div>
        </div>
      </div>

      {/* ── Graphiques row ── */}
      <div className={styles.chartsRow}>
        {/* Barres mensuelles */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>Revenus mensuels</h3>
            <span className={styles.chartSub}>6 derniers mois</span>
          </div>
          {chartData.length > 0
            ? <MonthlyChart bookings={chartData} isAdmin={isAdmin} fmt={fmtDH} />
            : <p className={styles.noData}>Aucune donnée disponible.</p>
          }
        </div>

        {/* Donut statuts */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <h3>Répartition statuts</h3>
            <span className={styles.chartSub}>{PERIODS.find((p) => p.key === period)?.label}</span>
          </div>
          {periodBks.length > 0
            ? <StatusDonut bookings={periodBks} />
            : <p className={styles.noData}>Aucune réservation sur la période.</p>
          }
        </div>
      </div>

      {/* ── Top véhicules ── */}
      <div className={styles.topCard}>
        <div className={styles.chartHeader}>
          <h3>🏆 Top véhicules</h3>
          <span className={styles.chartSub}>classés par revenu généré</span>
        </div>
        <TopVehicles vehicles={allVehicles} bookings={periodBks} isAdmin={isAdmin} fmt={fmtDH} />
      </div>

      {/* ── Métriques avancées ── */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>📅</span>
          <div>
            <span className={styles.metricVal}>{fmtNum(completedBks.length)}</span>
            <span className={styles.metricLbl}>Réservations terminées</span>
          </div>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>⚡</span>
          <div>
            <span className={styles.metricVal}>{fmtNum(activeBks.length)}</span>
            <span className={styles.metricLbl}>En cours actuellement</span>
          </div>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>❌</span>
          <div>
            <span className={styles.metricVal}>{fmtNum(cancelledBks.length)}</span>
            <span className={styles.metricLbl}>Annulations</span>
          </div>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>📦</span>
          <div>
            <span className={styles.metricVal}>{fmtNum(approvedCount)}</span>
            <span className={styles.metricLbl}>Annonces actives</span>
          </div>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>💸</span>
          <div>
            <span className={styles.metricVal}>{fmtDH(avgBasket)}</span>
            <span className={styles.metricLbl}>Panier moyen</span>
          </div>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricIcon}>🎯</span>
          <div>
            <span className={styles.metricVal}>{conversionRate} %</span>
            <span className={styles.metricLbl}>Taux de conversion</span>
          </div>
        </div>
      </div>

      {/* ── Liens rapides ── */}
      <div className={styles.quickLinks}>
        {isPartner && (
          <>
            <Link to="/vendor/dashboard" className={styles.quickLink}>
              <span>🗂️</span>
              <span>Gérer les commandes</span>
            </Link>
            <Link to="/vendor/publish" className={styles.quickLink}>
              <span>📦</span>
              <span>Mes publications</span>
            </Link>
            <Link to="/vendor" className={styles.quickLink}>
              <span>➕</span>
              <span>Nouvelle annonce</span>
            </Link>
          </>
        )}
        {isAdmin && (
          <Link to="/admin" className={styles.quickLink}>
            <span>⚙️</span>
            <span>Panneau admin</span>
          </Link>
        )}
        <Link to="/catalogue" className={styles.quickLink}>
          <span>🔍</span>
          <span>Voir le catalogue</span>
        </Link>
      </div>
    </div>
  );
};

export default DashboardStats;
