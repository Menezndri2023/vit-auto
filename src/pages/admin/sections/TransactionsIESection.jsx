import { Badge, StatCard, fmtDate } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";
import { CheckCircle2, Globe, Hourglass, Lock, Phone, Search, Trash2, XCircle, Scale } from "lucide-react";

// Onglet « Transactions I/E » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function TransactionsIESection({
  deleteIeRequest, ieActionSaving, ieLoading, ieRequests, ieRequestsTotal, ieTransactions,
  ieTxLoading, loadIeTransactions, loadImportExport, loadMoreIeRequests, setConfirm, setIeTxModal,
  setIeTxNote, setIeTxRelease, updateIeRequestStatus,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <div>
          <h2 className={styles.uiTitreSection}><Globe size={16} aria-hidden="true" /> Transactions Import / Export</h2>
          <p className={styles.uiSousTitre}>Suivi de toutes les demandes et transactions internationales.</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadImportExport}>↻ Actualiser</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { icon: <Globe size={16} aria-hidden="true" />, label: "Total demandes",       value: ieRequests.length,                                             color: "#6366f1" },
          { icon: <Hourglass size={16} aria-hidden="true" />, label: "En attente",           value: ieRequests.filter(r => r.status === "pending").length,          color: "#f59e0b" },
          { icon: <CheckCircle2 size={16} aria-hidden="true" />, label: "Approuvées",           value: ieRequests.filter(r => r.status === "approved").length,         color: "#10b981" },
          { icon: <XCircle size={16} aria-hidden="true" />, label: "Rejetées",             value: ieRequests.filter(r => r.status === "rejected").length,         color: "#ef4444" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      {ieLoading ? (
        <div className={styles.uiVide}>Chargement…</div>
      ) : ieRequests.length === 0 ? (
        <div className={styles.uiVide}>
          <div className={styles.uiVideIcone}><Globe size={16} aria-hidden="true" /></div>
          <p style={{ fontWeight: 600 }}>Aucune transaction import/export pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Référence</th><th>Type</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {ieRequests.map((r) => {
                const ST = { pending: { l: "En attente", c: "#d97706", bg: "#fef3c7" }, approved: { l: "Approuvée", c: "#16a34a", bg: "#dcfce7" }, rejected: { l: "Rejetée", c: "#dc2626", bg: "#fee2e2" }, in_progress: { l: "En cours", c: "#3b82f6", bg: "#eff6ff" }, completed: { l: "Terminée", c: "#6366f1", bg: "#eef2ff" }, processing: { l: "En traitement", c: "#3b82f6", bg: "#eff6ff" }, contacted: { l: "Contacté", c: "#6366f1", bg: "#eef2ff" } };
                const st = ST[r.status] || ST.pending;
                return (
                  <tr key={r._id} className={styles.tr}>
                    <td style={{ fontWeight: 700, fontSize: ".85rem", fontFamily: "monospace" }}>{r.reference || r._id?.slice(-8)}</td>
                    <td><Badge label={r.type === "import" ? "Import" : r.type === "export" ? "Export" : r.type || "—"} color="#6366f1" bg="#eef2ff" /></td>
                    <td>
                      <div>
                        <strong style={{ fontSize: ".87rem" }}>{r.clientInfo?.firstName || r.buyer?.firstName || ""} {r.clientInfo?.lastName || r.buyer?.lastName || ""}</strong>
                        <div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{r.clientInfo?.email || r.buyer?.email || "—"}</div>
                      </div>
                    </td>
                    <td className={styles.tdPrice}>{r.totalAmount ? `${Number(r.totalAmount).toLocaleString("fr-FR")} ${r.currency || "EUR"}` : "—"}</td>
                    <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
                    <td className={styles.tdDate}>{fmtDate(r.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["pending", "processing"].includes(r.status) && (
                          <>
                            <button disabled={ieActionSaving} onClick={() => updateIeRequestStatus(r._id, "approved")}
                              title="Approuver" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}><CheckCircle2 size={16} aria-hidden="true" /></button>
                            <button disabled={ieActionSaving} onClick={() => updateIeRequestStatus(r._id, "rejected")}
                              title="Rejeter" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}><XCircle size={16} aria-hidden="true" /></button>
                            <button disabled={ieActionSaving} onClick={() => updateIeRequestStatus(r._id, "contacted")}
                              title="Marquer contacté" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}><Phone size={16} aria-hidden="true" /></button>
                          </>
                        )}
                        <button disabled={ieActionSaving}
                          onClick={() => setConfirm({ message: `Supprimer définitivement la demande ${r.reference || ""} ?`, danger: true, action: () => deleteIeRequest(r._id) })}
                          title="Supprimer" style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#f1f5f9", color: "#64748b", fontWeight: 700, fontSize: ".72rem", cursor: ieActionSaving ? "not-allowed" : "pointer" }}><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Bug réel corrigé (audit) : plafond de 100 demandes chargées,
          invisible pour l'admin — voir loadMoreIeRequests. */}
      {ieRequests.length < ieRequestsTotal && (
        <div style={{ textAlign: "center", margin: "10px 0" }}>
          <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{ieRequests.length} chargées sur {ieRequestsTotal} au total</p>
          <button onClick={loadMoreIeRequests}
            style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
            Charger plus
          </button>
        </div>
      )}

      {/* ── Transactions IE réelles (pipeline escrow) — litiges & inspections ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2rem 0 1rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>Transactions Import/Export en cours</h3>
          <p className={styles.uiSousTitre}>Pipeline réel étapes 4-14 — argent bloqué en entiercement, litiges et inspections à traiter ici.</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadIeTransactions}>↻ Actualiser</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { icon: <Lock size={16} aria-hidden="true" />, label: "Total",         value: ieTransactions.length, color: "#6366f1" },
          { icon: <Scale size={16} aria-hidden="true" />, label: "En litige",      value: ieTransactions.filter(t => t.status === "disputed").length, color: "#dc2626" },
          { icon: <Search size={16} aria-hidden="true" />, label: "Inspection en attente", value: ieTransactions.filter(t => t.status === "inspection_requested").length, color: "#d97706" },
          { icon: <Hourglass size={16} aria-hidden="true" />, label: "Paiement à vérifier", value: ieTransactions.filter(t => t.status === "payment_submitted").length, color: "#d97706" },
          { icon: <CheckCircle2 size={16} aria-hidden="true" />, label: "Terminées",      value: ieTransactions.filter(t => ["completed","funds_released"].includes(t.status)).length, color: "#10b981" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      {ieTxLoading ? (
        <div className={styles.uiVide}>Chargement…</div>
      ) : ieTransactions.length === 0 ? (
        <div className={styles.uiVide}>
          <div className={styles.uiVideIcone}><Lock size={16} aria-hidden="true" /></div>
          <p style={{ fontWeight: 600 }}>Aucune transaction escrow pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Partenaire</th><th>Montant</th><th>Statut</th><th>Litige</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {ieTransactions.map((t) => {
                const ST = {
                  reserved: { l: "Réservée", c: "#6366f1", bg: "#eef2ff" },
                  disputed: { l: "Litige", c: "#dc2626", bg: "#fee2e2" },
                  inspection_requested: { l: "Inspection demandée", c: "#d97706", bg: "#fef3c7" },
                  payment_submitted: { l: "Paiement à vérifier", c: "#d97706", bg: "#fef3c7" },
                  in_escrow: { l: "En entiercement", c: "#0891b2", bg: "#ecfeff" },
                  funds_released: { l: "Fonds libérés", c: "#10b981", bg: "#d1fae5" },
                  completed: { l: "Terminée", c: "#10b981", bg: "#d1fae5" },
                  cancelled: { l: "Annulée", c: "#94a3b8", bg: "#f1f5f9" },
                };
                const st = ST[t.status] || { l: t.status, c: "#64748b", bg: "#f1f5f9" };
                return (
                  <tr key={t._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{t.client?.email}</div></td>
                    <td><strong style={{ fontSize: ".85rem" }}>{t.partner?.firstName} {t.partner?.lastName}</strong><div style={{ fontSize: ".74rem", color: "#94a3b8" }}>{t.partner?.business?.name || t.partner?.email}</div></td>
                    <td className={styles.tdPrice}>
                      {t.finalOffer?.totalAmount ? `${Number(t.finalOffer.totalAmount).toLocaleString("fr-FR")} ${t.finalOffer.currency}` : "—"}
                      {t.payment?.commission?.amount != null && (
                        <div style={{ fontSize: ".72rem", color: "#059669", fontWeight: 700 }}>
                          Commission {(t.payment.commission.rate * 100).toFixed(0)}% : {Number(t.payment.commission.amount).toLocaleString("fr-FR")} {t.payment.currency}
                        </div>
                      )}
                    </td>
                    <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
                    <td style={{ fontSize: ".78rem", color: "#64748b", maxWidth: 200 }}>{t.dispute?.opened ? (t.dispute.reason || "Litige ouvert") : "—"}</td>
                    <td className={styles.tdDate}>{fmtDate(t.createdAt)}</td>
                    <td>
                      {t.status === "disputed" && (
                        <button className={styles.btnRefresh} style={{ background: "#dc2626", color: "#fff", border: "none" }}
                          onClick={() => { setIeTxModal({ tx: t, mode: "dispute" }); setIeTxNote(""); setIeTxRelease(true); }}>
                          <Scale size={16} aria-hidden="true" /> Trancher
                        </button>
                      )}
                      {t.status === "inspection_requested" && (
                        <button className={styles.btnRefresh} style={{ background: "#d97706", color: "#fff", border: "none" }}
                          onClick={() => { setIeTxModal({ tx: t, mode: "inspection" }); setIeTxNote(""); }}>
                          <Search size={16} aria-hidden="true" /> Compléter
                        </button>
                      )}
                      {t.status === "payment_submitted" && (
                        <button className={styles.btnRefresh} style={{ background: "#d97706", color: "#fff", border: "none" }}
                          onClick={() => { setIeTxModal({ tx: t, mode: "payment" }); setIeTxNote(""); }}>
                          <Hourglass size={16} aria-hidden="true" /> Vérifier
                        </button>
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
