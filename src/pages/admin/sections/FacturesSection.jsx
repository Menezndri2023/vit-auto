import { Badge, MOIS, StatCard } from "../shared.jsx";
import { downloadAuthFile } from "../../../utils/downloadAuthFile";
import styles from "../../AdminPanel.module.css";
import { Building2, CheckCircle2, FileText, Receipt, Wrench, Download, Banknote, Clock, Hourglass } from "lucide-react";

// Onglet « Factures » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function FacturesSection({
  fmtUSD, generateForm, generating, headers, invoiceLoading, invoices,
  invoicesStats, loadInvoices, loadServiceInvoicesAdmin, serviceInvoicesAdmin, serviceInvoicesAdminLoading, setGenerateForm,
  setGenerating, showToast, token,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <h2 className={styles.uiTitre}>
          <FileText size={16} aria-hidden="true" /> Gestion des factures partenaires
        </h2>
        <button className={styles.btnRefresh} onClick={loadInvoices}>↻ Actualiser</button>
      </div>

      {/* Génération facture */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartTitle}><Wrench size={16} aria-hidden="true" /> Générer les factures du mois</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Mois</label>
            <select
              value={generateForm.month}
              onChange={(e) => setGenerateForm((p) => ({ ...p, month: Number(e.target.value) }))}
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: "0.85rem" }}
            >
              {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Année</label>
            <input
              type="number"
              value={generateForm.year}
              onChange={(e) => setGenerateForm((p) => ({ ...p, year: Number(e.target.value) }))}
              style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", width: 100, fontSize: "0.85rem" }}
            />
          </div>
          <button
            className={styles.btnPrimary}
            disabled={generating}
            onClick={async () => {
              setGenerating(true);
              try {
                const r = await fetch("/api/invoices/generate-all", {
                  method: "POST", headers,
                  body: JSON.stringify(generateForm),
                });
                const d = await r.json();
                if (r.ok) {
                  showToast(`${d.generated} facture(s) générée(s)`);
                  loadInvoices();
                } else {
                  showToast(d.message || "Erreur", "error");
                }
              } catch { showToast("Erreur réseau", "error"); }
              setGenerating(false);
            }}
          >
            {generating ? "Génération…" : "Générer toutes les factures"}
          </button>
        </div>
      </div>

      {/* KPIs factures */}
      {invoicesStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
          <StatCard icon={<FileText size={20} aria-hidden="true" />} label="Total factures" value={invoices.length} color="#6366f1" />
          <StatCard icon={<Clock size={20} aria-hidden="true" />} label="En attente de paiement" value={invoices.filter(i => i.status === "pending").length} color="#f59e0b" />
          <StatCard icon={<CheckCircle2 size={20} aria-hidden="true" />} label="Payées" value={invoices.filter(i => i.status === "paid").length} color="#10b981" />
          <StatCard icon={<Banknote size={20} aria-hidden="true" />} label="Total encaissé" value={fmtUSD(invoicesStats.totalPaid || 0)} color="#10b981" />
          <StatCard icon={<Hourglass size={20} aria-hidden="true" />} label="En attente" value={fmtUSD(invoicesStats.totalPending || 0)} color="#f59e0b" />
        </div>
      )}

      {invoiceLoading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement…</p></div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
          <div className={styles.uiVideIcone}><FileText size={16} aria-hidden="true" /></div>
          <p>Aucune facture générée pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Partenaire</th>
                <th>Période</th>
                <th>Transactions</th>
                <th>Total commission</th>
                <th>Statut</th>
                <th>Échéance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const isPaid    = inv.status === "paid";
                const isOverdue = inv.status === "overdue";
                const statusColor = isPaid ? "#10b981" : isOverdue ? "#dc2626" : "#d97706";
                const statusBg    = isPaid ? "#dcfce7" : isOverdue ? "#fef2f2" : "#fef3c7";
                const statusLabel = isPaid ? "Payée" : isOverdue ? "En retard" : "À payer";
                return (
                  <tr key={inv._id}>
                    <td style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.83rem" }}>{inv.reference}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      <div style={{ fontWeight: 700 }}>{inv.partner?.firstName} {inv.partner?.lastName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{inv.partner?.email}</div>
                      {/* Un partenaire multi-entités reçoit une facture par entité (voir
                          Invoice.businessId) — sans ce libellé, deux factures du même mois
                          pour le même partenaire seraient indiscernables dans ce tableau. */}
                      {inv.businessId?.companyName && (
                        <div style={{ fontSize: "0.72rem", color: "#8b5cf6", fontWeight: 600 }}><Building2 size={16} aria-hidden="true" /> {inv.businessId.companyName}</div>
                      )}
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {MOIS[(inv.month || 1) - 1]} {inv.year}
                    </td>
                    <td style={{ textAlign: "center" }}>{(inv.lines || []).length}</td>
                    <td style={{ fontWeight: 800, color: "#0f1b3f" }}>
                      {fmtUSD(inv.totalCommission || 0)}
                    </td>
                    <td>
                      <Badge label={statusLabel} color={statusColor} bg={statusBg} />
                    </td>
                    <td style={{ fontSize: "0.83rem", color: isOverdue ? "#dc2626" : "#64748b" }}>
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td>
                      {!isPaid && (
                        <button
                          className={styles.btnApprove}
                          style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                          onClick={async () => {
                            const r = await fetch(`/api/invoices/${inv._id}/paid`, {
                              method: "PATCH", headers,
                              body: JSON.stringify({ paymentMethod: "virement" }),
                            });
                            if (r.ok) { showToast("Facture marquée payée"); loadInvoices(); }
                            else showToast("Erreur", "error");
                          }}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" /> Marquer payée
                        </button>
                      )}
                      {isPaid && <span style={{ color: "#10b981", fontSize: "0.82rem", fontWeight: 600 }}>
                        Payée le {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("fr-FR") : "—"}
                      </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Factures de PRESTATION — une par commande terminée, envoyée au
          partenaire (voir issueServiceInvoice, distinct des factures de
          commission ci-dessus) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2rem 0 1rem", flexWrap: "wrap", gap: 12 }}>
        <h2 className={styles.uiTitre}>
          <Receipt size={16} aria-hidden="true" /> Factures de prestation ({serviceInvoicesAdmin.length})
        </h2>
        <button className={styles.btnRefresh} onClick={loadServiceInvoicesAdmin}>↻ Actualiser</button>
      </div>
      {serviceInvoicesAdminLoading ? <p style={{ color: "#94a3b8" }}>Chargement…</p> : serviceInvoicesAdmin.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucune facture de prestation émise.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Référence</th><th>Partenaire</th><th>Commande</th><th>Paiement</th><th>Net partenaire</th><th>Émise le</th><th>PDF</th></tr>
            </thead>
            <tbody>
              {serviceInvoicesAdmin.map((inv) => (
                <tr key={inv._id}>
                  <td style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.8rem" }}>{inv.reference}</td>
                  <td style={{ fontSize: "0.85rem" }}>
                    <div style={{ fontWeight: 700 }}>{inv.partner?.firstName} {inv.partner?.lastName}</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{inv.partner?.email}</div>
                  </td>
                  <td style={{ fontSize: "0.83rem" }}>{inv.bookingReference}</td>
                  <td style={{ fontSize: "0.83rem" }}>{inv.paymentMethod || "—"}</td>
                  <td style={{ fontWeight: 800, color: "#0f1b3f" }}>{fmtUSD(inv.netPayout || 0)}</td>
                  <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                  <td>
                    <button type="button" onClick={async () => {
                        const r = await downloadAuthFile(`/api/service-invoices/${inv._id}/pdf`, `facture-${inv.reference || inv._id}.pdf`, token);
                        if (!r.ok) showToast(r.message, "error");
                      }} style={{ color: "#2563eb", fontSize: "0.82rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}><Download size={16} aria-hidden="true" /> Voir</button>
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
