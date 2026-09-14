// Pièces détachées (secteur « pièces », 2026-09-14) — modération et suivi des
// annonces, autonome : charge ses données et applique les décisions lui-même
// (même contrat que les autres sections, voir docs/pieces-detachees.md).
import { useCallback, useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";
import { Badge, StatCard, fmtDate } from "../shared.jsx";
import { PART_CATEGORY_LABELS, PART_CONDITION_LABELS } from "../../../constants/spareParts";
import { useCurrency } from "../../../context/CurrencyContext";

const STATUS_CFG = {
  pending:  { label: "⏳ En attente", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "✅ Publiée",    color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "❌ Rejetée",    color: "#dc2626", bg: "#fee2e2" },
  archived: { label: "📦 Archivée",   color: "#64748b", bg: "#f1f5f9" },
};

export function PartsSection({ headers, bookings = [], onToast }) {
  const { fmt } = useCurrency();
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState(null);
  const [rejectModal, setRejectModal] = useState(null); // { id, title }
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/parts/pending?status=all", { headers });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
      setParts(d.parts || []);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, status, rejectionReason) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/parts/${id}/status`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Erreur serveur.");
      setParts((prev) => prev.map((p) => (p._id === id ? d.part : p)));
      onToast?.(status === "approved" ? "✅ Pièce publiée." : status === "rejected" ? "Pièce rejetée." : "Statut mis à jour.");
    } catch (e) {
      onToast?.(e.message || "Impossible de mettre à jour.", "error");
    } finally { setBusy(null); }
  };

  const counts = Object.fromEntries(Object.keys(STATUS_CFG).map((k) => [k, parts.filter((p) => p.status === k).length]));
  const visible = parts.filter((p) => filter === "all" || p.status === filter);
  const commandes = bookings.filter((b) => b.type === "piece");
  const ca = commandes.filter((b) => b.status === "completed").reduce((s, b) => s + (b.montantTotal || 0), 0);
  const commission = commandes.filter((b) => b.status === "completed").reduce((s, b) => s + (b.commissionAmount || 0), 0);

  return (
    <div>
      <div className={styles.sectionHeaderRow} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>🔩 Pièces détachées</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Validez les annonces (vente directe ou importation, toujours livrées) ; les commandes sont transmises directement au vendeur et suivies dans Réservations.</p>
        </div>
        <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={load}>↻ Actualiser</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <StatCard icon="⏳" label="En attente"          value={counts.pending}  color="#f59e0b" />
        <StatCard icon="✅" label="Publiées"            value={counts.approved} color="#10b981" />
        <StatCard icon="📦" label="Commandes"           value={commandes.length} color="#3b82f6" />
        <StatCard icon="💰" label="CA livré / commission" value={`${fmt(ca)} / ${fmt(commission)}`} color="#6366f1" />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["pending", "En attente"], ["approved", "Publiées"], ["rejected", "Rejetées"], ["archived", "Archivées"], ["all", "Toutes"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            style={{ padding: "6px 12px", borderRadius: 999, border: "1.5px solid", borderColor: filter === k ? "#0f766e" : "#e2e8f0", background: filter === k ? "#ccfbf1" : "#fff", color: filter === k ? "#0f766e" : "#475569", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
            {l}{k !== "all" ? ` (${counts[k]})` : ` (${parts.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Chargement…</div>
      ) : error ? (
        <div style={{ color: "#dc2626", padding: "1rem" }}>⚠️ {error}</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔩</div>
          <p style={{ fontWeight: 600 }}>Aucune pièce dans cette liste.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Pièce</th><th>Catégorie</th><th>Mode</th><th>Prix</th><th>Stock</th><th>Ville</th><th>Statut</th><th>Soumise le</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const st = STATUS_CFG[p.status] || STATUS_CFG.pending;
                return (
                  <tr key={p._id} className={styles.tr}>
                    <td>
                      <div className={styles.vehicleCell}>
                        {p.thumbnail || p.images?.[0] ? <img src={p.thumbnail || p.images[0]} alt="" className={styles.vehThumb} loading="lazy" decoding="async" /> : <div className={styles.vehThumbPlaceholder}>🔩</div>}
                        <div>
                          <strong>{p.title}</strong>
                          <span className={styles.vehMeta}>{[p.brand, p.reference && `réf. ${p.reference}`, PART_CONDITION_LABELS[p.condition]].filter(Boolean).join(" · ")}</span>
                          <span className={styles.vehMeta}>{p.owner?.firstName || ""} {p.owner?.lastName || ""} {p.owner?.email ? `· ${p.owner.email}` : ""}</span>
                        </div>
                      </div>
                    </td>
                    <td><Badge label={PART_CATEGORY_LABELS[p.category] || p.category} color="#0f766e" bg="#ccfbf1" /></td>
                    <td style={{ fontSize: ".85rem" }}>{p.saleMode === "import" ? `🌍 Import (${p.importInfo?.originCountry || "?"}, ${p.importInfo?.leadTimeDays || "?"} j)` : "📦 En stock"}</td>
                    <td className={styles.tdPrice}>{p.price ? fmt(p.price) : "—"}</td>
                    <td style={{ fontSize: ".85rem", color: "#64748b" }}>{p.stock == null ? "sur cde" : p.stock}{p.ventes > 0 ? ` · ${p.ventes} vendue(s)` : ""}</td>
                    <td style={{ fontSize: ".85rem", color: "#64748b" }}>{p.ville || "—"}{p.country ? ` (${p.country})` : ""}</td>
                    <td><Badge label={st.label} color={st.color} bg={st.bg} /></td>
                    <td className={styles.tdDate}>{fmtDate(p.createdAt)}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        {p.status !== "approved" && <button className={styles.btnApprove} disabled={busy === p._id} onClick={() => decide(p._id, "approved")}>✅ Publier</button>}
                        {p.status !== "rejected" && <button className={styles.btnReject} disabled={busy === p._id} onClick={() => { setRejectModal({ id: p._id, title: p.title }); setRejectReason(""); }}>✕ Rejeter</button>}
                        {p.status === "approved" && <button className={styles.btnGhost} disabled={busy === p._id} onClick={() => decide(p._id, "archived")}>📦 Archiver</button>}
                        {p.rejectionReason && <span style={{ fontSize: ".75rem", color: "#dc2626" }}>Motif : {p.rejectionReason}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejectModal && (
        <div className={styles.overlay} onClick={() => setRejectModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Rejeter « {rejectModal.title} »</h3>
            <p style={{ fontSize: ".85rem", color: "#64748b" }}>Le motif est transmis au partenaire.</p>
            <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Motif du rejet (photos, prix, référence…)"
              style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button className={styles.btnGhost} onClick={() => setRejectModal(null)}>Annuler</button>
              <button className={styles.btnReject} onClick={async () => { await decide(rejectModal.id, "rejected", rejectReason.trim() || undefined); setRejectModal(null); }}>Confirmer le rejet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
