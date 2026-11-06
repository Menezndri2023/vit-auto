import { MaintenanceSection } from "./MaintenanceSection.jsx";
import styles from "../../AdminPanel.module.css";
import { Plug, Stethoscope } from "lucide-react";

// Onglet « Santé système » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function SanteSystemeSection({
  headers, loadSystemHealth, systemHealth, systemHealthLoading,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h2 className={styles.uiTitre}><Stethoscope size={16} aria-hidden="true" /> Santé système</h2>
        <button className={styles.btnRefresh} onClick={loadSystemHealth}>↻ Actualiser</button>
      </div>

      {systemHealthLoading ? (
        <p style={{ color: "#64748b" }}>Chargement…</p>
      ) : !systemHealth ? (
        <p style={{ color: "#64748b" }}>Impossible de joindre /api/health.</p>
      ) : (
        <>
          <p style={{ color: "#64748b", fontSize: ".85rem", marginBottom: 16 }}>
            Statut global : <strong style={{ color: systemHealth.status === "healthy" ? "#059669" : "#dc2626" }}>{systemHealth.status}</strong>
            {" · "}Uptime : {Math.floor((systemHealth.uptime || 0) / 3600)}h{Math.floor(((systemHealth.uptime || 0) % 3600) / 60)}min
            {systemHealth.memory && ` · Mémoire : ${systemHealth.memory.used} / ${systemHealth.memory.total}`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {Object.entries(systemHealth.services || {}).map(([name, value]) => {
              const ok = ["connected", "ready", "resend", "smtp", "configured", true].includes(value);
              const neutral = ["disabled", "sync-mode"].includes(value);
              const color = ok ? "#059669" : neutral ? "#94a3b8" : "#dc2626";
              const bg = ok ? "#f0fdf4" : neutral ? "#f8fafc" : "#fef2f2";
              return (
                <div key={name} className={styles.chartCard} style={{ background: bg, borderColor: color }}>
                  <div style={{ fontSize: ".72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>{name}</div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color }}>{String(value)}</div>
                </div>
              );
            })}
          </div>
          {systemHealth.integrations && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0f1b3f", margin: "0 0 4px" }}><Plug size={16} aria-hidden="true" /> Intégrations configurées en production</h3>
              <p style={{ margin: "0 0 .75rem", fontSize: ".8rem", color: "#64748b" }}>Seuls les noms des variables manquantes sont affichés, jamais leurs valeurs. À compléter dans les variables d'environnement Render.</p>
              <div style={{ overflowX: "auto" }}>
                <table className={styles.table} style={{ width: "100%", fontSize: ".82rem" }}>
                  <thead><tr><th>Intégration</th><th>État</th><th>Variables manquantes</th></tr></thead>
                  <tbody>
                    {Object.entries(systemHealth.integrations).map(([nom, { etat, manquantes }]) => (
                      <tr key={nom}>
                        <td>{nom}</td>
                        <td style={{ fontWeight: 700, color: etat === "configuré" ? "#059669" : etat === "incomplet" ? "#d97706" : "#94a3b8" }}>{etat}</td>
                        <td style={{ fontFamily: "monospace", fontSize: ".75rem", overflowWrap: "anywhere" }}>{manquantes.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <MaintenanceSection headers={headers} />
    </div>
  );
}
