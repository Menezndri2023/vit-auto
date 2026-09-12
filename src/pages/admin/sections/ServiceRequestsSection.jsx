// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import styles from "../../AdminPanel.module.css";
import { Badge, StatCard } from "../shared.jsx";

// ── Demandes de services génériques (transport/transit/douanes/immatriculation/
// garantie/financement/change de devises) — décision manuelle admin, commission
// calculée à l'approbation depuis PricingConfig.services.<catégorie>.
const SVC_REQ_CATEGORY_LABELS = {
  transport: "🚢 Transport", transit: "🛃 Transit", douanes: "🏛️ Douanes",
  immatriculation: "🪪 Immatriculation", garantie: "🛡️ Garantie",
  financement: "🏦 Financement", change_devises: "💱 Change de devises",
};

const SVC_REQ_STATUS_CFG = {
  pending:  { label: "🔍 En attente", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "✅ Approuvée",  color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "❌ Refusée",    color: "#dc2626", bg: "#fee2e2" },
};

export function ServiceRequestsSection({ requests, loading, category, onCategoryChange, onDecide }) {
  const counts = {
    pending:  requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <select value={category} onChange={(e) => onCategoryChange(e.target.value)}
          style={{ padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: ".85rem" }}>
          <option value="">Toutes les catégories</option>
          {Object.entries(SVC_REQ_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📋" label="Total demandes" value={requests.length}  color="#6366f1" />
        <StatCard icon="🔍" label="En attente"      value={counts.pending}  color="#d97706" />
        <StatCard icon="✅" label="Approuvées"      value={counts.approved} color="#10b981" />
        <StatCard icon="❌" label="Refusées"        value={counts.rejected} color="#dc2626" />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🧰</div>
          <p style={{ fontWeight: 600 }}>Aucune demande pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Catégorie</th><th>Véhicule</th><th>Détails</th><th>Notes</th><th>Statut</th><th>Devis / Commission</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const st = SVC_REQ_STATUS_CFG[r.status];
                const detailsStr = Object.entries(r.details || {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}: ${v}`).join(" · ");
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{r.client?.firstName} {r.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.client?.email}</div></td>
                    <td style={{ fontSize: ".82rem" }}>{SVC_REQ_CATEGORY_LABELS[r.category] || r.category}</td>
                    <td style={{ fontSize: ".82rem" }}>{r.vehicle?.title || r.vehicleInfo || "—"}</td>
                    <td style={{ fontSize: ".76rem", color: "#64748b", maxWidth: 200 }}>{detailsStr || "—"}</td>
                    <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 160 }}>{r.notes || "—"}</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td style={{ fontSize: ".78rem" }}>
                      {r.quotedAmountUSD != null ? `$${r.quotedAmountUSD}` : "—"}
                      {r.commission?.amount != null && <div style={{ color: "#10b981" }}>Comm. ${r.commission.amount}</div>}
                    </td>
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
