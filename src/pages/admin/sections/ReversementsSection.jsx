import { Badge, fmtDate } from "../shared.jsx";
import { HandCoins } from "lucide-react";
import styles from "../../AdminPanel.module.css";

// Onglet « Reversements » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ReversementsSection({
  fmtUSD, loadPayouts, markPayoutPaid, payoutMarkingId, payoutsFilter, payoutsList,
  payoutsLoading, payoutsTotal, setPayoutsFilter,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <div>
          <h2 className={styles.uiTitreSection}><HandCoins size={16} aria-hidden="true" /> Reversements partenaire ({payoutsTotal})</h2>
          <p className={styles.uiSousTitre}>
            Ce que VIT AUTO doit à chaque partenaire (généré automatiquement à la complétion d'une commande) — aucun virement n'est exécuté automatiquement, "Marquer payé" trace seulement qu'il a été fait manuellement (banque/mobile money).
          </p>
        </div>
        <button className={styles.btnRefresh} onClick={loadPayouts}>↻ Actualiser</button>
      </div>

      <div className={styles.filterBar} style={{ marginBottom: 16 }}>
        {["pending", "paid", ""].map((s) => (
          <button key={s || "all"}
            className={`${styles.filterBtn} ${payoutsFilter === s ? styles.filterActive : ""}`}
            onClick={() => setPayoutsFilter(s)}>
            {s === "pending" ? "En attente" : s === "paid" ? "Payés" : "Tous"}
          </button>
        ))}
      </div>

      {payoutsLoading ? (
        <div className={styles.uiVide}>Chargement…</div>
      ) : payoutsList.length === 0 ? (
        <div className={styles.uiVide}>Aucun reversement pour ce filtre.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Partenaire</th><th>Référence</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {payoutsList.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{p.partnerId?.firstName} {p.partnerId?.lastName}</div>
                    <div style={{ fontSize: ".78rem", color: "#64748b" }}>{p.partnerId?.email}</div>
                  </td>
                  <td style={{ fontSize: ".82rem" }}>{p.notes || p.transactionId}</td>
                  <td className={styles.tdPrice}>{fmtUSD(p.commissionAmount)}</td>
                  <td>
                    {p.status === "paid"
                      ? <Badge label="Payé" color="#16a34a" bg="#dcfce7" />
                      : <Badge label="En attente" color="#d97706" bg="#fef3c7" />}
                    {p.status === "paid" && p.paidViaTxId && (
                      <div style={{ fontSize: ".72rem", color: "#94a3b8", marginTop: 2 }}>Réf : {p.paidViaTxId}</div>
                    )}
                  </td>
                  <td className={styles.tdDate}>{fmtDate(p.createdAt)}</td>
                  <td>
                    {p.status !== "paid" && (
                      <button disabled={payoutMarkingId === p._id} onClick={() => markPayoutPaid(p._id)}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".78rem", cursor: payoutMarkingId === p._id ? "not-allowed" : "pointer", opacity: payoutMarkingId === p._id ? 0.6 : 1 }}>
                        {payoutMarkingId === p._id ? "…" : "Marquer payé"}
                      </button>
                    )}
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
