import { Badge, StatCard } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « Partner Hub PMS » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function PmsPartnersSection({
  adminToggleShowroom, loadPMSAdmin, openTrustOverview, pmsFilter, pmsLoading, pmsShowrooms,
  pmsStats, setPmsFilter,
}) {
  return (
    <div className={styles.tabContent}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.2rem", flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:"1.1rem", fontWeight:800, color:"#0f1b3f", margin:"0 0 3px" }}>🏪 Partner Hub PMS</h2>
          <p style={{ margin:0, fontSize:".83rem", color:"#64748b" }}>Showrooms, leads et devis de tous les partenaires.</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadPMSAdmin}>↻ Actualiser</button>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:"1.5rem" }}>
        {[
          { icon:"🏪", label:"Showrooms total",  value: pmsStats?.totalShowrooms  || 0, color:"#6366f1" },
          { icon:"🌐", label:"Publiés",           value: pmsStats?.publishedShowrooms || 0, color:"#10b981" },
          { icon:"🎯", label:"Leads total",       value: pmsStats?.totalLeads      || 0, color:"#3b82f6" },
          { icon:"🏆", label:"Leads gagnés",      value: pmsStats?.wonLeads        || 0, color:"#059669" },
          { icon:"📄", label:"Devis total",       value: pmsStats?.totalQuotes     || 0, color:"#8b5cf6" },
          { icon:"✅", label:"Devis acceptés",    value: pmsStats?.acceptedQuotes  || 0, color:"#d97706" },
        ].map(k => <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />)}
      </div>

      {/* Filtres */}
      <div className={styles.filterBar}>
        {[
          { v:"all",       l:"Tous les showrooms" },
          { v:"published", l:"✅ Publiés" },
          { v:"hidden",    l:"👁 Non publiés" },
        ].map(f => (
          <button key={f.v} onClick={() => { setPmsFilter(f.v); }}
            style={{ padding:"6px 14px", borderRadius:8, border:`2px solid ${pmsFilter===f.v?"#6366f1":"#e2e8f0"}`,
              background: pmsFilter===f.v?"#6366f1":"#fff", color: pmsFilter===f.v?"#fff":"#374151",
              fontWeight:700, fontSize:".8rem", cursor:"pointer" }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Table showrooms */}
      {pmsLoading ? (
        <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>Chargement…</div>
      ) : pmsShowrooms.length === 0 ? (
        <div style={{ textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
          <div style={{ fontSize:"3rem", marginBottom:12 }}>🏪</div>
          <p style={{ fontWeight:600 }}>Aucun showroom partenaire pour le moment.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Partenaire</th>
                <th>Showroom</th>
                <th>Pays</th>
                <th>Trust Score</th>
                <th>Vues</th>
                <th>KYC</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pmsShowrooms.map((s) => {
                const p = s.partnerId || {};
                const KYC_COLOR = { VERIFIE:"#16a34a", EN_ATTENTE:"#d97706", REFUSE:"#dc2626" };
                const kycColor = KYC_COLOR[p.kycStatus] || "#94a3b8";
                const score = s.trustScore?.overall || 0;
                const scoreColor = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
                return (
                  <tr key={s._id} className={styles.tr}>
                    <td>
                      <div style={{ fontWeight:700, fontSize:".85rem" }}>
                        {p.firstName} {p.lastName}
                      </div>
                      <div style={{ fontSize:".73rem", color:"#64748b" }}>{p.email}</div>
                      <div style={{ fontSize:".72rem", marginTop:2 }}>
                        <span style={{ color: kycColor, fontWeight:700 }}>
                          {p.kycStatus === "VERIFIE" ? "✅ KYC" : p.kycStatus === "REFUSE" ? "❌ KYC" : "⏳ KYC"}
                        </span>
                        {!p.isActive && <span style={{ marginLeft:6, color:"#ef4444", fontWeight:700 }}>● Bloqué</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight:700, fontSize:".85rem" }}>{s.companyName || "—"}</div>
                      {s.tagline && <div style={{ fontSize:".73rem", color:"#64748b" }}>{s.tagline}</div>}
                      {s.slug && <div style={{ fontSize:".72rem", color:"#94a3b8" }}>/{s.slug}</div>}
                    </td>
                    <td style={{ fontSize:".82rem" }}>{s.country || "—"}</td>
                    <td>
                      <span style={{ fontWeight:800, color: scoreColor, fontSize:".9rem" }}>{score}/100</span>
                    </td>
                    <td style={{ fontSize:".82rem", color:"#64748b" }}>{s.viewCount || 0}</td>
                    <td>
                      {p.certificationBadge === "premium"   && <Badge label="⭐ Premium"   color="#7c3aed" bg="#ede9fe" />}
                      {p.certificationBadge === "fondateur" && <Badge label="🏆 Fondateur" color="#d97706" bg="#fef3c7" />}
                      {p.certificationBadge === "verifie"   && <Badge label="🟢 Vérifié"  color="#16a34a" bg="#dcfce7" />}
                      {!p.certificationBadge && <span style={{ color:"#cbd5e1", fontSize:".75rem" }}>—</span>}
                    </td>
                    <td>
                      {s.isPublished
                        ? <Badge label="🌐 En ligne"   color="#16a34a" bg="#dcfce7" />
                        : <Badge label="👁 Brouillon"  color="#d97706" bg="#fef3c7" />}
                    </td>
                    <td>
                      <div className={styles.actionBtns}>
                        <button
                          onClick={() => adminToggleShowroom(s._id)}
                          style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid",
                            borderColor: s.isPublished ? "#fca5a5" : "#86efac",
                            background:  s.isPublished ? "#fef2f2" : "#f0fdf4",
                            color:       s.isPublished ? "#dc2626" : "#16a34a",
                            fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                          {s.isPublished ? "Dépublier" : "Publier"}
                        </button>
                        {s.slug && (
                          <a href={`/showroom/${s.slug}`} target="_blank" rel="noopener noreferrer"
                            style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid #bfdbfe",
                              background:"#eff6ff", color:"#2563eb", fontWeight:700,
                              fontSize:".75rem", textDecoration:"none" }}>
                            Voir →
                          </a>
                        )}
                        {/* Vue de confiance unifiée — croise ce partenaire avec
                            KYC/Founding Partner/Certification sans changer d'onglet. */}
                        {p._id && (
                          <button
                            title="Vue de confiance unifiée"
                            onClick={() => openTrustOverview(p)}
                            style={{ padding:"4px 10px", borderRadius:6, border:"1.5px solid #e2e8f0",
                              background:"#f8fafc", color:"#0f1b3f", fontWeight:700, fontSize:".75rem", cursor:"pointer" }}>
                            🛡️
                          </button>
                        )}
                      </div>
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
