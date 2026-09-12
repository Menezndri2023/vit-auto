// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import styles from "../../AdminPanel.module.css";
import { Badge, StatCard } from "../shared.jsx";

// ── Assurance — décision manuelle admin (aucun assureur partenaire intégré
// via API pour l'instant, voir server/models/InsuranceRequest.js).
const INSURANCE_TYPE_LABELS = { auto: "🚗 Auto", location: "🔑 Location", import_export: "🌍 Import/Export" };

const INSURANCE_STATUS_CFG = {
  pending:  { label: "🔍 En attente", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "✅ Approuvée",  color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "❌ Refusée",    color: "#dc2626", bg: "#fee2e2" },
};

export function InsuranceSection({ requests, loading, onDecide }) {
  const counts = {
    pending:  requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📋" label="Total demandes" value={requests.length}  color="#6366f1" />
        <StatCard icon="🔍" label="En attente"      value={counts.pending}  color="#d97706" />
        <StatCard icon="✅" label="Approuvées"      value={counts.approved} color="#10b981" />
        <StatCard icon="❌" label="Refusées"        value={counts.rejected} color="#dc2626" />
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔒</div>
          <p style={{ fontWeight: 600 }}>Aucune demande d'assurance pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Type</th><th>Véhicule</th><th>Durée</th><th>Notes</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const st = INSURANCE_STATUS_CFG[r.status];
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{r.client?.firstName} {r.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.client?.email}</div></td>
                    <td style={{ fontSize: ".82rem" }}>{INSURANCE_TYPE_LABELS[r.type] || r.type}</td>
                    <td style={{ fontSize: ".82rem" }}>{r.vehicle?.title || r.vehicleInfo || "—"}</td>
                    <td style={{ fontSize: ".82rem" }}>{r.coveragePeriodMonths} mois</td>
                    <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 180 }}>{r.notes || "—"}</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td>
                      {r.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className={styles.btnRefresh} style={{ background: "#10b981", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, status: "approved" })}>✅</button>
                          <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, status: "rejected" })}>❌</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
