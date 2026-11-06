import { Badge, Pagination, STATUS_BK, fmtDate } from "../shared.jsx";
import { ClientDocumentsModal } from "./ClientDocuments.jsx";
import { downloadAuthFile } from "../../../utils/downloadAuthFile";
import styles from "../../AdminPanel.module.css";
import { AlertTriangle, Banknote, BookOpen, CalendarDays, Car, CheckCircle2, FileText, Flag, Handshake, KeyRound, Landmark, MapPin, Receipt, Sailboat, Settings, Trash2, Wrench, Zap, BadgeCheck, Download, Scale } from "lucide-react";

// Onglet « Réservations » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ReservationsSection({
  adminDeleteBooking, adminUpdateBooking, bkPage, bkSearch, bkStatus, bkType,
  bookings, bookingsTotal, exportBookings, filteredBookings, fmtUSD, loadAll,
  loadMoreBookings, paginate, setBkActionModal, setBkCancelReason, setBkCancelReasonCode, setBkPage,
  setBkSearch, setBkStatus, setBkType, setConfirm, setDisputeModal, setDisputeNote,
  setDisputeResol, setDocsModal, setForceAmount, setForceModal, setForceNote, showToast,
  token, totalPages,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:10, marginBottom:16 }}>
        {[
          { l:"Toutes",    v: bookings.length,                                                                              c:"#6366f1", s:"all" },
          { l:"Nouvelles", v: bookings.filter(b=>b.status==="pending").length,                                              c:"#f59e0b", s:"pending" },
          { l:"En cours",  v: bookings.filter(b=>["confirmed","preparing","ready","in_progress","client_arrived"].includes(b.status)).length, c:"#2563eb", s:"confirmed,preparing,ready,in_progress,client_arrived" },
          { l:"À valider", v: bookings.filter(b=>b.status==="waiting_client_validation").length,                            c:"#d97706", s:"waiting_client_validation" },
          { l:"Terminées", v: bookings.filter(b=>b.status==="completed").length,                                            c:"#059669", s:"completed" },
          { l:"Litiges",   v: bookings.filter(b=>b.status==="disputed").length,                                             c:"#dc2626", s:"disputed" },
          { l:"Annulées",  v: bookings.filter(b=>b.status==="cancelled").length,                                            c:"#94a3b8", s:"cancelled" },
        ].map(k => (
          <button key={k.s} onClick={() => { setBkStatus(k.s); setBkPage(1); }}
            style={{ background: bkStatus===k.s?k.c:"#f8fafc", color: bkStatus===k.s?"#fff":k.c, border:`2px solid ${k.c}`, borderRadius:10, padding:"8px 6px", cursor:"pointer", fontWeight:700, fontSize:"0.8rem" }}>
            <div style={{ fontSize:"1.3rem", lineHeight:1.2 }}>{k.v}</div>
            <div style={{ fontSize:"0.7rem", opacity:.85 }}>{k.l}</div>
          </button>
        ))}
      </div>

      <div className={styles.filterBar} style={{ flexWrap:"wrap", gap:8 }}>
        <input type="search" placeholder="Ref., client, email, tel…" value={bkSearch}
          onChange={e => { setBkSearch(e.target.value); setBkPage(1); }}
          style={{ flex:1, minWidth:160, padding:"0.4rem 0.75rem", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:"0.85rem" }} />
        <select className={styles.filterSelect} value={bkType} onChange={e => { setBkType(e.target.value); setBkPage(1); }}>
          <option value="all">Tous types</option>
          <option value="location">Location</option>
          <option value="essai">Essai/Vente</option>
          <option value="chauffeur">Chauffeur</option>
          <option value="leasing">Leasing</option>
          <option value="activite">Loisirs</option>
          <option value="piece">Pièces</option>
        </select>
        <select className={styles.filterSelect} value={bkStatus} onChange={e => { setBkStatus(e.target.value); setBkPage(1); }}>
          <option value="all">Tous statuts</option>
          <option value="pending">Nouvelles</option>
          <option value="confirmed">Acceptées</option>
          <option value="in_progress">En cours</option>
          <option value="waiting_client_validation">À valider</option>
          <option value="completed">Terminées</option>
          <option value="disputed">Litiges</option>
          <option value="cancelled">Annulées</option>
        </select>
        <span className={styles.filterCount}>{filteredBookings.length} résultat{filteredBookings.length!==1?"s":""}</span>
        <button onClick={() => exportBookings("csv")} style={{ padding:"0.4rem 0.9rem", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:"0.8rem", fontWeight:700 }}><Download size={16} aria-hidden="true" /> CSV</button>
        <button onClick={loadAll} className={styles.btnRefresh}>↻</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Référence</th><th>Client / KYC</th><th>Véhicule / Type</th><th>Montant</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {paginate(filteredBookings, bkPage).map((b) => {
              const bs = STATUS_BK[b.status] || STATUS_BK.pending;
              const typeIcons = { location:"", essai:"", chauffeur:"", leasing:<Landmark size={16} aria-hidden="true" /> };
              const vName = b.vehicle ? [b.vehicle.title, b.vehicle.marque, b.vehicle.modele].filter(Boolean).join(" ") : (b.driver ? `Chauffeur: ${b.driver.firstName||""}` : "—");
              const clientName = `${b.clientInfo?.firstName||""} ${b.clientInfo?.lastName||""}`.trim();
              const kycColors = { VERIFIE:"#059669", EN_ATTENTE:"#d97706", REFUSE:"#dc2626", A_REVOIR_MANUELLEMENT:"#2563eb" };
              const kycStatus = b.clientInfo?.kycStatus || b.client?.kycStatus;
              const isDisputed = b.status === "disputed";
              const isActive = !["completed","cancelled","disputed"].includes(b.status);
              return (
                <tr key={b._id} className={styles.tr} style={isDisputed ? { background:"#fff5f5" } : {}}>
                  <td>
                    <div>
                      <strong style={{ fontSize:"0.8rem", fontFamily:"monospace", color:"#6366f1" }}>{b.reference || b._id?.slice(-6)}</strong>
                      {isDisputed && <span style={{ display:"block", fontSize:"0.7rem", color:"#dc2626", fontWeight:700 }}><AlertTriangle size={16} aria-hidden="true" /> LITIGE</span>}
                    </div>
                  </td>
                  <td>
                    <div>
                      <strong style={{ fontSize:"0.82rem" }}>{clientName || "—"}</strong>
                      <span className={styles.vehMeta}>{b.clientInfo?.email}</span>
                      <span className={styles.vehMeta} title="Numéro de passeport" style={{ fontFamily:"monospace" }}><BookOpen size={16} aria-hidden="true" /> {b.clientInfo?.passportNumber || "—"}</span>
                      {kycStatus && (
                        <span style={{ display:"inline-block", fontSize:"0.65rem", fontWeight:700, padding:"1px 6px", borderRadius:99, background: kycStatus==="VERIFIE"?"#d1fae5":"#fef3c7", color: kycColors[kycStatus]||"#d97706", marginTop:2 }}>
                          {kycStatus==="VERIFIE"?"KYC":kycStatus==="REFUSE"?"KYC":"KYC"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div>
                      <span className={styles.vehName}>{vName}</span>
                      <Badge label={`${typeIcons[b.type]||""} ${b.type||"—"}`} color="#64748b" bg="#f1f5f9" />
                    </div>
                  </td>
                  <td className={styles.tdPrice}>
                    {b.montantTotal > 0 ? fmtUSD(b.montantTotal) : "—"}
                    {b.commissionAmount > 0 && <span style={{ display:"block", fontSize:"0.68rem", color:"#dc2626" }}>Com: {fmtUSD(b.commissionAmount)}</span>}
                  </td>
                  <td><Badge label={bs.label} color={bs.color} bg={bs.bg} /></td>
                  <td className={styles.tdDate}>{fmtDate(b.createdAt)}</td>
                  <td>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {/* Ces routes PDF exigent un en-tête Authorization qu'un simple
                          <a href> n'envoie jamais : le clic ouvrait un onglet
                          {"message":"Non autorisé"} au lieu du document (voir
                          utils/downloadAuthFile.js). */}
                      <button type="button" onClick={async () => {
                          const r = await downloadAuthFile(`/api/bookings/${b._id}/receipt`, `recu-${b.reference || b._id}.pdf`, token);
                          if (!r.ok) showToast(r.message, "error");
                        }}
                        style={{ fontSize:"0.7rem", padding:"2px 6px", background:"#f1f5f9", color:"#0f1b3f", border:"none", borderRadius:6, cursor:"pointer" }} title="Reçu PDF"><Receipt size={16} aria-hidden="true" /></button>
                      {/* Documents client joints à la réservation (2026-09) — l'admin
                          ne voyait que le numéro de pièce, jamais les documents
                          eux-mêmes, alors qu'ils sont la pièce maîtresse en cas de
                          litige (voir ClientDocumentsModal). */}
                      <button style={{ fontSize:"0.7rem", padding:"2px 6px", background:"#eff6ff", color:"#1d4ed8", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                        onClick={() => setDocsModal({ booking: b })} title="Documents client"><FileText size={16} aria-hidden="true" /></button>
                      {b.status === "pending" && (
                        <button className={styles.btnApprove} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                          onClick={() => setBkActionModal({ id:b._id, name:clientName, action:"confirmed" })} title="Confirmer"><CheckCircle2 size={16} aria-hidden="true" /></button>
                      )}
                      {isActive && b.status !== "pending" && (
                        <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#e0f2fe", color:"#0369a1", border:"none", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                          onClick={() => { setForceModal({ booking:b }); setForceAmount(b.montantTotal||""); setForceNote(""); }}
                          title="Forcer complétion"><Zap size={16} aria-hidden="true" /></button>
                      )}
                      {/* Refonte (demande explicite) : parité admin/partenaire sur les
                          réservations — le partenaire fait progresser une commande étape
                          par étape (préparation, prêt, en cours, client arrivé...) via
                          VendorDashboard, l'admin n'avait jusqu'ici que confirmer/annuler/
                          forcer/litige. Le backend valide déjà la transition (machine à
                          états, isOwner||admin), ce select réutilise adminUpdateBooking
                          tel quel — une étape invalide est simplement rejetée par le
                          serveur avec un message d'erreur. */}
                      {isActive && b.status !== "pending" && (
                        <select value="" onChange={(e) => { if (e.target.value) adminUpdateBooking(b._id, e.target.value); }}
                          title="Changer l'étape (comme le partenaire)"
                          style={{ fontSize:"0.7rem", padding:"2px 4px", borderRadius:6, border:"1.5px solid #e2e8f0", color:"#0f1b3f", fontWeight:600 }}>
                          <option value="">Étape…</option>
                          <option value="preparing">Préparation</option>
                          <option value="ready">Prêt</option>
                          <option value="in_progress">En cours</option>
                          <option value="client_arrived">Client présent</option>
                          <option value="driver_arrived">Chauffeur arrivé</option>
                          <option value="waiting_client_validation">Transaction</option>
                          <option value="transaction_concluded">Transaction conclue</option>
                          <option value="completed">Terminée</option>
                        </select>
                      )}
                      {isDisputed && (
                        <button style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, cursor:"pointer", fontWeight:700 }}
                          onClick={() => { setDisputeModal({ booking:b }); setDisputeNote(""); setDisputeResol("completed"); }}
                          title="Résoudre litige"><Scale size={16} aria-hidden="true" /></button>
                      )}
                      {!["cancelled","completed"].includes(b.status) && (
                        <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem" }}
                          onClick={() => { setBkActionModal({ id:b._id, name:clientName, action:"cancelled" }); setBkCancelReason(""); setBkCancelReasonCode(""); }}
                          title="Annuler">✕</button>
                      )}
                      {b.status === "cancelled" && (
                        <button className={styles.btnReject} style={{ padding:"0.2rem 0.5rem", fontSize:"0.72rem", opacity:.7 }}
                          onClick={() => setConfirm({ message:`Supprimer définitivement la commande ${b.reference||""}?`, danger:true, action:()=>adminDeleteBooking(b._id) })}
                          title="Supprimer"><Trash2 size={16} aria-hidden="true" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={bkPage} total={totalPages(filteredBookings)} onChange={setBkPage} />
      {/* Bug réel corrigé (audit) : plafond de 200 réservations
          chargées, invisible pour l'admin — voir loadMoreBookings. */}
      {bookings.length < bookingsTotal && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{bookings.length} chargées sur {bookingsTotal} au total</p>
          <button onClick={loadMoreBookings}
            style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
            Charger plus
          </button>
        </div>
      )}
    </div>
  );
}
