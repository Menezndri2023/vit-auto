import { Star } from "lucide-react";
import styles from "../../AdminPanel.module.css";

// Onglet « Avis clients » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function AvisSection({
  loadReviews, platformReviewStats, reviewActioning, reviewsFilter, reviewsList, reviewsLoading,
  reviewsTargetType, setReviewsFilter, setReviewsTargetType, toggleReviewVisibility,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <h2 className={styles.uiTitre}><Star size={16} aria-hidden="true" /> Avis clients — modération</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={reviewsTargetType} onChange={(e) => setReviewsTargetType(e.target.value)} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
            <option value="">Toutes les cibles</option>
            <option value="vehicle">Véhicule</option>
            <option value="driver">Chauffeur</option>
            <option value="partner">Agence</option>
            <option value="platform">Plateforme (VIT AUTO)</option>
            <option value="client">Client (fiabilité)</option>
          </select>
          <select value={reviewsFilter} onChange={(e) => setReviewsFilter(e.target.value)} style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: ".85rem" }}>
            <option value="">Tous les avis</option>
            <option value="true">Visibles</option>
            <option value="false">Masqués</option>
          </select>
          <button className={styles.btnRefresh} onClick={loadReviews}>↻ Actualiser</button>
        </div>
      </div>

      {reviewsTargetType === "platform" && platformReviewStats && (
        <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <div className={styles.chartCard} style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: ".78rem", color: "#64748b", fontWeight: 700 }}>NOTE MOYENNE</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0f1b3f" }}>★ {platformReviewStats.noteMoyenne}</div>
          </div>
          <div className={styles.chartCard} style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: ".78rem", color: "#64748b", fontWeight: 700 }}>TRANSACTIONS BIEN DÉROULÉES</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: platformReviewStats.wentWellRate >= 80 ? "#059669" : platformReviewStats.wentWellRate >= 50 ? "#d97706" : "#dc2626" }}>
              {platformReviewStats.wentWellRate != null ? `${platformReviewStats.wentWellRate}%` : "—"}
            </div>
          </div>
          <div className={styles.chartCard} style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: ".78rem", color: "#64748b", fontWeight: 700 }}>TOTAL AVIS</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0f1b3f" }}>{platformReviewStats.total}</div>
          </div>
        </div>
      )}

      {reviewsLoading ? (
        <p style={{ color: "#64748b" }}>Chargement…</p>
      ) : reviewsList.length === 0 ? (
        <p style={{ color: "#64748b" }}>Aucun avis.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reviewsList.map((r) => (
            <div key={r._id} className={styles.chartCard} style={{ opacity: r.visible ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{"".repeat(r.note)}</strong>{" "}
                  <span style={{ color: "#64748b", fontSize: ".85rem" }}>
                    — {r.targetType === "platform" ? "Plateforme VIT AUTO" : r.targetLabel || (r.targetType === "vehicle" ? "Véhicule" : r.targetType === "driver" ? "Chauffeur" : r.targetType === "partner" ? "Agence" : "Client")} · par {r.reviewer?.firstName} {r.reviewer?.lastName}
                  </span>
                  {r.targetType === "platform" && r.wentWell != null && (
                    <span style={{ marginLeft: 8, fontSize: ".78rem", fontWeight: 700, color: r.wentWell ? "#059669" : "#dc2626" }}>
                      {r.wentWell ? "Bien déroulée" : "Mal déroulée"}
                    </span>
                  )}
                  {!r.visible && <span style={{ marginLeft: 8, fontSize: ".72rem", color: "#ef4444", fontWeight: 700 }}>MASQUÉ</span>}
                  {r.commentaire && <p style={{ margin: "6px 0 0", fontSize: ".88rem", color: "#374151" }}>{r.commentaire}</p>}
                </div>
                <button
                  className={r.visible ? styles.btnDanger : styles.btnPrimary}
                  disabled={reviewActioning === r._id}
                  onClick={() => toggleReviewVisibility(r)}
                >
                  {r.visible ? "Masquer" : "↺ Réafficher"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
