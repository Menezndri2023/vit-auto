import { ACTIVITY_TYPE_LABELS } from "../../../constants/activityTypes";
import { Badge, StatCard, fmtDate } from "../shared.jsx";
import { CatalogueSection } from "./CatalogueSection.jsx";
import styles from "../../AdminPanel.module.css";
import { Ban, Banknote, CalendarDays, CheckCircle2, Hourglass, Sailboat, Shuffle } from "lucide-react";

// Onglet « Activités et Loisirs » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ActivitesSection({
  COUNTRIES_CONFIG, activeActivities, activityRejectModal, activityRejectReason, activityTransferForm, activityTransferModal,
  activityTransferSaving, bookings, deactivateActiveActivity, fmtUSD, handleRejectActivity, loadAll,
  openActivityTransfer, pendingActivities, pendingActivitiesList, searchActivityTransferOwners, setActivityRejectModal, setActivityRejectReason,
  setActivityTransferForm, setActivityTransferModal, setConfirm, submitActivityTransfer, updateActivityStatus,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <div>
          <h2 className={styles.uiTitreSection}><Sailboat size={16} aria-hidden="true" /> Activités et Loisirs</h2>
          <p className={styles.uiSousTitre}>Validez les annonces (Quad, Surf, Montgolfière, Jetski, Jet privé, Bateau...) et gérez les activités actives.</p>
        </div>
        <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { icon:<Sailboat size={16} aria-hidden="true" />, label:"En attente validation", value: pendingActivities,                                                        color:"#f59e0b" },
          { icon:<CheckCircle2 size={16} aria-hidden="true" />, label:"Activités actives",      value: activeActivities.length,     color:"#10b981" },
          { icon:<CalendarDays size={16} aria-hidden="true" />, label:"Réservations terminées", value: bookings.filter(b=>b.type==="activite"&&b.status==="completed").length, color:"#3b82f6" },
          { icon:<Banknote size={16} aria-hidden="true" />, label:"Revenue activités",      value: fmtUSD(bookings.filter(b=>b.type==="activite"&&b.status==="completed").reduce((s,b)=>s+(b.montantTotal||0),0)), color:"#6366f1" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartTitle}><Hourglass size={16} aria-hidden="true" /> Annonces en attente de validation ({pendingActivities})</h3>
        {pendingActivities === 0 ? (
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucune activité en attente.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Activité</th><th>Type</th><th>Prix</th><th>Ville</th><th>Soumis le</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pendingActivitiesList.map((a) => (
                  <tr key={a._id} className={styles.tr}>
                    <td>
                      <div className={styles.vehicleCell}>
                        {a.thumbnail || a.images?.[0] ? <img src={a.thumbnail || a.images[0]} alt="" className={styles.vehThumb} loading="lazy" decoding="async" /> : <div className={styles.vehThumbPlaceholder}><Sailboat size={16} aria-hidden="true" /></div>}
                        <div>
                          <strong>{a.title}</strong>
                          <span className={styles.vehMeta}>{a.owner?.firstName || ""} {a.owner?.lastName || ""}</span>
                        </div>
                      </div>
                    </td>
                    <td><Badge label={ACTIVITY_TYPE_LABELS[a.activityType] || a.activityType} color="#8b5cf6" bg="#f5f3ff" /></td>
                    <td className={styles.tdPrice}>{a.price ? `${fmtUSD(a.price)}${a.priceUnit === "per_session" ? "/sortie" : "/pers."}` : "—"}</td>
                    <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{a.ville || "—"}</td>
                    <td className={styles.tdDate}>{fmtDate(a.createdAt)}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.btnApprove} onClick={() => setConfirm({ message:`Approuver "${a.title}" ?`, action:()=>updateActivityStatus(a._id,"approved") })}><CheckCircle2 size={16} aria-hidden="true" /> Valider</button>
                        <button className={styles.btnReject} onClick={() => { setActivityRejectModal({ id:a._id, name:a.title }); setActivityRejectReason(""); }}>✕ Rejeter</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}><CheckCircle2 size={16} aria-hidden="true" /> Activités actives ({activeActivities.length})</h3>
        {activeActivities.length === 0 ? (
          <p style={{ color:"#64748b", fontSize:"0.9rem" }}>Aucune activité active dans le catalogue.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Activité</th><th>Partenaire</th><th>Type</th><th>Prix</th><th>Note</th><th>Actions</th></tr></thead>
              <tbody>
                {activeActivities.map(a => (
                  <tr key={a._id} className={styles.tr}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>{a.title?.[0]?.toUpperCase()||"?"}</div>
                        <strong>{a.title}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{a.owner?.firstName||"—"} {a.owner?.phone ? `· ${a.owner.phone}` : ""}</td>
                    <td><Badge label={ACTIVITY_TYPE_LABELS[a.activityType] || a.activityType} color="#8b5cf6" bg="#f5f3ff" /></td>
                    <td className={styles.tdPrice}>{a.price ? `${fmtUSD(a.price)}${a.priceUnit === "per_session" ? "/sortie" : "/pers."}` : "—"}</td>
                    <td>{a.noteMoyenne > 0 ? `${a.noteMoyenne.toFixed(1)}` : "—"}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.btnGhost} title="Transférer vers un autre compte/entreprise/pays/ville"
                          onClick={() => openActivityTransfer(a._id, a.title, a.country, a.ville)}>
                          <Shuffle size={16} aria-hidden="true" /> Transférer
                        </button>
                        <button className={styles.btnReject}
                          onClick={() => setConfirm({ message:`Retirer "${a.title}" du catalogue ?`, action:()=>deactivateActiveActivity(a._id) })}>
                          <Ban size={16} aria-hidden="true" /> Retirer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activityRejectModal && (
        <div className={styles.overlay} onClick={() => setActivityRejectModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du refus pour « {activityRejectModal.name} »</p>
            <textarea style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0", padding: ".6rem", fontSize: ".9rem", marginBottom: ".75rem", resize: "vertical" }}
              rows={3} placeholder="Ex: Photos insuffisantes…"
              value={activityRejectReason} onChange={(e) => setActivityRejectReason(e.target.value)} />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger} onClick={() => handleRejectActivity(activityRejectModal.id, activityRejectReason)}>Refuser</button>
              <button className={styles.btnGhost} onClick={() => setActivityRejectModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL TRANSFERT (activité) — même outil que CatalogueSection.transferModal ══ */}
      {activityTransferModal && (
        <div className={styles.overlay} onClick={() => setActivityTransferModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()} style={{ width: "min(480px, 92vw)" }}>
            <p className={styles.confirmMsg}><Shuffle size={16} aria-hidden="true" /> Transférer « {activityTransferModal.label} » (activité)</p>

            <div style={{ marginBottom: 12, position: "relative" }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Nouveau propriétaire (nom ou email) — laisser vide pour ne pas changer
              </label>
              <input type="text" value={activityTransferForm.selectedOwner ? `${activityTransferForm.selectedOwner.firstName} ${activityTransferForm.selectedOwner.lastName} (${activityTransferForm.selectedOwner.email})` : activityTransferForm.ownerQuery}
                onChange={(e) => { setActivityTransferForm((p) => ({ ...p, selectedOwner: null })); searchActivityTransferOwners(e.target.value); }}
                placeholder="Ex : Jean Kouassi ou jean@exemple.com"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              {activityTransferForm.ownerResults.length > 0 && !activityTransferForm.selectedOwner && (
                <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: "auto", background: "#fff" }}>
                  {activityTransferForm.ownerResults.map((o) => (
                    <div key={o._id} onClick={() => setActivityTransferForm((p) => ({ ...p, selectedOwner: o, ownerResults: [] }))}
                      style={{ padding: "6px 10px", fontSize: ".82rem", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                      {o.firstName} {o.lastName} — {o.email}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Pays</label>
                <select value={activityTransferForm.country} onChange={(e) => setActivityTransferForm((p) => ({ ...p, country: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem" }}>
                  <option value="">— Ne pas changer —</option>
                  {COUNTRIES_CONFIG.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Ville</label>
                <input type="text" value={activityTransferForm.ville} onChange={(e) => setActivityTransferForm((p) => ({ ...p, ville: e.target.value }))}
                  placeholder="Ne pas changer"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: ".8rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                ID entreprise (PartnerBusiness) — optionnel, avancé
              </label>
              <input type="text" value={activityTransferForm.businessId} onChange={(e) => setActivityTransferForm((p) => ({ ...p, businessId: e.target.value }))}
                placeholder="Laisser vide pour ne pas rattacher"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".88rem", boxSizing: "border-box" }} />
            </div>

            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={submitActivityTransfer} disabled={activityTransferSaving}>{activityTransferSaving ? "…" : "Transférer"}</button>
              <button className={styles.btnGhost} onClick={() => setActivityTransferModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
