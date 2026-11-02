import { Badge, StatCard } from "../shared.jsx";
import { CertLevelDocs } from "./FoundingDocs.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Certifications » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function CertificationSection({
  certBadgeForm, certDetail, certFilter, certList, certLoading, certReviewForm,
  certReviewLevel, certReviewLoading, certReviewMsg, handleCertBadge, handleCertLevelReview, handleCertRelance,
  headers, loadCertList, pendingCert, setCertBadgeForm, setCertDetail, setCertFilter,
  setCertReviewForm, setCertReviewLevel, setCertReviewMsg,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🏆 Certifications Partenaire VIT AUTO</h2>
          <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Examinez chaque niveau de certification et attribuez les badges officiels.</p>
        </div>
        <button style={{ padding:"8px 16px", borderRadius:10, background:"#f59e0b", color:"#fff", border:"none", fontWeight:700, fontSize:".85rem", cursor:"pointer" }}
          onClick={loadCertList}>🔄 Actualiser</button>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:"1.5rem" }}>
        {[
          { icon:"📋", label:"Dossiers total",    value: certList.length,                                                    color:"#6366f1" },
          { icon:"⏳", label:"En attente review", value: pendingCert,                                                         color:"#d97706" },
          { icon:"🟢", label:"Badge Vérifié",     value: certList.filter(c=>c.certificationBadge==="verifie").length,          color:"#059669" },
          { icon:"🏆", label:"Badge Fondateur",   value: certList.filter(c=>c.certificationBadge==="fondateur").length,        color:"#d97706" },
          { icon:"⭐", label:"Badge Premium",     value: certList.filter(c=>c.certificationBadge==="premium").length,          color:"#7c3aed" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      {/* Filtres */}
      <div style={{ display:"flex", gap:8, marginBottom:"1.25rem", flexWrap:"wrap" }}>
        {[
          { v:"all",      l:"Tous" },
          { v:"pending",  l:"⏳ Niveaux soumis" },
          { v:"verifie",  l:"🟢 Vérifié" },
          { v:"fondateur",l:"🏆 Fondateur" },
          { v:"premium",  l:"⭐ Premium" },
        ].map(f => (
          <button key={f.v} onClick={() => setCertFilter(f.v)}
            style={{ padding:"6px 14px", borderRadius:20, border:"2px solid", fontSize:"0.8rem", fontWeight:700, cursor:"pointer",
              borderColor: certFilter===f.v ? "#f59e0b" : "#e2e8f0",
              background:  certFilter===f.v ? "#f59e0b" : "#f8fafc",
              color:       certFilter===f.v ? "#fff"    : "#64748b" }}>
            {f.l}
          </button>
        ))}
      </div>

      {certReviewMsg && (
        <div style={{ padding:"10px 16px", borderRadius:10, marginBottom:12, background: certReviewMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: certReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, fontSize:".85rem" }}>
          {certReviewMsg}
        </div>
      )}

      {certLoading ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>⏳ Chargement…</div>
      ) : certList.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
          <div style={{ fontSize:"3rem", marginBottom:12 }}>🏆</div>
          <p style={{ fontWeight:700, color:"#64748b" }}>Aucune demande de certification pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Partenaire</th><th>Niveaux</th><th>Badge actuel</th><th>Score</th><th>Actions</th></tr></thead>
            <tbody>
              {certList
                .filter(c => {
                  if (certFilter === "all") return true;
                  if (certFilter === "pending") return ["level1","level2","level3","level4","level5","level6","level7"].some(l => c[l]?.status === "submitted");
                  return c.certificationBadge === certFilter;
                })
                .map((c) => {
                  const u = c.userId;
                  const badgeColors = { verifie:"#059669", fondateur:"#d97706", premium:"#7c3aed", none:"#94a3b8" };
                  const pendingLevels = [1,2,3,4,5,6,7].filter(n => c[`level${n}`]?.status === "submitted");
                  return (
                    <tr key={c._id}>
                      <td>
                        <div style={{ fontWeight:700 }}>{u?.firstName} {u?.lastName}</div>
                        <div style={{ fontSize:".78rem", color:"#64748b" }}>{u?.email}</div>
                        <div style={{ fontSize:".72rem", color:"#94a3b8" }}>
                          <span style={{ background:"#f0f4ff", color:"#2563eb", padding:"1px 8px", borderRadius:99, fontWeight:700 }}>{u?.role}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {[1,2,3,4,5,6,7].map(n => {
                            const st = c[`level${n}`]?.status || "not_started";
                            const icons = { not_started:"○", in_progress:"◎", submitted:"⏳", approved:"✅", rejected:"❌" };
                            const cols  = { not_started:"#94a3b8", in_progress:"#3b82f6", submitted:"#d97706", approved:"#059669", rejected:"#dc2626" };
                            return (
                              <span key={n} title={`Niveau ${n} : ${st}`}
                                style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:22, height:22, borderRadius:6, background:"#f1f5f9", fontSize:".65rem", color:cols[st], fontWeight:800 }}>
                                {n}{icons[st]}
                              </span>
                            );
                          })}
                        </div>
                        {pendingLevels.length > 0 && (
                          <div style={{ fontSize:".72rem", color:"#d97706", fontWeight:700, marginTop:3 }}>
                            ⏳ Niveaux à examiner : {pendingLevels.join(", ")}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight:800, color: badgeColors[c.certificationBadge] || "#94a3b8", fontSize:".85rem" }}>
                          {c.certificationBadge === "premium" ? "⭐ Premium" : c.certificationBadge === "fondateur" ? "🏆 Fondateur" : c.certificationBadge === "verifie" ? "🟢 Vérifié" : "○ Aucun"}
                        </span>
                      </td>
                      <td style={{ fontWeight:800, color:"#6366f1" }}>{c.certificationScore ?? 0}/100</td>
                      <td>
                        <button
                          style={{ padding:"5px 12px", background:"#ede9fe", color:"#7c3aed", border:"1px solid #c4b5fd", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:"0.78rem" }}
                          onClick={async () => {
                            setCertReviewMsg("");
                            const r = await fetch(`/api/certification/admin/${u?._id}`, { headers });
                            if (r.ok) { const d = await r.json(); setCertDetail(d.certification); }
                          }}>
                          🔍 Examiner
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Panneau de détail dossier ── */}
      {certDetail && (
        <div className={styles.overlay} onClick={() => { setCertDetail(null); setCertReviewLevel(null); setCertReviewMsg(""); }}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()} style={{ maxWidth:680, width:"95%", maxHeight:"85vh", overflow:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div>
                <h3 style={{ margin:0, fontWeight:900, fontSize:"1.05rem", color:"#0f1b3f" }}>
                  🏆 Dossier de certification
                </h3>
                <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:".85rem" }}>
                  {certDetail.userId?.firstName} {certDetail.userId?.lastName} — {certDetail.userId?.email}
                </p>
              </div>
              <button onClick={() => { setCertDetail(null); setCertReviewLevel(null); setCertReviewMsg(""); }}
                style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontWeight:700 }}>✕</button>
            </div>

            {certReviewMsg && (
              <div style={{ padding:"8px 14px", borderRadius:8, marginBottom:12, background: certReviewMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: certReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight:700, fontSize:".83rem" }}>
                {certReviewMsg}
              </div>
            )}

            {(() => {
              const missingCount = [
                certDetail.level1?.registrationDoc?.data, certDetail.level1?.taxDoc?.data,
                certDetail.level2?.idFrontDoc?.data, certDetail.level2?.idBackDoc?.data, certDetail.level2?.selfieDoc?.data,
              ].filter((v) => !v).length;
              if (!missingCount || certDetail.overallStatus === "approved") return null;
              return (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                  <span style={{ fontSize:"0.82rem", color:"#92400e" }}>⚠️ {missingCount} document(s) manquant(s) pour ce dossier.</span>
                  <button className={styles.btnPrimary} style={{ whiteSpace:"nowrap", flexShrink:0 }} onClick={handleCertRelance} disabled={certReviewLoading}>
                    {certReviewLoading ? "…" : "🔔 Relancer"}
                  </button>
                </div>
              );
            })()}

            {/* Niveaux 1-7 */}
            {[1,2,3,4,5,6,7].map(n => {
              const lv = certDetail[`level${n}`];
              const lvTitles = ["","Entreprise","Représentant","Activité","Banque","Véhicules","Export","Contrat"];
              const st = lv?.status || "not_started";
              const stColors  = { not_started:"#94a3b8", submitted:"#d97706", approved:"#059669", rejected:"#dc2626", in_progress:"#3b82f6" };
              const stLabels  = { not_started:"Non commencé", submitted:"Soumis ⏳", approved:"Approuvé ✅", rejected:"Refusé ❌", in_progress:"En cours" };
              return (
                <div key={n} style={{ border:"1.5px solid #e2e8f0", borderRadius:12, padding:14, marginBottom:10,
                  borderColor: st === "approved" ? "#6ee7b7" : st === "submitted" ? "#fcd34d" : st === "rejected" ? "#fca5a5" : "#e2e8f0",
                  background:  st === "approved" ? "#f0fdf4" : st === "submitted" ? "#fffbeb" : "#fff" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: st === "submitted" ? 10 : 0 }}>
                    <div style={{ fontWeight:800, fontSize:".9rem", color:"#0f1b3f" }}>
                      Niveau {n} — {lvTitles[n]}
                    </div>
                    <span style={{ fontWeight:800, fontSize:".78rem", color: stColors[st] }}>{stLabels[st]}</span>
                  </div>
                  {lv?.adminNote && <p style={{ fontSize:".78rem", color:"#64748b", margin:"4px 0 0" }}>Note : {lv.adminNote}</p>}
                  {lv?.rejectionReason && <p style={{ fontSize:".78rem", color:"#dc2626", margin:"4px 0 0" }}>Motif refus : {lv.rejectionReason}</p>}
                  {st !== "not_started" && <CertLevelDocs level={n} lv={lv} />}

                  {st === "submitted" && (
                    certReviewLevel === n ? (
                      <div style={{ marginTop:10, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:12 }}>
                        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                          {["approved","rejected"].map(dec => (
                            <button key={dec} onClick={() => setCertReviewForm(p => ({ ...p, decision:dec }))}
                              style={{ flex:1, padding:"7px 0", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:700, fontSize:".8rem",
                                borderColor: certReviewForm.decision===dec ? (dec==="approved"?"#059669":"#dc2626") : "#e2e8f0",
                                background:  certReviewForm.decision===dec ? (dec==="approved"?"#d1fae5":"#fee2e2") : "#fff",
                                color:       certReviewForm.decision===dec ? (dec==="approved"?"#059669":"#dc2626") : "#64748b" }}>
                              {dec==="approved"?"✅ Approuver":"❌ Refuser"}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Note ou motif de refus…"
                          value={certReviewForm.note}
                          onChange={e => setCertReviewForm(p=>({...p, note:e.target.value}))}
                          style={{ width:"100%", boxSizing:"border-box", padding:8, borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".83rem", fontFamily:"inherit", resize:"vertical" }}
                        />
                        <div style={{ display:"flex", gap:8, marginTop:8 }}>
                          <button onClick={() => handleCertLevelReview(certDetail.userId?._id, n)} disabled={certReviewLoading}
                            style={{ flex:1, padding:"8px 0", background:"#0f1b3f", color:"#fff", border:"none", borderRadius:8, fontWeight:800, cursor:"pointer", fontSize:".83rem" }}>
                            {certReviewLoading ? "…" : "Confirmer"}
                          </button>
                          <button onClick={() => setCertReviewLevel(null)}
                            style={{ padding:"8px 16px", background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:".83rem" }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setCertReviewLevel(n); setCertReviewForm({ decision:"approved", note:"" }); }}
                        style={{ marginTop:8, padding:"6px 14px", background:"#f59e0b", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
                        Examiner ce niveau
                      </button>
                    )
                  )}
                </div>
              );
            })}

            {/* Attribution du badge final */}
            <div style={{ border:"2px solid #fcd34d", borderRadius:12, padding:16, background:"#fffbeb", marginTop:4 }}>
              <h4 style={{ margin:"0 0 12px", fontWeight:900, color:"#92400e" }}>🏅 Attribution du Badge Final</h4>
              <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                {[{v:"verifie",l:"🟢 Vérifié"},{v:"fondateur",l:"🏆 Fondateur"},{v:"premium",l:"⭐ Premium"},{v:"none",l:"○ Aucun"}].map(b => (
                  <button key={b.v} onClick={() => setCertBadgeForm(p=>({...p,badge:b.v}))}
                    style={{ flex:1, minWidth:100, padding:"8px 4px", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:800, fontSize:".78rem",
                      borderColor: certBadgeForm.badge===b.v ? "#f59e0b" : "#e2e8f0",
                      background:  certBadgeForm.badge===b.v ? "#f59e0b" : "#fff",
                      color:       certBadgeForm.badge===b.v ? "#fff"    : "#64748b" }}>
                    {b.l}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Message public affiché sur le profil (optionnel)" value={certBadgeForm.publicStatement}
                onChange={e => setCertBadgeForm(p=>({...p,publicStatement:e.target.value}))}
                style={{ width:"100%", boxSizing:"border-box", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:".83rem", fontFamily:"inherit", marginBottom:8 }}
              />
              <button onClick={() => handleCertBadge(certDetail.userId?._id)} disabled={certReviewLoading}
                style={{ width:"100%", padding:"10px 0", background:"linear-gradient(135deg,#0f1b3f,#1e3a6e)", color:"#fff", border:"none", borderRadius:8, fontWeight:800, cursor:"pointer", fontSize:".9rem" }}>
                {certReviewLoading ? "Enregistrement…" : "Attribuer le badge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
