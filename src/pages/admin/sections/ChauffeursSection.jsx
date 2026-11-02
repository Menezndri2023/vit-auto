import { Badge, StatCard, fmtDate } from "../shared.jsx";
import { CatalogueSection } from "./CatalogueSection.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Chauffeurs » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ChauffeursSection({
  activeDrivers, bookings, deactivateActiveDriver, driverRejectModal, driverRejectReason, fmtUSD,
  loadAll, pendingDrivers, pendingDriversList, setConfirm, setDriverRejectModal, setDriverRejectReason,
  updateDriverStatus,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>👨‍✈️ Gestion des chauffeurs</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Validez les dossiers, gérez les chauffeurs actifs et leurs missions.</p>
        </div>
        <button className={styles.btnRefresh} style={{ background: "#f1f5f9", color: "#0f1b3f", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px" }} onClick={loadAll}>↻ Actualiser</button>
      </div>

      {/* KPIs chauffeurs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { icon:"👨‍✈️", label:"En attente validation", value: pendingDrivers,                                                  color:"#f59e0b" },
          { icon:"✅",   label:"Chauffeurs actifs",      value: activeDrivers.length,       color:"#10b981" },
          { icon:"🚗",   label:"Missions terminées",     value: bookings.filter(b=>b.type==="chauffeur"&&b.status==="completed").length, color:"#3b82f6" },
          { icon:"💰",   label:"Revenue chauffeurs",     value: fmtUSD(bookings.filter(b=>b.type==="chauffeur"&&b.status==="completed").reduce((s,b)=>s+(b.montantTotal||0),0)), color:"#6366f1" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      {/* Dossiers en attente */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartTitle}>⏳ Dossiers en attente de validation ({pendingDrivers})</h3>
        {pendingDrivers === 0 ? (
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Aucun profil chauffeur en attente.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Chauffeur</th><th>Disponibilité</th><th>Tarif</th><th>Zone</th><th>Documents</th><th>Soumis le</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pendingDriversList.map((d) => (
                  <tr key={d._id} className={styles.tr}>
                    <td>
                      <div className={styles.vehicleCell}>
                        {d.profilePhoto || d.images?.[0] ? <img src={d.profilePhoto || d.images[0]} alt="" className={styles.vehThumb} loading="lazy" decoding="async" style={{ borderRadius:"50%" }} /> : <div className={styles.vehThumbPlaceholder}>👤</div>}
                        <div>
                          <strong>{d.firstName} {d.lastName}</strong>
                          <span className={styles.vehMeta}>{d.title}</span>
                        </div>
                      </div>
                    </td>
                    <td><Badge label={d.disponibilite||"—"} color="#8b5cf6" bg="#f5f3ff" /></td>
                    <td className={styles.tdPrice}>{d.tarif?`${fmtUSD(d.tarif)}/j`:"—"}</td>
                    <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.zone||d.ville||"—"}</td>
                    <td>
                      {/* Restructuration réservation 2026-09 : documents joints
                          directement à la création du profil (voir driverController.
                          processDriverDocuments), à vérifier ici avant validation —
                          remplace l'ancien circuit KYC bloquant séparé. */}
                      <div style={{ display:"flex", gap:4 }}>
                        {d.identityDocument?.frontImage
                          ? <a href={d.identityDocument.frontImage} target="_blank" rel="noopener noreferrer" title="Pièce d'identité"><img src={d.identityDocument.frontImage} alt="Identité" style={{ width:32, height:32, objectFit:"cover", borderRadius:6, border:"1px solid #e2e8f0" }} /></a>
                          : <span style={{ fontSize:"0.75rem", color:"#dc2626" }}>Identité ✕</span>}
                        {d.licenseDocument?.frontImage
                          ? <a href={d.licenseDocument.frontImage} target="_blank" rel="noopener noreferrer" title="Permis de conduire"><img src={d.licenseDocument.frontImage} alt="Permis" style={{ width:32, height:32, objectFit:"cover", borderRadius:6, border:"1px solid #e2e8f0" }} /></a>
                          : <span style={{ fontSize:"0.75rem", color:"#dc2626" }}>Permis ✕</span>}
                      </div>
                    </td>
                    <td className={styles.tdDate}>{fmtDate(d.createdAt)}</td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button className={styles.btnApprove} onClick={() => setConfirm({ message:`Approuver ${d.firstName} ${d.lastName} ?`, action:()=>updateDriverStatus(d._id,"approved") })}>✅ Valider</button>
                        <button className={styles.btnReject} onClick={() => { setDriverRejectModal({ id:d._id, name:`${d.firstName} ${d.lastName}` }); setDriverRejectReason(""); }}>✕ Rejeter</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chauffeurs actifs — profils Driver approuvés (catalogue public "Chauffeur"),
          pas des comptes User : un chauffeur est une fiche de service publiée par
          un partenaire (owner), jamais un rôle de compte autonome (voir Register.jsx,
          qui ne propose que client/partenaire à l'inscription). */}
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>✅ Chauffeurs actifs ({activeDrivers.length})</h3>
        {activeDrivers.length === 0 ? (
          <p style={{ color:"#64748b", fontSize:"0.9rem" }}>Aucun chauffeur actif dans le catalogue.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Chauffeur</th><th>Partenaire</th><th>Zone</th><th>Tarif</th><th>Note</th><th>Actions</th></tr></thead>
              <tbody>
                {activeDrivers.map(d => (
                  <tr key={d._id} className={styles.tr}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>{d.firstName?.[0]?.toUpperCase()||"?"}</div>
                        <strong>{d.firstName} {d.lastName}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.owner?.firstName||"—"} {d.owner?.phone ? `· ${d.owner.phone}` : ""}</td>
                    <td style={{ fontSize:"0.85rem", color:"#64748b" }}>{d.zone||"—"}</td>
                    <td className={styles.tdPrice}>{d.tarif?`${fmtUSD(d.tarif)}/j`:"—"}</td>
                    <td>{d.noteMoyenne > 0 ? `⭐ ${d.noteMoyenne.toFixed(1)}` : "—"}</td>
                    <td>
                      <button className={styles.btnReject}
                        onClick={() => setConfirm({ message:`Retirer ${d.firstName} ${d.lastName} du catalogue ?`, action:()=>deactivateActiveDriver(d._id) })}>
                        🚫 Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bug réel : le bouton « ✕ Rejeter » de cet onglet ouvrait une modale
          qui n'existait QUE dans CatalogueSection (onglet Annonces) — donc
          jamais rendue ici. Le clic ne produisait rien, et la modale
          resurgissait plus tard en changeant d'onglet, avec le mauvais
          chauffeur. La voici, dans la portée où le bouton vit réellement. */}
      {driverRejectModal && (
        <div className={styles.overlay} onClick={() => { setDriverRejectModal(null); setDriverRejectReason(""); }}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg}>Raison du refus pour « {driverRejectModal.name} »</p>
            <textarea className={styles.textarea} rows={3} value={driverRejectReason}
              onChange={(e) => setDriverRejectReason(e.target.value)}
              placeholder="Motif communiqué au partenaire (documents illisibles, permis expiré…)" />
            <div className={styles.confirmActions}>
              <button className={styles.btnDanger}
                onClick={async () => {
                  await updateDriverStatus(driverRejectModal.id, "rejected", driverRejectReason);
                  setDriverRejectModal(null); setDriverRejectReason("");
                }}>Refuser</button>
              <button className={styles.btnGhost} onClick={() => { setDriverRejectModal(null); setDriverRejectReason(""); }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
