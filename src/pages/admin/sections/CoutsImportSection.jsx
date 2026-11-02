import { Badge } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Coûts Import » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function CoutsImportSection({
  costConfigs, deleteCostConfig, deleteLaneRate, importCostLoading, laneRates, loadImportCostData,
  setCostConfigForm, setLaneForm,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🧮 Coûts Import — Barèmes</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Configure le moteur de calcul du coût total d'importation (devis instantané côté acheteur). Montants en USD.</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadImportCostData}>↻ Actualiser</button>
      </div>

      {/* ── Barèmes pays de destination ── */}
      <div className={styles.chartCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}>🌍 Barèmes par pays de destination</h3>
          <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
            onClick={() => setCostConfigForm({
              country: "", customsDutyPercent: 20, vatPercent: 18, transitFixedFeeUSD: 150,
              redevancesFixedFeeUSD: 100, portFeesFixedUSD: 300, deliveryFixedFeeUSD: 200,
              insurancePercent: 1, defaultSeaFreightUSD: 1200,
              ageSurchargeThresholdYears: 8, ageSurchargePercent: 0, active: true,
            })}>+ Nouveau barème</button>
        </div>
        {importCostLoading ? (
          <div className={styles.loadingBox} style={{ minHeight: 80 }}><div className={styles.spinner} /></div>
        ) : costConfigs.length === 0 ? (
          <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucun barème configuré — le calculateur acheteur reste indisponible tant qu'aucun pays n'est configuré.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Pays</th><th>Douane</th><th>TVA</th><th>Transit</th><th>Redevances</th><th>Port</th><th>Livraison</th><th>Assurance</th><th>Fret défaut</th><th>Statut</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {costConfigs.map((c) => (
                  <tr key={c._id} className={styles.tr}>
                    <td style={{ fontWeight: 700 }}>{c.country}</td>
                    <td>{c.customsDutyPercent}%</td>
                    <td>{c.vatPercent}%</td>
                    <td>${c.transitFixedFeeUSD}</td>
                    <td>${c.redevancesFixedFeeUSD}</td>
                    <td>${c.portFeesFixedUSD}</td>
                    <td>${c.deliveryFixedFeeUSD}</td>
                    <td>{c.insurancePercent}%</td>
                    <td>${c.defaultSeaFreightUSD}</td>
                    <td><Badge label={c.active ? "Actif" : "Inactif"} color={c.active ? "#10b981" : "#94a3b8"} bg={c.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setCostConfigForm(c)}>✏️</button>
                        <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteCostConfig(c._id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Liaisons de fret ── */}
      <div className={styles.chartCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}>🚢 Liaisons de fret (origine → destination)</h3>
          <button className={styles.btnApprove} style={{ fontSize: ".8rem" }}
            onClick={() => setLaneForm({ sourceCountry: "", destCountry: "", seaFreightUSD: "", inlandTransportUSD: 150, carrier: "", estimatedDelayDays: "" })}>
            + Nouvelle liaison</button>
        </div>
        {laneRates.length === 0 ? (
          <p style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0" }}>Aucune liaison configurée — le fret retombe sur l'estimation générique du pays de destination.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Origine</th><th>Destination</th><th>Fret maritime</th><th>Transport intérieur</th><th>Compagnie</th><th>Délai</th><th>Statut</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {laneRates.map((l) => (
                  <tr key={l._id} className={styles.tr}>
                    <td>{l.sourceCountry}</td>
                    <td>{l.destCountry}</td>
                    <td>${l.seaFreightUSD}</td>
                    <td>${l.inlandTransportUSD}</td>
                    <td>{l.carrier || "—"}</td>
                    <td>{l.estimatedDelayDays ? `${l.estimatedDelayDays} j` : "—"}</td>
                    <td><Badge label={l.active ? "Actif" : "Inactif"} color={l.active ? "#10b981" : "#94a3b8"} bg={l.active ? "#ecfdf5" : "#f1f5f9"} /></td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.btnGhost} style={{ fontSize: ".75rem" }} onClick={() => setLaneForm(l)}>✏️</button>
                        <button className={styles.btnDeleteSm} style={{ fontSize: ".75rem" }} onClick={() => deleteLaneRate(l._id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
