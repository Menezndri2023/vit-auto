import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import ReportButton from "../components/ReportButton/ReportButton";
import { getCustomerServiceContact } from "../utils/customerServiceContact";

const fmtNum = (n) => Number(n || 0).toLocaleString("fr-FR");

// ── Score donut ────────────────────────────────────────────────────────────────
const ScoreDonut = ({ score = 0 }) => {
  const r = 36;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#059669" : score >= 50 ? "#f59e0b" : "#dc2626";
  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 45 45)" />
      <text x="45" y="42" textAnchor="middle" fontSize="16" fontWeight="900" fill="#0f172a">{score}</text>
      <text x="45" y="57" textAnchor="middle" fontSize="9" fill="#64748b">/100</text>
    </svg>
  );
};

// ── Horaires ──────────────────────────────────────────────────────────────────
const Horaires = ({ hours }) => {
  const days = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
  const labels = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {days.map((d, i) => {
        const h = hours?.[d];
        return (
          <div key={d} style={{ display:"flex", justifyContent:"space-between", fontSize:".82rem" }}>
            <span style={{ color:"#475569", fontWeight:600 }}>{labels[i]}</span>
            <span style={{ color: h?.closed ? "#dc2626" : "#059669", fontWeight:700 }}>
              {h?.closed ? "Fermé" : `${h?.open || "09:00"} – ${h?.close || "18:00"}`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function PartnerShowroomPublic() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showroom, setShowroom] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState("vehicules");
  const [partnerVehicles, setPartnerVehicles] = useState([]);

  useEffect(() => {
    fetch(`/api/pms/showrooms/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setShowroom)
      .catch(() => setShowroom(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Chargement des véhicules du partenaire une fois le showroom connu
  useEffect(() => {
    if (!showroom?.partnerId) return;
    fetch(`/api/vehicles?owner=${showroom.partnerId}&limit=100`)
      .then((r) => r.ok ? r.json() : { vehicles: [] })
      .then((d) => setPartnerVehicles(d.vehicles || []))
      .catch(() => setPartnerVehicles([]));
  }, [showroom?.partnerId]);

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"50vh", color:"#94a3b8" }}>
        Chargement du showroom…
      </div>
    );
  }

  if (!showroom) {
    return (
      <div style={{ maxWidth:600, margin:"80px auto", textAlign:"center", padding:"0 24px" }}>
        <div style={{ fontSize:"3rem", marginBottom:16 }}>🏪</div>
        <h2 style={{ color:"#0f1b3f", marginBottom:8 }}>Showroom introuvable</h2>
        <p style={{ color:"#64748b", marginBottom:24 }}>Ce showroom n'existe pas ou n'est pas encore publié.</p>
        <Link to="/partenaires" style={{ background:"#0f1b3f", color:"#fff", padding:"12px 28px", borderRadius:10, textDecoration:"none", fontWeight:700 }}>
          Voir tous les partenaires
        </Link>
      </div>
    );
  }

  const trust = showroom.trustScore || {};
  const TABS = [
    { id:"vehicules",     label:`🚗 Véhicules (${partnerVehicles.length})`   },
    { id:"about",         label:"🏢 À propos"                                },
    { id:"equipe",        label:"👥 Équipe"                                  },
    { id:"contact",       label:"📞 Contact"                                 },
  ];

  return (
    <div style={{ maxWidth:1200, margin:"0 auto", padding:"32px 20px 80px" }}>
      {/* ── Retour ── */}
      <button onClick={() => navigate(-1)} style={{
        background:"none", border:"none", color:"#64748b", cursor:"pointer",
        fontSize:".88rem", fontWeight:600, marginBottom:24, display:"flex", alignItems:"center", gap:6,
      }}>
        ← Retour
      </button>

      {/* ── Hero / Banner ── */}
      <div style={{
        background: showroom.banner
          ? `url(${showroom.banner}) center/cover no-repeat`
          : "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 22,
        minHeight: 220,
        position: "relative",
        overflow: "hidden",
        marginBottom: 28,
      }}>
        {!showroom.banner && (
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg, #0f1b3f, #1e3a6e)" }} />
        )}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 60%)" }} />

        {/* Badges sur la bannière */}
        <div style={{ position:"absolute", top:16, right:16, display:"flex", gap:8 }}>
          {showroom.partnerInfo?.isFounder && (
            <span style={{ background:"linear-gradient(135deg,#d97706,#f59e0b)", color:"#fff", padding:"5px 12px", borderRadius:999, fontSize:".75rem", fontWeight:800 }}>
              👑 FOUNDING PARTNER
            </span>
          )}
          {trust.verifiedDocs && (
            <span style={{ background:"#059669", color:"#fff", padding:"5px 12px", borderRadius:999, fontSize:".75rem", fontWeight:800 }}>
              ✅ VERIFIED
            </span>
          )}
          {trust.overall >= 85 && (
            <span style={{ background:"linear-gradient(135deg,#7c3aed,#a855f7)", color:"#fff", padding:"5px 12px", borderRadius:999, fontSize:".75rem", fontWeight:800 }}>
              🏆 PREMIUM EXPORTER
            </span>
          )}
        </div>

        {/* Infos bas de bannière */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"24px 28px" }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:18, flexWrap:"wrap" }}>
            {showroom.logo ? (
              <img src={showroom.logo} alt="Logo" style={{ width:72, height:72, borderRadius:12, objectFit:"cover", border:"3px solid rgba(255,255,255,.3)", background:"#fff" }} />
            ) : (
              <div style={{ width:72, height:72, borderRadius:12, background:"rgba(255,255,255,.1)", border:"3px solid rgba(255,255,255,.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.8rem" }}>🏪</div>
            )}
            <div>
              <h1 style={{ margin:"0 0 4px", color:"#fff", fontSize:"clamp(1.3rem,3vw,1.9rem)", fontWeight:900, textShadow:"0 2px 8px rgba(0,0,0,.4)" }}>
                {showroom.companyName}
              </h1>
              {showroom.tagline && (
                <p style={{ margin:0, color:"rgba(255,255,255,.85)", fontSize:".9rem" }}>{showroom.tagline}</p>
              )}
              {showroom.partnerInfo?.partnerRating?.nombreAvis > 0 && (
                <p style={{ margin:"4px 0 0", color:"#fbbf24", fontSize:".88rem", fontWeight:700 }}>
                  ★ {showroom.partnerInfo.partnerRating.noteMoyenne.toFixed(1)}
                  <span style={{ color:"rgba(255,255,255,.75)", fontWeight:500 }}> ({showroom.partnerInfo.partnerRating.nombreAvis} avis)</span>
                </p>
              )}
              <div style={{ display:"flex", gap:14, marginTop:6, flexWrap:"wrap" }}>
                {showroom.city && <span style={{ color:"rgba(255,255,255,.75)", fontSize:".8rem" }}>📍 {showroom.city}, {showroom.country}</span>}
                {showroom.foundedYear && <span style={{ color:"rgba(255,255,255,.75)", fontSize:".8rem" }}>🗓 Depuis {showroom.foundedYear}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenu ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:28, alignItems:"start" }}>
        {/* Colonne principale */}
        <div>
          {/* Onglets */}
          <div style={{ display:"flex", gap:4, borderBottom:"2px solid #e2e8f0", marginBottom:24 }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                background:"none", border:"none", padding:"10px 18px", fontWeight:700, cursor:"pointer",
                fontSize:".85rem", color:activeTab===t.id ? "#0f1b3f" : "#64748b",
                borderBottom:`2px solid ${activeTab===t.id ? "#0f1b3f" : "transparent"}`,
                marginBottom:"-2px", transition:"color .15s",
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Véhicules */}
          {activeTab === "vehicules" && (
            <div>
              {partnerVehicles.length === 0 ? (
                <div style={{ textAlign:"center", padding:"48px 0", color:"#94a3b8" }}>
                  <div style={{ fontSize:"2.5rem", marginBottom:12 }}>🚗</div>
                  <p>Aucun véhicule disponible pour le moment.</p>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:16 }}>
                  {partnerVehicles.map((v) => <VehicleCard key={v._id || v.id} car={v} />)}
                </div>
              )}
            </div>
          )}

          {/* À propos */}
          {activeTab === "about" && (
            <div>
              {showroom.description && (
                <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:24, marginBottom:20 }}>
                  <h3 style={{ margin:"0 0 12px", fontWeight:800, color:"#0f1b3f" }}>Présentation</h3>
                  <p style={{ margin:0, color:"#475569", fontSize:".9rem", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{showroom.description}</p>
                </div>
              )}

              {/* Stats publiques */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:12, marginBottom:20 }}>
                {[
                  { label:"Véhicules",       val:partnerVehicles.length,         icon:"🚗" },
                  { label:"Pays d'export",   val:showroom.exportCountries?.length || 0, icon:"🌍" },
                  { label:"Marques",         val:showroom.brands?.length || 0,   icon:"🏷️" },
                  { label:"Employés",        val:showroom.employeesCount || "—", icon:"👥" },
                  { label:"Surface",         val:showroom.showroomSurface || "—",icon:"🏢" },
                  { label:"Capacité/an",     val:showroom.annualCapacity || "—", icon:"📦" },
                ].map((s) => (
                  <div key={s.label} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"16px", textAlign:"center" }}>
                    <div style={{ fontSize:"1.4rem", marginBottom:6 }}>{s.icon}</div>
                    <div style={{ fontWeight:900, fontSize:"1.1rem", color:"#0f1b3f" }}>{s.val}</div>
                    <div style={{ fontSize:".75rem", color:"#64748b" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Marques */}
              {showroom.brands?.length > 0 && (
                <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:20, marginBottom:16 }}>
                  <h3 style={{ margin:"0 0 12px", fontWeight:800, color:"#0f1b3f", fontSize:".95rem" }}>Marques proposées</h3>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {showroom.brands.map((b) => (
                      <span key={b} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"5px 12px", fontSize:".82rem", fontWeight:600, color:"#0f1b3f" }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pays export */}
              {showroom.exportCountries?.length > 0 && (
                <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:20 }}>
                  <h3 style={{ margin:"0 0 12px", fontWeight:800, color:"#0f1b3f", fontSize:".95rem" }}>Pays desservis</h3>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {showroom.exportCountries.map((c) => (
                      <span key={c} style={{ background:"#eff6ff", color:"#1d4ed8", borderRadius:8, padding:"5px 12px", fontSize:".82rem", fontWeight:600 }}>
                        🌍 {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Équipe */}
          {activeTab === "equipe" && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:16 }}>
              {!showroom.team || showroom.team.length === 0 ? (
                <p style={{ color:"#94a3b8", gridColumn:"1/-1", textAlign:"center", padding:"40px 0" }}>
                  L'équipe n'a pas encore été renseignée.
                </p>
              ) : showroom.team.map((m, i) => (
                <div key={i} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:20, textAlign:"center" }}>
                  {m.photo ? (
                    <img src={m.photo} alt={m.name} loading="lazy" decoding="async" style={{ width:64, height:64, borderRadius:"50%", objectFit:"cover", marginBottom:12 }} />
                  ) : (
                    <div style={{ width:64, height:64, borderRadius:"50%", background:"linear-gradient(135deg,#0f1b3f,#1e3a6e)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:"1.5rem", color:"#fff" }}>
                      {m.name?.[0] || "?"}
                    </div>
                  )}
                  <div style={{ fontWeight:800, color:"#0f1b3f", marginBottom:4 }}>{m.name}</div>
                  <div style={{ fontSize:".8rem", color:"#64748b", marginBottom:8 }}>{m.role}</div>
                  {m.languages?.length > 0 && (
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"center" }}>
                      {m.languages.map((l) => (
                        <span key={l} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:6, padding:"2px 8px", fontSize:".72rem", color:"#64748b" }}>{l}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Contact */}
          {activeTab === "contact" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:20 }}>
                <h3 style={{ margin:"0 0 16px", fontWeight:800, color:"#0f1b3f", fontSize:".95rem" }}>Coordonnées</h3>
                {[
                  { icon:"📍", label:"Adresse",  val:[showroom.address, showroom.city, showroom.country].filter(Boolean).join(", ") },
                  { icon:"🌐", label:"Site web",  val:showroom.website },
                ].filter((r) => r.val).map((row) => (
                  <div key={row.label} style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
                    <span style={{ fontSize:"1.1rem" }}>{row.icon}</span>
                    <div>
                      <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:600 }}>{row.label}</div>
                      <div style={{ fontSize:".85rem", color:"#0f1b3f", fontWeight:600, wordBreak:"break-all" }}>{row.val}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:20 }}>
                <h3 style={{ margin:"0 0 16px", fontWeight:800, color:"#0f1b3f", fontSize:".95rem" }}>Contact</h3>
                {/* Aucun contact direct partenaire n'est plus jamais exposé
                    (audit 2026-08) — appel uniquement via le service client
                    VIT AUTO dédié au pays du partenaire. */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <a href={`tel:${getCustomerServiceContact(showroom.partnerInfo?.country).tel}`}
                    style={{ display:"flex", alignItems:"center", gap:10, background:"#fff1ee", color:"#ff4d2d", border:"1.5px solid #ffd4c7", borderRadius:10, padding:"12px 16px", textDecoration:"none", fontWeight:700, fontSize:".88rem" }}>
                    <span style={{ fontSize:"1.3rem" }}>📞</span> Appeler le service client VIT AUTO
                  </a>
                  {showroom.partnerId && (
                    <Link to={`/partner/${showroom.partnerId}`}
                      style={{ display:"flex", alignItems:"center", gap:10, background:"#eff6ff", color:"#1d4ed8", border:"1.5px solid #bfdbfe", borderRadius:10, padding:"12px 16px", textDecoration:"none", fontWeight:700, fontSize:".88rem" }}>
                      <span style={{ fontSize:"1.3rem" }}>👤</span> Voir le profil du partenaire
                    </Link>
                  )}
                </div>

                {/* Réseaux sociaux */}
                {(showroom.social?.facebook || showroom.social?.linkedin || showroom.social?.instagram) && (
                  <div style={{ marginTop:16, display:"flex", gap:8, flexWrap:"wrap" }}>
                    {showroom.social.facebook && <a href={showroom.social.facebook} target="_blank" rel="noopener noreferrer" style={{ background:"#dbeafe", color:"#1d4ed8", borderRadius:8, padding:"7px 12px", textDecoration:"none", fontSize:".78rem", fontWeight:700 }}>Facebook</a>}
                    {showroom.social.linkedin && <a href={showroom.social.linkedin} target="_blank" rel="noopener noreferrer" style={{ background:"#dbeafe", color:"#1d4ed8", borderRadius:8, padding:"7px 12px", textDecoration:"none", fontSize:".78rem", fontWeight:700 }}>LinkedIn</a>}
                    {showroom.social.instagram && <a href={showroom.social.instagram} target="_blank" rel="noopener noreferrer" style={{ background:"#fce7f3", color:"#be185d", borderRadius:8, padding:"7px 12px", textDecoration:"none", fontSize:".78rem", fontWeight:700 }}>Instagram</a>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite — Sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Trust Score */}
          <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:20 }}>
            <h4 style={{ margin:"0 0 14px", fontWeight:800, color:"#0f1b3f", fontSize:".9rem" }}>⭐ Score de confiance</h4>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <ScoreDonut score={trust.overall || 0} />
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:8 }}>
                {[
                  { label:"Commandes",   val:`${trust.completionRate || 0}%`,  color:"#059669" },
                  { label:"Livraisons",  val:`${trust.deliveryRate || 0}%`,    color:"#3b82f6" },
                  { label:"Annulations", val:`${trust.cancellationRate || 0}%`,color:"#f59e0b" },
                ].map((m) => (
                  <div key={m.label} style={{ fontSize:".75rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ color:"#64748b" }}>{m.label}</span>
                      <span style={{ fontWeight:700, color:m.color }}>{m.val}</span>
                    </div>
                    <div style={{ height:4, background:"#f1f5f9", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", background:m.color, width:m.val, borderRadius:2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Horaires */}
          {showroom.openingHours && (
            <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:20 }}>
              <h4 style={{ margin:"0 0 14px", fontWeight:800, color:"#0f1b3f", fontSize:".9rem" }}>🕐 Horaires d'ouverture</h4>
              <Horaires hours={showroom.openingHours} />
            </div>
          )}

          {/* Photos */}
          {showroom.photos?.length > 0 && (
            <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:20 }}>
              <h4 style={{ margin:"0 0 14px", fontWeight:800, color:"#0f1b3f", fontSize:".9rem" }}>📸 Photos</h4>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {showroom.photos.slice(0, 4).map((p, i) => (
                  <div key={i} style={{ borderRadius:8, overflow:"hidden", aspectRatio:"4/3", background:"#f8fafc" }}>
                    <img src={p.url} alt={p.caption || `Photo ${i+1}`} loading="lazy" decoding="async" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ background:"linear-gradient(135deg, #0f1b3f, #1e3a6e)", borderRadius:16, padding:20, color:"#fff" }}>
            <h4 style={{ margin:"0 0 12px", fontWeight:800, fontSize:".9rem" }}>Intéressé par ce partenaire ?</h4>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <a href={`tel:${getCustomerServiceContact(showroom.partnerInfo?.country).tel}`}
                style={{ background:"#ff4d2d", color:"#fff", textDecoration:"none", padding:"11px 16px", borderRadius:10, fontWeight:700, fontSize:".85rem", textAlign:"center" }}>
                📞 Appeler le service client
              </a>
              <Link to="/import-export" style={{ background:"rgba(255,77,45,.25)", color:"#ff8060", textDecoration:"none", padding:"11px 16px", borderRadius:10, fontWeight:700, fontSize:".85rem", textAlign:"center", border:"1px solid rgba(255,77,45,.3)" }}>
                📦 Demander un import
              </Link>
            </div>
          </div>

          {showroom.partnerId && (
            <div style={{ textAlign:"center" }}>
              <ReportButton targetType="user" targetId={showroom.partnerId} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
