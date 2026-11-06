import { Badge, MOIS, StatCard } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";
import { Banknote, CreditCard, BarChart3 } from "lucide-react";

// Onglet « Commissions » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function CommissionsSection({
  commissions, commissionsStats, fmtUSD, invoiceMonth, invoiceYear, loadCommissions,
  setInvoiceMonth, setInvoiceYear,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <h2 className={styles.uiTitre}>
          <Banknote size={16} aria-hidden="true" /> Commissions VIT-AUTO
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="number"
            value={invoiceYear}
            onChange={(e) => setInvoiceYear(Number(e.target.value))}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", width: 90, fontSize: "0.85rem" }}
            placeholder="Année"
          />
          <select
            value={invoiceMonth}
            onChange={(e) => setInvoiceMonth(e.target.value)}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", fontSize: "0.85rem" }}
          >
            <option value="">Tous les mois</option>
            {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <button className={styles.btnRefresh} onClick={loadCommissions}>Filtrer</button>
        </div>
      </div>

      {/* KPIs */}
      {commissionsStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
          <StatCard icon={<BarChart3 size={20} aria-hidden="true" />} label="Transactions terminées" value={commissionsStats.count} color="#6366f1" />
          <StatCard icon={<Banknote size={20} aria-hidden="true" />} label="Montant total transactions" value={fmtUSD(commissionsStats.transactions || 0)} color="#0ea5e9" />
          <StatCard icon={<Banknote size={20} aria-hidden="true" />} label="Commissions générées" value={fmtUSD(commissionsStats.total || 0)} color="#10b981" />
        </div>
      )}

      {commissions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
          <div className={styles.uiVideIcone}><CreditCard size={16} aria-hidden="true" /></div>
          <p>Aucune commission pour cette période.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Type</th>
                <th>Client</th>
                <th>Montant transaction</th>
                <th>Taux commission</th>
                <th>Commission VIT-AUTO</th>
                <th>Date</th>
                <th>Facturé</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((b) => (
                <tr key={b._id}>
                  <td style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.83rem" }}>{b.reference || "—"}</td>
                  <td><Badge label={b.type} color="#6366f1" bg="#f5f3ff" /></td>
                  <td style={{ fontSize: "0.83rem" }}>{b.clientInfo?.firstName} {b.clientInfo?.lastName}</td>
                  <td style={{ fontWeight: 700 }}>
                    {fmtUSD(b.transaction?.finalAmount || b.montantTotal || 0)}
                  </td>
                  <td style={{ color: "#6366f1", fontWeight: 700 }}>
                    {Math.round((b.commissionRate || 0) * 100)} %
                  </td>
                  <td style={{ fontWeight: 800, color: "#10b981" }}>
                    {fmtUSD(b.commissionAmount || 0)}
                  </td>
                  <td style={{ fontSize: "0.83rem" }}>
                    {b.paidAt ? new Date(b.paidAt).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td>
                    {b.invoiced
                      ? <Badge label="Facturé" color="#10b981" bg="#dcfce7" />
                      : <Badge label="Non facturé" color="#f59e0b" bg="#fef3c7" />}
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
