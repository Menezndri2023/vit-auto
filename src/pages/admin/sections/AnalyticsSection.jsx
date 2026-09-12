// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import styles from "../../AdminPanel.module.css";
import { IE_STATUS_LABELS, MiniBar, StatCard } from "../shared.jsx";

function MonthTrendChart({ data, valueKey, color, label, formatValue }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  const fmt = formatValue || ((v) => v.toLocaleString("fr-FR"));
  return (
    <div>
      <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#64748b", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
        {data.map((d) => {
          const v = d[valueKey] || 0;
          const h = Math.max(2, Math.round((v / max) * 100));
          const [y, m] = d.month.split("-");
          return (
            <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${m}/${y} — ${fmt(v)}`}>
              <div style={{ width: "100%", maxWidth: 22, height: `${h}%`, background: color, borderRadius: "4px 4px 0 0", minHeight: 2 }} />
              <span style={{ fontSize: ".6rem", color: "#94a3b8" }}>{m}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownList({ items, labelKey, valueKey, color, formatValue, labels }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey] || 0));
  const fmt = formatValue || ((v) => v.toLocaleString("fr-FR"));
  if (!items.length) return <div style={{ color: "#94a3b8", fontSize: ".82rem" }}>Aucune donnée.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((i) => (
        <div key={i[labelKey]}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", marginBottom: 3 }}>
            <span style={{ color: "#0f1b3f", fontWeight: 600 }}>{labels?.[i[labelKey]] || i[labelKey]}</span>
            <span style={{ color: "#64748b" }}>{fmt(i[valueKey] || 0)}</span>
          </div>
          <MiniBar value={i[valueKey] || 0} max={max} color={color} />
        </div>
      ))}
    </div>
  );
}

export function AnalyticsSection({ analytics, loading }) {
  if (loading && !analytics) {
    return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;
  }
  if (!analytics) {
    return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Aucune donnée disponible.</div>;
  }

  const totalBookings12mo = analytics.monthlyBookings.reduce((s, d) => s + d.count, 0);
  const totalRevenueByPrimaryCurrency = analytics.byCurrency[0];
  const totalNewUsers12mo = analytics.monthlyUsers.reduce((s, d) => s + d.count, 0);
  const activeIe = analytics.ieByStatus
    .filter((s) => !["completed", "cancelled"].includes(s.status))
    .reduce((s, d) => s + d.count, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📦" label="Réservations (12 mois)" value={totalBookings12mo} color="#6366f1" />
        <StatCard icon="💰" label={`CA réalisé (${totalRevenueByPrimaryCurrency?.currency || "—"})`}
          value={(totalRevenueByPrimaryCurrency?.total || 0).toLocaleString("fr-FR")} color="#10b981" />
        <StatCard icon="🧑‍🤝‍🧑" label="Nouveaux comptes (12 mois)" value={totalNewUsers12mo} color="#f59e0b" />
        <StatCard icon="🌍" label="Transactions I/E actives" value={activeIe} color="#0891b2" />
      </div>

      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>📈 Tendances mensuelles (12 derniers mois)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 24 }}>
          <MonthTrendChart data={analytics.monthlyBookings} valueKey="count" color="#6366f1" label="Volume de réservations" />
          <MonthTrendChart data={analytics.monthlyBookings} valueKey="revenue" color="#10b981" label="Chiffre d'affaires (toutes devises confondues)" />
          <MonthTrendChart data={analytics.monthlyUsers} valueKey="count" color="#f59e0b" label="Nouveaux comptes" />
          <MonthTrendChart data={analytics.ieMonthly} valueKey="count" color="#0891b2" label="Nouvelles transactions Import/Export" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>💱 Chiffre d'affaires par devise</h3>
          <BreakdownList items={analytics.byCurrency} labelKey="currency" valueKey="total" color="#10b981" />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>🚗 Chiffre d'affaires par service</h3>
          <BreakdownList items={analytics.byType} labelKey="type" valueKey="total" color="#6366f1"
            labels={{ location: "Location", essai: "Vente", chauffeur: "Chauffeur", leasing: "Leasing" }} />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>🌍 Top pays (clients)</h3>
          <BreakdownList items={analytics.byCountry} labelKey="country" valueKey="total" color="#f59e0b" />
        </div>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle} style={{ marginBottom: 14 }}>📦 Pipeline Import/Export par statut</h3>
          <BreakdownList items={analytics.ieByStatus} labelKey="status" valueKey="count" color="#0891b2" labels={IE_STATUS_LABELS} formatValue={(v) => `${v}`} />
        </div>
      </div>
    </div>
  );
}
