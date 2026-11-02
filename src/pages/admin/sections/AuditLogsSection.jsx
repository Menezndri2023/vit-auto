import styles from "../../AdminPanel.module.css";

// Onglet « Audit Logs » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function AuditLogsSection({
  auditEntries, auditFacets, auditFilter, auditLoading, loadAuditLog, setAuditFilter,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>📜 Journal d'audit</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={auditFilter.action} onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
            <option value="">Toutes les actions</option>
            {auditFacets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={auditFilter.resource} onChange={(e) => setAuditFilter((f) => ({ ...f, resource: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
            <option value="">Toutes les ressources</option>
            {auditFacets.resources.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={auditFilter.success} onChange={(e) => setAuditFilter((f) => ({ ...f, success: e.target.value }))} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
            <option value="">Tous résultats</option>
            <option value="true">Succès</option>
            <option value="false">Échec</option>
          </select>
          <button className={styles.btnRefresh} onClick={loadAuditLog}>↻ Actualiser</button>
        </div>
      </div>

      {auditLoading ? (
        <p style={{ color: "#64748b" }}>Chargement…</p>
      ) : auditEntries.length === 0 ? (
        <p style={{ color: "#64748b" }}>Aucune entrée trouvée.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Ressource</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((e) => (
                <tr key={e._id} className={styles.tr}>
                  <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("fr-FR")}</td>
                  <td style={{ fontSize: ".8rem" }}>{e.userEmail || "—"} <span style={{ color: "#94a3b8" }}>({e.userRole})</span></td>
                  <td style={{ fontSize: ".8rem", fontWeight: 600 }}>{e.action}</td>
                  <td style={{ fontSize: ".8rem" }}>{e.resource}{e.resourceId ? ` #${String(e.resourceId).slice(-6)}` : ""}</td>
                  <td>
                    {e.success
                      ? <span style={{ color: "#10b981", fontSize: ".8rem", fontWeight: 700 }}>✅</span>
                      : <span style={{ color: "#ef4444", fontSize: ".8rem", fontWeight: 700 }} title={e.errorMessage || ""}>❌</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
