import styles from "../../AdminPanel.module.css";

// Onglet « Contrats » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ContratsSection({
  contracts, contractsLoading, loadContracts,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>📑 Contrats de réservation</h2>
        <button className={styles.btnRefresh} onClick={loadContracts}>↻ Actualiser</button>
      </div>

      {contractsLoading ? (
        <p style={{ color: "#64748b" }}>Chargement…</p>
      ) : contracts.length === 0 ? (
        <p style={{ color: "#64748b" }}>Aucun contrat émis pour l'instant.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Type</th>
                <th>Client</th>
                <th>Partenaire</th>
                <th>Réservation</th>
                <th>Montant</th>
                <th>Signature</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((ct) => (
                <tr key={ct._id} className={styles.tr}>
                  <td style={{ fontSize: ".8rem", fontWeight: 700, whiteSpace: "nowrap" }}>{ct.contractNumber || `#${String(ct._id).slice(-6)}`}</td>
                  <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{ct.createdAt ? new Date(ct.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                  <td style={{ fontSize: ".8rem" }}>{ct.type || "—"}</td>
                  <td style={{ fontSize: ".8rem" }}>{`${ct.client?.firstName || ""} ${ct.client?.lastName || ""}`.trim() || ct.client?.email || "—"}</td>
                  <td style={{ fontSize: ".8rem" }}>{ct.vendor?.name || "—"}</td>
                  <td style={{ fontSize: ".8rem" }}>{ct.booking?.reference || "—"}</td>
                  {/* Montant affiché dans la devise PROPRE du contrat : les
                      contrats antérieurs à la refonte du modèle économique
                      sont en XOF, les suivants en USD (voir Contract.currency).
                      Les convertir ici afficherait un montant qui ne
                      correspond plus à la pièce signée. */}
                  <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>
                    {ct.terms?.totalXOF != null
                      ? `${Number(ct.terms.totalXOF).toLocaleString("fr-FR")} ${ct.currency || "USD"}`
                      : "—"}
                  </td>
                  <td style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>
                    {ct.isSigned
                      ? <span style={{ color: "#10b981", fontWeight: 700 }}>✅ {ct.signedAt ? new Date(ct.signedAt).toLocaleDateString("fr-FR") : ""}</span>
                      : <span style={{ color: "#94a3b8" }}>Non signé</span>}
                  </td>
                  <td><span className={styles.badge}>{ct.status || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
