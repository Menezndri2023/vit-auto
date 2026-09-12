// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";
import { Badge, StatCard, fmtDate } from "../shared.jsx";

export function LogisticsAssignmentSection({ ieTransactions, loading, token, onRefresh }) {
  const needsAttention = ieTransactions.filter((t) => ["in_escrow", "preparing"].includes(t.status));
  const [assignModal, setAssignModal] = useState(null); // { tx }
  const [transitaires, setTransitaires] = useState([]);
  const [agents, setAgents] = useState([]);
  const [assignMode, setAssignMode] = useState("transitaire");
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);

  useEffect(() => {
    if (!assignModal) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`/api/import-export/transitaires?country=${encodeURIComponent(assignModal.tx.destCountry || "")}`, { headers })
      .then((r) => r.ok ? r.json() : { transitaires: [] }).then((d) => setTransitaires(d.transitaires || [])).catch(() => setTransitaires([]));
    fetch("/api/import-export/agents", { headers })
      .then((r) => r.ok ? r.json() : { agents: [] }).then((d) => setAgents(d.agents || [])).catch(() => setAgents([]));
  }, [assignModal, token]);

  const openAssign = (tx) => { setAssignModal({ tx }); setAssignMode("transitaire"); setAssignTo(""); };

  const handleAssign = async () => {
    if (!assignTo || !assignModal) return;
    setAssigning(true);
    try {
      const r = await fetch(`/api/import-export/transactions/${assignModal.tx._id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: assignMode, assignedTo: assignTo }),
      });
      if (r.ok) { setAssignModal(null); setAssignError(null); onRefresh(); }
      else {
        const d = await r.json().catch(() => null);
        setAssignError(d?.message || "Assignation refusée par le serveur.");
      }
    } catch {
      setAssignError("Erreur réseau — assignation non enregistrée.");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {needsAttention.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
          <p style={{ fontWeight: 600 }}>Aucun dossier en attente d'assignation.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Client</th><th>Partenaire</th><th>Destination</th><th>Statut</th><th>Pris en charge par</th><th>Actions</th></tr></thead>
            <tbody>
              {needsAttention.map((t) => (
                <tr key={t._id} className={styles.tr}>
                  <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong></td>
                  <td style={{ fontSize: ".82rem" }}>{t.partner?.firstName} {t.partner?.lastName}</td>
                  <td style={{ fontSize: ".82rem" }}>{t.destCountry || "—"}</td>
                  <td><Badge label={t.status === "in_escrow" ? "Fonds sécurisés" : "Préparation"} color={t.status === "in_escrow" ? "#0891b2" : "#f59e0b"} bg={t.status === "in_escrow" ? "#ecfeff" : "#fef3c7"} /></td>
                  <td style={{ fontSize: ".82rem" }}>
                    {t.assignment?.assignedTo
                      ? <>{t.assignment.mode === "transitaire" ? "🚚" : "🧑‍💼"} {t.assignment.assignedTo.firstName} {t.assignment.assignedTo.lastName}{t.assignment.autoAssigned ? " (auto)" : ""}</>
                      : <span style={{ color: "#dc2626" }}>⏳ Non assigné</span>}
                  </td>
                  <td>
                    <button className={styles.btnApprove} onClick={() => openAssign(t)}>
                      {t.assignment?.assignedTo ? "Réassigner" : "Assigner"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assignModal && (
        <div className={styles.overlay} onClick={() => setAssignModal(null)}>
          <div className={styles.confirmBox} style={{ maxWidth: 460, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Assigner la transaction {assignModal.tx.reference || assignModal.tx._id}</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className={assignMode === "transitaire" ? styles.btnPrimary : styles.btnGhost} onClick={() => { setAssignMode("transitaire"); setAssignTo(""); }}>🚚 Transitaire partenaire</button>
              <button className={assignMode === "agent" ? styles.btnPrimary : styles.btnGhost} onClick={() => { setAssignMode("agent"); setAssignTo(""); }}>🧑‍💼 Agent interne</button>
            </div>
            <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={{ width: "100%", padding: "0.5rem", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 8 }}>
              <option value="">— Choisir —</option>
              {(assignMode === "transitaire" ? transitaires : agents).map((p) => (
                <option key={p.userId || p._id} value={p.userId || p._id}>
                  {p.firstName} {p.lastName}{p.country ? ` — ${p.country}` : ""}
                </option>
              ))}
            </select>
            {assignMode === "transitaire" && transitaires.length === 0 && (
              <p style={{ fontSize: ".8rem", color: "#dc2626", margin: "0 0 8px" }}>
                Aucun transitaire actif pour {assignModal.tx.destCountry || "cette destination"} — choisissez un agent interne à la place.
              </p>
            )}
            {assignError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: ".8rem", marginBottom: 10 }}>
                ⚠️ {assignError}
              </div>
            )}
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} disabled={!assignTo || assigning} onClick={handleAssign}>
                {assigning ? "…" : "Confirmer"}
              </button>
              <button className={styles.btnGhost} onClick={() => { setAssignModal(null); setAssignError(null); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transport International — construit à partir de IETransaction.shipping,
// déjà collecté via le pipeline export 14 étapes (markShipped/updateTracking,
// voir ieTransactionController.js) mais jusqu'ici jamais affiché à l'admin :
// aucune nouvelle donnée, uniquement une vue dédiée sur les transactions déjà
// en logistique (aucun endpoint backend créé — réutilise ieTransactions,
// chargé sans filtre par loadIeTransactions).
const SHIPPING_TYPE_LABELS = { maritime: "🚢 Maritime", terrestre: "🚚 Terrestre", aerien: "✈️ Aérien" };

export function TransportSection({ ieTransactions, loading }) {
  const inLogistics = ieTransactions.filter((t) => ["preparing", "shipped", "in_transit", "delivered"].includes(t.status));
  const counts = {
    preparing: inLogistics.filter((t) => t.status === "preparing").length,
    shipped:   inLogistics.filter((t) => t.status === "shipped").length,
    in_transit:inLogistics.filter((t) => t.status === "in_transit").length,
    delivered: inLogistics.filter((t) => t.status === "delivered").length,
  };

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="📦" label="En préparation" value={counts.preparing}  color="#f59e0b" />
        <StatCard icon="🚢" label="Expédiées"       value={counts.shipped}   color="#6366f1" />
        <StatCard icon="🌊" label="En transit"      value={counts.in_transit} color="#0891b2" />
        <StatCard icon="✅" label="Livrées"          value={counts.delivered} color="#10b981" />
      </div>

      {inLogistics.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🚢</div>
          <p style={{ fontWeight: 600 }}>Aucune cargaison en cours d'acheminement.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Partenaire</th><th>Transporteur</th><th>N° suivi</th><th>Type</th><th>Départ</th><th>Arrivée est.</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {inLogistics.map((t) => {
                const st = { preparing: { l: "Préparation", c: "#f59e0b", bg: "#fef3c7" }, shipped: { l: "Expédiée", c: "#6366f1", bg: "#eef2ff" },
                  in_transit: { l: "En transit", c: "#0891b2", bg: "#ecfeff" }, delivered: { l: "Livrée", c: "#10b981", bg: "#d1fae5" } }[t.status];
                return (
                  <tr key={t._id} className={styles.tr}>
                    <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong></td>
                    <td><strong style={{ fontSize: ".85rem" }}>{t.partner?.firstName} {t.partner?.lastName}</strong></td>
                    <td style={{ fontSize: ".82rem" }}>{t.shipping?.carrier || "—"}</td>
                    <td style={{ fontSize: ".82rem", fontFamily: "monospace" }}>{t.shipping?.trackingNumber || "—"}</td>
                    <td style={{ fontSize: ".82rem" }}>{SHIPPING_TYPE_LABELS[t.shipping?.shippingType] || "—"}</td>
                    <td className={styles.tdDate}>{fmtDate(t.shipping?.departureDate)}</td>
                    <td className={styles.tdDate}>{fmtDate(t.shipping?.estimatedArrival)}</td>
                    <td><Badge label={st.l} color={st.c} bg={st.bg} /></td>
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

// ── Escrow / Séquestre — construit à partir de IETransaction.payment, déjà
// collecté via payEscrow/confirmEscrowPayment/releaseFunds (voir
// ieTransactionController.js) mais jusqu'ici jamais consolidé dans une vue
// financière dédiée pour l'admin.
export function EscrowSection({ ieTransactions, loading }) {
  const held     = ieTransactions.filter((t) => t.status === "in_escrow");
  const released = ieTransactions.filter((t) => t.payment?.releasedAt);
  // Les montants sont dans des devises différentes (USD, MAD, XOF…) — les
  // additionner produisait un total sans aucun sens, affiché sans symbole, sur
  // lequel un admin pouvait fonder une décision de trésorerie. On totalise
  // désormais PAR DEVISE.
  const sumByCurrency = (list) => list.reduce((acc, t) => {
    const cur = t.payment?.currency || "?";
    acc[cur] = (acc[cur] || 0) + (t.payment?.amount || 0);
    return acc;
  }, {});
  const fmtByCurrency = (totals) => {
    const entries = Object.entries(totals);
    if (!entries.length) return "0";
    return entries.map(([cur, amt]) => `${amt.toLocaleString("fr-FR")} ${cur}`).join(" · ");
  };
  const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const totalHeld = fmtByCurrency(sumByCurrency(held));
  const releasedThisMonth = fmtByCurrency(
    sumByCurrency(released.filter((t) => new Date(t.payment.releasedAt) >= thisMonth))
  );

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        <StatCard icon="🔐" label="Dossiers en séquestre" value={held.length} color="#0891b2" />
        <StatCard icon="💰" label="Total bloqué"          value={totalHeld} color="#f59e0b" />
        <StatCard icon="✅" label="Dossiers libérés"       value={released.length} color="#10b981" />
        <StatCard icon="📤" label="Libéré ce mois"         value={releasedThisMonth} color="#6366f1" />
      </div>

      {held.length === 0 && released.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔐</div>
          <p style={{ fontWeight: 600 }}>Aucun fonds en séquestre pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Client</th><th>Partenaire</th><th>Montant</th><th>Méthode</th><th>Référence</th><th>Mis en séquestre le</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {[...held, ...released.filter((t) => t.status !== "in_escrow")].map((t) => (
                <tr key={t._id} className={styles.tr}>
                  <td><strong style={{ fontSize: ".85rem" }}>{t.client?.firstName} {t.client?.lastName}</strong></td>
                  <td><strong style={{ fontSize: ".85rem" }}>{t.partner?.firstName} {t.partner?.lastName}</strong></td>
                  <td className={styles.tdPrice}>{(t.payment?.amount || 0).toLocaleString("fr-FR")} {t.payment?.currency}</td>
                  <td style={{ fontSize: ".82rem" }}>{t.payment?.method || "—"}</td>
                  <td style={{ fontSize: ".78rem", fontFamily: "monospace" }}>{t.payment?.escrowRef || t.payment?.transactionRef || "—"}</td>
                  <td className={styles.tdDate}>{fmtDate(t.payment?.paidAt)}</td>
                  <td>{t.payment?.releasedAt
                    ? <Badge label="Libéré" color="#10b981" bg="#d1fae5" />
                    : <Badge label="En séquestre" color="#0891b2" bg="#ecfeff" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
