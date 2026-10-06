// Veille de maintenance (2026-10-05) — affichée dans l'onglet « Santé système ».
// Autonome, même contrat que PartsSection : charge ses données elle-même.
// Source : GET /api/admin/maintenance (server/utils/maintenanceWatchdog.js) et
// GET /api/admin/maintenance/refus-publication — les publications qu'une garde
// serveur a refusées, auparavant introuvables (aucune trace nulle part).
import { useCallback, useEffect, useState } from "react";
import styles from "../../AdminPanel.module.css";
import { fmtDate } from "../shared.jsx";

const NIVEAU = {
  ok:        { label: "OK",        color: "#10b981", bg: "#ecfdf5" },
  attention: { label: "Attention", color: "#d97706", bg: "#fffbeb" },
  critique:  { label: "Critique",  color: "#dc2626", bg: "#fef2f2" },
};

export function MaintenanceSection({ headers }) {
  const [checks, setChecks] = useState(null);
  const [refus, setRefus] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/maintenance", { headers }),
        fetch("/api/admin/maintenance/refus-publication", { headers }),
      ]);
      const d1 = await r1.json().catch(() => ({}));
      const d2 = await r2.json().catch(() => ({}));
      if (!r1.ok) throw new Error(d1.message || `HTTP ${r1.status}`);
      setChecks(d1.checks || []);
      setRefus(r2.ok ? d2.refus || [] : []);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const nonOk = (checks || []).filter((c) => c.niveau !== "ok").length;

  return (
    <div style={{ marginTop: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f1b3f", margin: 0 }}>🛎️ Veille de maintenance</h3>
          <p style={{ margin: 0, fontSize: ".8rem", color: "#64748b" }}>
            Ce qui se dégrade sans erreur visible : dossiers et annonces qui attendent, publications refusées, lecture des pièces d'identité.
            Les points non verts figurent aussi dans le digest quotidien.
          </p>
        </div>
        <button className={styles.btnRefresh} onClick={load}>↻ Actualiser</button>
      </div>

      {loading && <p style={{ color: "#64748b" }}>Vérifications en cours…</p>}
      {error && <p style={{ color: "#dc2626" }}>Vérifications indisponibles : {error}</p>}

      {checks && !loading && (
        <>
          <p style={{ fontWeight: 700, color: nonOk ? "#d97706" : "#10b981", margin: "0 0 .75rem" }}>
            {nonOk ? `${nonOk} point(s) demandent une action.` : "Rien à signaler."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checks.map((c) => {
              const n = NIVEAU[c.niveau] || NIVEAU.ok;
              return (
                <div key={c.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: n.bg, border: `1.5px solid ${n.color}33`, borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ flex: "0 0 auto", fontSize: ".72rem", fontWeight: 800, color: n.color, textTransform: "uppercase", minWidth: 72 }}>{n.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#0f1b3f", fontSize: ".9rem" }}>{c.titre} — <span style={{ color: n.color }}>{String(c.valeur)}</span></div>
                    {c.detail && <div style={{ fontSize: ".8rem", color: "#4a5876", marginTop: 2, overflowWrap: "anywhere" }}>{c.detail}</div>}
                  </div>
                  {c.niveau !== "ok" && c.lien && (
                    <a href={c.lien} style={{ flex: "0 0 auto", fontSize: ".8rem", fontWeight: 700, color: "#ff4d2d", whiteSpace: "nowrap" }}>Traiter →</a>
                  )}
                </div>
              );
            })}
          </div>

          <h4 style={{ fontSize: ".92rem", fontWeight: 700, color: "#0f1b3f", margin: "1.5rem 0 .5rem" }}>
            Publications refusées — 7 derniers jours ({refus.length})
          </h4>
          {refus.length === 0 ? (
            <p style={{ fontSize: ".85rem", color: "#64748b", margin: 0 }}>Aucune tentative de publication refusée.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table} style={{ width: "100%", fontSize: ".82rem" }}>
                <thead><tr><th>Date</th><th>Partenaire</th><th>Annonce</th><th>Motif du refus</th></tr></thead>
                <tbody>
                  {refus.map((r) => {
                    const u = r.userId || {};
                    return (
                      <tr key={r._id}>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td>
                        <td>
                          {`${u.firstName || ""} ${u.lastName || ""}`.trim() || r.userEmail || "—"}
                          <div style={{ color: "#64748b", fontSize: ".75rem" }}>{[r.userEmail, u.phone, u.country].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td>{r.resource}{r.changes?.after?.titre ? ` — ${r.changes.after.titre}` : ""}</td>
                        <td>{r.errorMessage || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
