import { ReclamationsIESection } from "./ReclamationsIESection.jsx";
import { StatCard, fmtDate } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Litiges » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function LitigesSection({
  bookings, fmtUSD, headers, loadAll, setDisputeModal, setDisputeNote,
  setDisputeResol,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>⚖️ Gestion des litiges</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Toutes les commandes en dispute requérant une décision administrative.</p>
        </div>
        <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
      </div>

      {/* Réclamations Import/Export (2026-10-31) — modèle Litige, statut des transactions inchangé. */}
      <ReclamationsIESection headers={headers} />

      {/* KPIs litiges */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { icon: "⚖️", label: "Litiges ouverts",  value: bookings.filter(b => b.status === "disputed").length, color: "#dc2626" },
          { icon: "✅", label: "Résolus ce mois",   value: bookings.filter(b => {
            const d = b.disputeResolution?.resolvedAt;
            if (!d) return false;
            const now = new Date(); const rd = new Date(d);
            return rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear();
          }).length, color: "#10b981" },
          { icon: "💰", label: "Montant en jeu",    value: fmtUSD(bookings.filter(b=>b.status==="disputed").reduce((s,b)=>s+(b.montantTotal||0),0)), color: "#f59e0b" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      {/* Tendance (8 dernières semaines) — calculée côté client sur les
          `bookings` déjà chargés, sans nouvel endpoint : compte les
          litiges OUVERTS par semaine (clientValidation.disputedAt), pas
          seulement ceux encore ouverts aujourd'hui. */}
      {(() => {
        const weeks = Array.from({ length: 8 }, (_, i) => {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          start.setDate(start.getDate() - start.getDay() - (7 - i) * 7);
          const end = new Date(start); end.setDate(end.getDate() + 7);
          return { start, end, count: 0 };
        });
        for (const b of bookings) {
          const d = b.clientValidation?.disputedAt;
          if (!d) continue;
          const dd = new Date(d);
          const w = weeks.find((w) => dd >= w.start && dd < w.end);
          if (w) w.count++;
        }
        const hasAny = weeks.some((w) => w.count > 0);
        if (!hasAny) return null;
        const maxCount = Math.max(...weeks.map((w) => w.count), 1);
        return (
          <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#64748b", marginBottom: 10 }}>Litiges ouverts par semaine (8 dernières semaines)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
              {weeks.map((w, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: ".68rem", color: "#64748b", fontWeight: 700 }}>{w.count || ""}</span>
                  <div style={{ width: "100%", height: Math.max(3, Math.round((w.count / maxCount) * 50)), background: w.count > 0 ? "linear-gradient(180deg,#f87171,#dc2626)" : "#e2e8f0", borderRadius: "4px 4px 0 0" }} />
                  <span style={{ fontSize: ".62rem", color: "#94a3b8" }}>{w.start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {bookings.filter(b => b.status === "disputed").length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>⚖️</div>
          <p style={{ fontWeight: 700, color: "#64748b" }}>Aucun litige en cours.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Référence</th><th>Client</th><th>Véhicule / Service</th><th>Raison du litige</th><th>Montant</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {bookings.filter(b => b.status === "disputed").map((b) => {
                const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
                const vName = b.vehicle ? [b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur` : "—");
                return (
                  <tr key={b._id} className={styles.tr} style={{ background: "#fff5f5" }}>
                    <td><strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference||b._id?.slice(-6)}</strong></td>
                    <td><div><strong style={{ fontSize:"0.82rem" }}>{clientName||"—"}</strong><span className={styles.vehMeta}>{b.clientInfo?.email}</span></div></td>
                    <td style={{ fontSize:"0.82rem" }}>{vName}</td>
                    <td style={{ fontSize:"0.8rem", color:"#dc2626", maxWidth:200 }}>{b.clientValidation?.disputeReason||"Non précisée"}</td>
                    <td className={styles.tdPrice}>{b.montantTotal>0?fmtUSD(b.montantTotal):"—"}</td>
                    <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                    <td>
                      <button style={{ padding:"5px 12px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                        onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}>
                        ⚖️ Résoudre
                      </button>
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
