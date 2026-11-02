import { Badge, fmtDate } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Signalements » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function SignalementsSection({
  decideReport, loadReports, reportFilter, reports, reportsLoading, setReportFilter,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🚩 Signalements</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Signalements envoyés par les utilisateurs sur des annonces, avis ou profils.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}>
            <option value="">Tous</option>
            <option value="en_attente">En attente</option>
            <option value="examine">Examiné</option>
            <option value="classe_sans_suite">Classé sans suite</option>
            <option value="action_prise">Action prise</option>
          </select>
          <button className={styles.btnRefresh} onClick={loadReports}>↻ Actualiser</button>
        </div>
      </div>
      {reportsLoading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : (() => {
        const filtered = reportFilter ? reports.filter((r) => r.status === reportFilter) : reports;
        const STATUS_CFG = {
          en_attente:         { label: "En attente",         color: "#d97706", bg: "#fffbeb" },
          examine:            { label: "Examiné",            color: "#2563eb", bg: "#eff6ff" },
          classe_sans_suite:  { label: "Classé sans suite",  color: "#94a3b8", bg: "#f1f5f9" },
          action_prise:       { label: "Action prise",       color: "#059669", bg: "#ecfdf5" },
        };
        const REASON_LABELS = {
          fraude: "Fraude / arnaque", contenu_inapproprie: "Contenu inapproprié",
          annonce_fausse: "Annonce fausse", contenu_illicite: "Contenu illicite",
          harcelement: "Harcèlement", autre: "Autre",
        };
        return filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚩</div>
            <p style={{ fontWeight: 600 }}>Aucun signalement pour ce filtre.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Cible</th><th>Motif</th><th>Description</th><th>Par</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sc = STATUS_CFG[r.status] || STATUS_CFG.en_attente;
                  return (
                    <tr key={r._id} className={styles.tr}>
                      <td style={{ fontSize: ".82rem" }}>{r.targetType} <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: ".72rem" }}>{r.targetId}</span></td>
                      <td style={{ fontSize: ".82rem" }}>{REASON_LABELS[r.reason] || r.reason}</td>
                      <td style={{ fontSize: ".8rem", maxWidth: 240 }}>{r.description || "—"}</td>
                      <td style={{ fontSize: ".82rem" }}>{r.reporter?.firstName} {r.reporter?.lastName}</td>
                      <td><Badge label={sc.label} color={sc.color} bg={sc.bg} /></td>
                      <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                      <td>
                        <div className={styles.actionBtns}>
                          {r.status === "en_attente" && (
                            <>
                              <button className={styles.btnApprove} style={{ fontSize: ".72rem" }} onClick={() => decideReport(r._id, "action_prise")}>Action prise</button>
                              <button className={styles.btnGhost} style={{ fontSize: ".72rem" }} onClick={() => decideReport(r._id, "classe_sans_suite")}>Classer sans suite</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
