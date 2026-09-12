// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import styles from "../../AdminPanel.module.css";
import { Badge, StatCard } from "../shared.jsx";

// ── Financement — demandes leasing/crédit (Booking type="leasing", voir
// server/models/Booking.js champ leasing.decision). Décision manuelle admin :
// aucune banque/société de leasing partenaire n'est intégrée pour l'instant
// (partie technique à raccorder plus tard).
const FINANCING_DECISION_CFG = {
  en_etude: { label: "🔍 En étude", color: "#d97706", bg: "#fef3c7" },
  accepte:  { label: "✅ Accepté",  color: "#10b981", bg: "#d1fae5" },
  refuse:   { label: "❌ Refusé",   color: "#dc2626", bg: "#fee2e2" },
};

export function FinancingSection({ requests, loading, onDecide }) {
  const counts = {
    en_etude: requests.filter((r) => (r.leasing?.decision || "en_etude") === "en_etude").length,
    accepte:  requests.filter((r) => r.leasing?.decision === "accepte").length,
    refuse:   requests.filter((r) => r.leasing?.decision === "refuse").length,
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📋" label="Total demandes" value={requests.length}     color="#6366f1" />
        <StatCard icon="🔍" label="En étude"        value={counts.en_etude}    color="#d97706" />
        <StatCard icon="✅" label="Acceptées"       value={counts.accepte}     color="#10b981" />
        <StatCard icon="❌" label="Refusées"        value={counts.refuse}      color="#dc2626" />
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🏦</div>
          <p style={{ fontWeight: 600 }}>Aucune demande de financement pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Véhicule</th><th>Produit</th><th>Apport</th><th>Mensualité</th><th>Durée</th><th>Taux</th><th>Décision</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const l  = r.leasing || {};
                const st = FINANCING_DECISION_CFG[l.decision || "en_etude"];
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{r.client?.firstName} {r.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.client?.email}</div></td>
                    <td style={{ fontSize: ".82rem" }}>{r.vehicle?.title || `${r.vehicle?.marque || ""} ${r.vehicle?.modele || ""}`.trim() || "—"}</td>
                    <td style={{ fontSize: ".82rem" }}>{l.financingType === "credit" ? "Crédit classique" : "Leasing (LOA)"}</td>
                    <td className={styles.tdPrice}>{(l.apportInitial || 0).toLocaleString("fr-FR")}</td>
                    <td className={styles.tdPrice}>{(l.mensualite || 0).toLocaleString("fr-FR")}</td>
                    <td style={{ fontSize: ".82rem" }}>{l.duree || "—"} mois</td>
                    <td style={{ fontSize: ".82rem" }}>{l.tauxInteret || "—"}%</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {l.decision !== "accepte" && (
                          <button className={styles.btnRefresh} style={{ background: "#10b981", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, decision: "accepte" })}>✅</button>
                        )}
                        {l.decision !== "refuse" && (
                          <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                            onClick={() => onDecide({ id: r._id, decision: "refuse" })}>❌</button>
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
  );
}
