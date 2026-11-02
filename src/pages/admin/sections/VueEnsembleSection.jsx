import { MOIS, MiniBar, StatCard } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Vue d'ensemble » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function VueEnsembleSection({
  canSeeTab, disputedBk, fmtUSD, ieRequests, ieRequestsTotal, maxRev,
  pendingActivities, pendingCert, pendingDrivers, pendingIe, pendingImp, pendingInv,
  pendingKyc, pendingReports, pendingSub, pendingSvcReq, pendingValidationTotal, revByMonth,
  setActiveTab, stats,
}) {
  return (
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
          value={fmtUSD(stats?.revenue?.total || 0)}
          sub={`Ce mois : ${fmtUSD(stats?.revenue?.thisMonth || 0)}`}
          color="#ef4444" />
        <StatCard icon="🌍" label="Import/Export"
          value={ieRequestsTotal || ieRequests.length || "—"}
          sub="Demandes reçues"
          color="#ff4d2d" />
      </div>

      {/* ── À TRAITER AUJOURD'HUI ────────────────────────────────
          File unique : tout ce qui attend une décision, au même
          endroit. L'admin devait auparavant faire le tour d'une
          trentaine d'onglets pour savoir ce qui l'attendait, en se
          fiant à des pastilles dispersées dans le menu. Chaque ligne
          n'apparaît que si le compte a la permission d'agir dessus
          (canSeeTab) — inutile de signaler un dossier qu'on ne peut
          pas ouvrir. */}
      {(() => {
        const queue = [
          { tab: "pending_validation", icon: "⏳", n: pendingValidationTotal, label: "demande(s) de réservation à valider", urgent: true },
          { tab: "litiges",            icon: "⚖️", n: disputedBk,          label: "litige(s) à arbitrer", urgent: true },
          { tab: "kyc",                icon: "🛡️", n: pendingKyc,            label: "dossier(s) KYC à examiner" },
          { tab: "catalogue",          icon: "🚗", n: stats?.vehicles?.pending || 0, label: "annonce(s) en attente de validation" },
          { tab: "chauffeurs",         icon: "🧑‍✈️", n: pendingDrivers,        label: "profil(s) chauffeur à valider" },
          { tab: "activites",          icon: "🎈", n: pendingActivities,      label: "activité(s) à valider" },
          { tab: "certification",      icon: "🏅", n: pendingCert,            label: "certification(s) partenaire à examiner" },
          { tab: "paiements",          icon: "💳", n: pendingSub,             label: "paiement(s) d'abonnement à confirmer" },
          { tab: "factures",           icon: "📄", n: pendingInv,             label: "facture(s) en attente" },
          { tab: "reports",            icon: "🚩", n: pendingReports,         label: "signalement(s) à traiter" },
          { tab: "import_export",      icon: "🌍", n: pendingIe,              label: "demande(s) Import/Export" },
          { tab: "service_requests",   icon: "🧰", n: pendingSvcReq,          label: "demande(s) de service" },
          { tab: "exportateurs",       icon: "🤝", n: pendingImp,             label: "profil(s) exportateur à valider" },
        ].filter((q) => q.n > 0 && canSeeTab(q.tab));

        return (
          <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
            <h3 className={styles.chartTitle}>
              🎯 À traiter aujourd'hui {queue.length > 0 && <span style={{ color: "#dc2626" }}>({queue.reduce((t, q) => t + q.n, 0)})</span>}
            </h3>
            {queue.length === 0 ? (
              <p style={{ margin: 0, fontSize: ".86rem", color: "#059669", fontWeight: 700 }}>
                ✅ Rien en attente — tout est traité.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {queue.map((q) => (
                  <button key={q.tab} onClick={() => setActiveTab(q.tab)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                      border: "1.5px solid", borderColor: q.urgent ? "#fecaca" : "#e2e8f0",
                      background: q.urgent ? "#fef2f2" : "#f8fafc",
                    }}>
                    <span style={{ fontSize: "1.05rem" }}>{q.icon}</span>
                    <span style={{ fontWeight: 800, color: q.urgent ? "#b91c1c" : "#0f1b3f", fontSize: ".9rem", minWidth: 28 }}>{q.n}</span>
                    <span style={{ fontSize: ".85rem", color: "#475569", flex: 1 }}>{q.label}</span>
                    <span style={{ fontSize: ".8rem", color: "#6366f1", fontWeight: 700 }}>Traiter →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
  );
}
