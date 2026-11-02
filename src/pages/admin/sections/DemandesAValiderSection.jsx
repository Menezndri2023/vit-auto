import styles from "../../AdminPanel.module.css";
import { timeAgo } from "../shared.jsx";

// Onglet « Demandes à valider » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function DemandesAValiderSection({
  adminValidateBookingReq, adminValidateDirectReq, loadPendingValidation, pendingValidationBookings, pendingValidationDirect, pendingValidationLoading,
  setDocsModal, setValidationRejectModal, setValidationRejectReason,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🕐 Demandes à valider</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>
            Aucune réservation, demande d'essai ou achat direct n'atteint le partenaire tant qu'elle n'est pas approuvée ici.
          </p>
        </div>
        <button style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: ".8rem" }}
          onClick={loadPendingValidation}>↻ Actualiser</button>
      </div>

      <h3 style={{ fontSize: ".9rem", color: "#0f1b3f", margin: "0 0 10px" }}>📋 Réservations / essais ({pendingValidationBookings.length})</h3>
      {pendingValidationLoading && pendingValidationBookings.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Chargement…</p>
      ) : pendingValidationBookings.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: ".85rem", marginBottom: 24 }}>Aucune demande en attente.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {pendingValidationBookings.map((b) => {
            const itemLabel = b.vehicle?.title || (b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : b.activity?.title) || "—";
            return (
              <div key={b._id} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 14, background: b.adminValidation?.fastTrack ? "#fff7ed" : "#fff", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0f1b3f" }}>
                    {b.adminValidation?.fastTrack && <span style={{ color: "#d97706" }}>⚡ Instantanée — </span>}
                    {b.reference} · {b.type}
                  </div>
                  <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>
                    {b.clientInfo?.firstName} {b.clientInfo?.lastName} → {itemLabel}
                  </div>
                  <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 2 }}>
                    {(b.montantTotal || 0).toLocaleString("fr-FR")} $ · {timeAgo(b.createdAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {/* Les documents client (pièce d'identité, permis) sont
                      joints à la réservation : c'est ICI, au moment de la
                      décision d'approbation, que l'admin en a le plus
                      besoin — ils n'étaient consultables que depuis
                      l'onglet Réservations, une fois la décision prise. */}
                  <button onClick={() => setDocsModal({ booking: b })} title="Documents client joints à la réservation"
                    style={{ background: "#eff6ff", color: "#1d4ed8", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                    📄 Documents
                  </button>
                  <button onClick={() => adminValidateBookingReq(b._id, "approved")}
                    style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                    ✅ Approuver
                  </button>
                  <button onClick={() => { setValidationRejectModal({ kind: "booking", item: b }); setValidationRejectReason(""); }}
                    style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                    ❌ Refuser
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ fontSize: ".9rem", color: "#0f1b3f", margin: "0 0 10px" }}>🌍 Achats directs Import/Export ({pendingValidationDirect.length})</h3>
      {pendingValidationDirect.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Aucun achat direct en attente.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pendingValidationDirect.map((tx) => (
            <div key={tx._id} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#fff", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0f1b3f" }}>{tx.listing?.title || "Annonce"}</div>
                <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 2 }}>
                  {tx.client?.firstName} {tx.client?.lastName} → {tx.partner?.firstName} {tx.partner?.lastName}
                </div>
                <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 2 }}>
                  {(tx.finalOffer?.totalAmount || 0).toLocaleString("fr-FR")} {tx.finalOffer?.currency || ""} · {timeAgo(tx.createdAt)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => adminValidateDirectReq(tx._id, "approved")}
                  style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                  ✅ Approuver
                </button>
                <button onClick={() => { setValidationRejectModal({ kind: "direct", item: tx }); setValidationRejectReason(""); }}
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                  ❌ Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
