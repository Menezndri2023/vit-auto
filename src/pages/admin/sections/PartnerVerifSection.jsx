// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useState } from "react";
import { useCurrency } from "../../../context/CurrencyContext";
import styles from "../../AdminPanel.module.css";
import { COMPANY_TYPES, CRITERIA_CONFIG, STATUS_PV_CONFIG, TRUST_LEVEL_CONFIG, safeHref, safeImgHref } from "../shared.jsx";

function TrustScoreRing({ score }) {
  const r = 28; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const level = score >= 95 ? "platine" : score >= 75 ? "or" : score >= 50 ? "argent" : score >= 25 ? "bronze" : "non_verifie";
  const colors = { non_verifie: "#cbd5e1", bronze: "#d97706", argent: "#64748b", or: "#f59e0b", platine: "#8b5cf6" };
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={colors[level]} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 900, color: colors[level], lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: "0.55rem", color: "#94a3b8", fontWeight: 700 }}>/ 100</span>
      </div>
    </div>
  );
}

export function PartnerVerifSection({ token, headers, pvList, pvStats, pvLoading, pvFilter, setPvFilter, pvDetail, setPvDetail, pvCreateModal, setPvCreateModal, pvCreateForm, setPvCreateForm, pvSaving, setPvSaving, pvCriterionLoading, setPvCriterionLoading, users, onOpenTrustOverview, onRefresh, showToast }) {
  const { COUNTRIES_CONFIG } = useCurrency();
  const [detailTab, setDetailTab] = useState("dossier");
  const [editInfoMode, setEditInfoMode] = useState(false);
  const [editInfoForm, setEditInfoForm] = useState({});
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [criterionNote, setCriterionNote] = useState({});
  const [criterionDocUrl, setCriterionDocUrl] = useState({});

  const openDetail = async (userId) => {
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}`, { headers });
      const d = await res.json();
      setPvDetail(d.verification || { userId: d.user, criteria: {} });
      setDetailTab("dossier");
      setEditInfoMode(false);
    } catch { showToast("Erreur chargement dossier", "error"); }
  };

  const handleCreate = async () => {
    if (!pvCreateForm.userId || !pvCreateForm.companyName) { showToast("userId et nom entreprise requis", "error"); return; }
    setPvSaving(true);
    try {
      const res = await fetch("/api/partner-verif/admin", {
        method: "POST", headers,
        body: JSON.stringify(pvCreateForm),
      });
      const d = await res.json();
      if (res.ok) {
        showToast("Dossier créé avec succès");
        setPvCreateModal(false);
        setPvCreateForm({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
        onRefresh();
        openDetail(pvCreateForm.userId);
      } else showToast(d.message || "Erreur création", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handleToggleCriterion = async (criterion, currentVal) => {
    if (!pvDetail) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvCriterionLoading(criterion);
    try {
      // note/docUrl ne sont envoyés que si l'admin les a effectivement modifiés dans
      // cette session — sinon, comme le backend applique `valeur ?? existant`,
      // envoyer systématiquement une chaîne vide écraserait silencieusement une
      // note ou un lien déjà enregistrés dès que l'admin clique "Valider" sans
      // avoir retouché ces champs.
      const res = await fetch(`/api/partner-verif/admin/${userId}/criterion`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          criterion,
          verified: !currentVal,
          ...(criterion in criterionNote   ? { note: criterionNote[criterion] } : {}),
          ...(criterion in criterionDocUrl ? { docUrl: criterionDocUrl[criterion] } : {}),
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, criteria: d.verification.criteria, trustScore: d.trustScore, trustLevel: d.trustLevel, status: d.verification.status }));
        onRefresh();
        showToast(!currentVal ? "Critère validé" : "Critère retiré");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvCriterionLoading("");
  };

  const handleUpdateInfo = async () => {
    if (!pvDetail) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/info`, {
        method: "PATCH", headers,
        body: JSON.stringify(editInfoForm),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, ...d.verification }));
        setEditInfoMode(false);
        onRefresh();
        showToast("Informations mises à jour");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handleUpdateStatus = async () => {
    if (!pvDetail || !newStatus || pvSaving) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/status`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (res.ok) {
        setPvDetail((prev) => ({ ...prev, status: newStatus }));
        setStatusModal(null);
        onRefresh();
        showToast("Statut mis à jour");
      } else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const handlePvRelance = async () => {
    if (!pvDetail || pvSaving) return;
    const userId = pvDetail.userId?._id || pvDetail.userId;
    setPvSaving(true);
    try {
      const res = await fetch(`/api/partner-verif/admin/${userId}/relance`, { method: "POST", headers });
      const d = await res.json();
      if (res.ok) showToast(`Relance envoyée (${d.missingDocs.join(", ")})`);
      else showToast(d.message || "Erreur", "error");
    } catch { showToast("Connexion impossible", "error"); }
    setPvSaving(false);
  };

  const totalPv = pvStats?.total || 0;
  const verifPv = pvStats?.byStatus?.verifie || 0;
  const avgScore = pvStats?.avgScore || 0;

  return (
    <div className={styles.scrollZone}>
      {/* ── En-tête stats ── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#6d28d9" }}>
          <div className={styles.pvStatVal}>{totalPv}</div>
          <div className={styles.pvStatLbl}>Dossiers total</div>
        </div>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#16a34a" }}>
          <div className={styles.pvStatVal}>{verifPv}</div>
          <div className={styles.pvStatLbl}>Partenaires vérifiés</div>
        </div>
        <div className={styles.pvStatCard} style={{ borderLeftColor: "#f59e0b" }}>
          <div className={styles.pvStatVal}>{avgScore}</div>
          <div className={styles.pvStatLbl}>Score moyen / 100</div>
        </div>
        {Object.entries(pvStats?.byLevel || {}).map(([lv, cnt]) => (
          <div key={lv} className={styles.pvStatCard} style={{ borderLeftColor: TRUST_LEVEL_CONFIG[lv]?.color || "#94a3b8" }}>
            <div className={styles.pvStatVal}>{cnt}</div>
            <div className={styles.pvStatLbl}>{TRUST_LEVEL_CONFIG[lv]?.label || lv}</div>
          </div>
        ))}
      </div>

      {/* ── Filtres + bouton créer ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <input className={styles.searchInput} placeholder="Rechercher entreprise, email, pays…"
          value={pvFilter.search} onChange={(e) => setPvFilter((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && onRefresh()}
          style={{ minWidth: 220, flex: 1 }} />
        <select className={styles.filterSelect} value={pvFilter.status} onChange={(e) => setPvFilter((f) => ({ ...f, status: e.target.value }))}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_PV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={pvFilter.trustLevel} onChange={(e) => setPvFilter((f) => ({ ...f, trustLevel: e.target.value }))}>
          <option value="">Tous niveaux</option>
          {Object.entries(TRUST_LEVEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={pvFilter.companyType} onChange={(e) => setPvFilter((f) => ({ ...f, companyType: e.target.value }))}>
          <option value="">Tous types</option>
          {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className={styles.btnPrimary} onClick={onRefresh} disabled={pvLoading}>
          {pvLoading ? "…" : "🔍 Filtrer"}
        </button>
        <button className={styles.btnPrimary} style={{ background: "#6d28d9" }} onClick={() => setPvCreateModal(true)}>
          + Nouveau dossier
        </button>
      </div>

      {/* ── Table partenaires ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Entreprise</th>
              <th>Type</th>
              <th>Pays</th>
              <th>Trust Score</th>
              <th>Niveau</th>
              <th>Critères</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pvLoading && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Chargement…</td></tr>
            )}
            {!pvLoading && pvList.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "2.5rem", color: "#94a3b8" }}>
                Aucun dossier. Cliquez sur « + Nouveau dossier » pour commencer.
              </td></tr>
            )}
            {pvList.map((pv) => {
              const verified = CRITERIA_CONFIG.filter((c) => pv.criteria?.[c.key]?.verified).length;
              const sl = STATUS_PV_CONFIG[pv.status] || STATUS_PV_CONFIG.en_cours;
              const tl = TRUST_LEVEL_CONFIG[pv.trustLevel] || TRUST_LEVEL_CONFIG.non_verifie;
              return (
                <tr key={pv._id} style={{ cursor: "pointer" }} onClick={() => openDetail(pv.userId?._id || pv.userId)}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {pv.logoUrl
                        ? <img src={pv.logoUrl} alt="" loading="lazy" decoding="async" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                        : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, color: "#64748b" }}>{pv.companyName?.[0]?.toUpperCase()}</div>
                      }
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f1b3f" }}>{pv.companyName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{pv.email || pv.userId?.email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: "0.78rem", color: "#475569" }}>{COMPANY_TYPES.find((t) => t.value === pv.companyType)?.label || pv.companyType}</span></td>
                  <td>
                    <span style={{ fontSize: "0.82rem" }}>
                      {pv.country || "—"}
                      {pv.country && (() => {
                        const match = COUNTRIES_CONFIG.find((c) => c.name.toLowerCase() === String(pv.country).toLowerCase());
                        return match ? <span title={match.name} style={{ marginLeft: 6 }}>{match.flag}</span> : null;
                      })()}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 60 }}>
                        <div style={{ height: "100%", width: `${pv.trustScore}%`, background: pv.trustScore >= 75 ? "#16a34a" : pv.trustScore >= 50 ? "#f59e0b" : "#ef4444", borderRadius: 4, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f1b3f", minWidth: 28 }}>{pv.trustScore}</span>
                    </div>
                  </td>
                  <td><span className={styles.badge} style={{ color: tl.color, background: tl.bg }}>{tl.label}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {CRITERIA_CONFIG.map((c) => (
                        <span key={c.key} title={c.label}
                          style={{ fontSize: "0.85rem", opacity: pv.criteria?.[c.key]?.verified ? 1 : 0.2 }}>
                          {c.icon}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td><span className={styles.badge} style={{ color: sl.color, background: sl.bg }}>{sl.label}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className={styles.btnSmall} onClick={(e) => { e.stopPropagation(); openDetail(pv.userId?._id || pv.userId); }}>
                        Ouvrir →
                      </button>
                      {/* Vue de confiance unifiée — croise ce partenaire avec KYC/
                          Founding Partner/Certification sans changer d'onglet. */}
                      {onOpenTrustOverview && pv.userId && (
                        <button
                          title="Vue de confiance unifiée"
                          onClick={(e) => { e.stopPropagation(); onOpenTrustOverview(typeof pv.userId === "object" ? pv.userId : { _id: pv.userId }); }}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#0f1b3f", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}>
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

      {/* ══ Modal : Nouveau dossier ══ */}
      {pvCreateModal && (
        <div className={styles.overlay} onClick={() => setPvCreateModal(false)}>
          <div className={styles.pvModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pvModalHeader}>
              <h3 style={{ margin: 0, fontWeight: 900, fontSize: "1rem", color: "#0f1b3f" }}>Nouveau dossier partenaire</h3>
              <button className={styles.btnGhost} onClick={() => setPvCreateModal(false)}>✕</button>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "65vh", overflowY: "auto" }}>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Compte utilisateur (ID ou email)</label>
                <input className={styles.pvInput} placeholder="ID MongoDB du partenaire"
                  value={pvCreateForm.userId} onChange={(e) => setPvCreateForm((f) => ({ ...f, userId: e.target.value }))} />
                <div style={{ marginTop: 4 }}>
                  <select className={styles.pvInput} onChange={(e) => setPvCreateForm((f) => ({ ...f, userId: e.target.value, companyName: f.companyName || "" }))}>
                    <option value="">— Sélectionner dans la liste —</option>
                    {users.filter((u) => u.role === "partenaire").map((u) => (
                      <option key={u._id} value={u._id}>{u.firstName} {u.lastName} — {u.email}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Nom de l'entreprise *</label>
                <input className={styles.pvInput} placeholder="Ex : DAKAR AUTO EXPORT SARL"
                  value={pvCreateForm.companyName} onChange={(e) => setPvCreateForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Type d'entreprise</label>
                  <select className={styles.pvInput} value={pvCreateForm.companyType} onChange={(e) => setPvCreateForm((f) => ({ ...f, companyType: e.target.value }))}>
                    {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Pays</label>
                  <input className={styles.pvInput} placeholder="Côte d'Ivoire"
                    value={pvCreateForm.country} onChange={(e) => setPvCreateForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Ville</label>
                  <input className={styles.pvInput} placeholder="Abidjan"
                    value={pvCreateForm.city} onChange={(e) => setPvCreateForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Site web</label>
                  <input className={styles.pvInput} placeholder="https://"
                    value={pvCreateForm.website} onChange={(e) => setPvCreateForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Email pro</label>
                  <input className={styles.pvInput} placeholder="contact@..."
                    value={pvCreateForm.email} onChange={(e) => setPvCreateForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className={styles.pvFormRow}>
                  <label className={styles.pvLabel}>Téléphone</label>
                  <input className={styles.pvInput} placeholder="+225..."
                    value={pvCreateForm.phone} onChange={(e) => setPvCreateForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Description</label>
                <textarea className={styles.pvInput} rows={2} placeholder="Présentation courte de l'entreprise…"
                  value={pvCreateForm.description} onChange={(e) => setPvCreateForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className={styles.pvFormRow}>
                <label className={styles.pvLabel}>Note admin interne</label>
                <textarea className={styles.pvInput} rows={2} placeholder="Notes internes (non visibles par le partenaire)…"
                  value={pvCreateForm.adminNote} onChange={(e) => setPvCreateForm((f) => ({ ...f, adminNote: e.target.value }))} />
              </div>
              <button className={styles.btnPrimary} style={{ marginTop: 4 }} onClick={handleCreate} disabled={pvSaving}>
                {pvSaving ? "Création…" : "Créer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Drawer : Détail dossier ══ */}
      {pvDetail && (
        <div className={styles.overlay} onClick={() => setPvDetail(null)}>
          <div className={styles.pvDrawer} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.pvDrawerHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <TrustScoreRing score={pvDetail.trustScore || 0} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: "1.05rem", color: "#0f1b3f" }}>{pvDetail.companyName}</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{COMPANY_TYPES.find((t) => t.value === pvDetail.companyType)?.label} · {pvDetail.country || "—"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {(() => { const sl = STATUS_PV_CONFIG[pvDetail.status] || STATUS_PV_CONFIG.en_cours; const tl = TRUST_LEVEL_CONFIG[pvDetail.trustLevel] || TRUST_LEVEL_CONFIG.non_verifie; return (<><span className={styles.badge} style={{ color: sl.color, background: sl.bg }}>{sl.label}</span><span className={styles.badge} style={{ color: tl.color, background: tl.bg }}>⭐ {tl.label}</span></>); })()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.btnSmall} onClick={() => { setNewStatus(pvDetail.status); setStatusModal(true); }}>Changer statut</button>
                <button className={styles.btnGhost} onClick={() => setPvDetail(null)}>✕</button>
              </div>
            </div>

            {/* Onglets internes */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", padding: "0 20px" }}>
              {[["dossier","📋 Dossier"],["criteres","✅ Critères"],["docs","📁 Documents"],["audit","📜 Audit"]].map(([k, lbl]) => (
                <button key={k} onClick={() => setDetailTab(k)}
                  style={{ padding: "10px 16px", fontSize: "0.82rem", fontWeight: 700, border: "none", cursor: "pointer", background: "none", borderBottom: detailTab === k ? "3px solid #6d28d9" : "3px solid transparent", color: detailTab === k ? "#6d28d9" : "#64748b" }}>
                  {lbl}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>

              {/* ── Onglet Dossier ── */}
              {detailTab === "dossier" && (
                <div>
                  {!editInfoMode ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16 }}>
                        {[
                          ["Nom entreprise", pvDetail.companyName],
                          ["Type", COMPANY_TYPES.find((t) => t.value === pvDetail.companyType)?.label],
                          ["Pays", pvDetail.country],
                          ["Ville", pvDetail.city],
                          ["Site web", pvDetail.website ? <a href={safeHref(pvDetail.website)} target="_blank" rel="noreferrer noopener" style={{ color: "#6d28d9" }}>{pvDetail.website}</a> : "—"],
                          ["Email pro", pvDetail.email],
                          ["Téléphone", pvDetail.phone],
                          ["Exp. (années)", pvDetail.yearsExperience],
                          ["Volume annuel", pvDetail.annualVolume],
                          ["Partenaire (User)", `${pvDetail.userId?.firstName || ""} ${pvDetail.userId?.lastName || ""} — ${pvDetail.userId?.email || ""}`],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                            <div style={{ fontSize: "0.88rem", color: "#0f1b3f", fontWeight: 600, marginTop: 2 }}>{v || "—"}</div>
                          </div>
                        ))}
                      </div>
                      {pvDetail.description && <div style={{ fontSize: "0.85rem", color: "#475569", marginBottom: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 }}>{pvDetail.description}</div>}
                      {pvDetail.exportCountries?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Pays d'export</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {pvDetail.exportCountries.map((c) => <span key={c} style={{ background: "#ede9fe", color: "#6d28d9", padding: "2px 10px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 600 }}>{c}</span>)}
                          </div>
                        </div>
                      )}
                      {pvDetail.adminNote && (
                        <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: "0.85rem", color: "#92400e", marginBottom: 10 }}>
                          <strong>Note admin :</strong> {pvDetail.adminNote}
                        </div>
                      )}
                      <button className={styles.btnSmall} onClick={() => { setEditInfoMode(true); setEditInfoForm({ companyName: pvDetail.companyName, companyType: pvDetail.companyType, country: pvDetail.country, city: pvDetail.city, website: pvDetail.website, phone: pvDetail.phone, email: pvDetail.email, description: pvDetail.description, yearsExperience: pvDetail.yearsExperience, annualVolume: pvDetail.annualVolume, adminNote: pvDetail.adminNote, internalRating: pvDetail.internalRating, exportCountries: pvDetail.exportCountries?.join(", ") || "" }); }}>
                        Modifier les infos
                      </button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className={styles.pvLabel}>Nom entreprise</label><input className={styles.pvInput} value={editInfoForm.companyName || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, companyName: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Type</label>
                          <select className={styles.pvInput} value={editInfoForm.companyType || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, companyType: e.target.value }))}>
                            {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div><label className={styles.pvLabel}>Pays</label><input className={styles.pvInput} value={editInfoForm.country || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, country: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Ville</label><input className={styles.pvInput} value={editInfoForm.city || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, city: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Site web</label><input className={styles.pvInput} value={editInfoForm.website || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, website: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Email pro</label><input className={styles.pvInput} value={editInfoForm.email || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, email: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Téléphone</label><input className={styles.pvInput} value={editInfoForm.phone || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                        <div><label className={styles.pvLabel}>Exp. (années)</label><input className={styles.pvInput} type="number" value={editInfoForm.yearsExperience || 0} onChange={(e) => setEditInfoForm((f) => ({ ...f, yearsExperience: Number(e.target.value) }))} /></div>
                      </div>
                      <div><label className={styles.pvLabel}>Volume annuel</label><input className={styles.pvInput} value={editInfoForm.annualVolume || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, annualVolume: e.target.value }))} /></div>
                      <div><label className={styles.pvLabel}>Pays d'export (séparés par virgule)</label><input className={styles.pvInput} value={editInfoForm.exportCountries || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, exportCountries: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} /></div>
                      <div><label className={styles.pvLabel}>Description</label><textarea className={styles.pvInput} rows={2} value={editInfoForm.description || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, description: e.target.value }))} /></div>
                      <div><label className={styles.pvLabel}>Note admin</label><textarea className={styles.pvInput} rows={2} value={editInfoForm.adminNote || ""} onChange={(e) => setEditInfoForm((f) => ({ ...f, adminNote: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button className={styles.btnPrimary} onClick={handleUpdateInfo} disabled={pvSaving}>{pvSaving ? "Sauvegarde…" : "Enregistrer"}</button>
                        <button className={styles.btnGhost} onClick={() => setEditInfoMode(false)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Onglet Critères ── */}
              {detailTab === "criteres" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Jauge globale */}
                  <div style={{ background: "linear-gradient(135deg, #0f1b3f, #1e3a8a)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 20, marginBottom: 8 }}>
                    <TrustScoreRing score={pvDetail.trustScore || 0} />
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900, fontSize: "1rem" }}>Trust Score Global</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>
                        {CRITERIA_CONFIG.filter((c) => pvDetail.criteria?.[c.key]?.verified).length} / {CRITERIA_CONFIG.length} critères validés
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.82rem", marginTop: 4 }}>
                        Niveau : <strong>{TRUST_LEVEL_CONFIG[pvDetail.trustLevel]?.label || "Non vérifié"}</strong>
                      </div>
                    </div>
                  </div>

                  {CRITERIA_CONFIG.map((c) => {
                    const isVerified = pvDetail.criteria?.[c.key]?.verified || false;
                    const verif = pvDetail.criteria?.[c.key];
                    const isLoading = pvCriterionLoading === c.key;
                    return (
                      <div key={c.key} className={styles.pvCriterionCard} style={{ borderLeft: `4px solid ${isVerified ? "#16a34a" : "#e2e8f0"}` }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ fontSize: "1.5rem", lineHeight: 1, marginTop: 2 }}>{c.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f1b3f" }}>{c.label}</span>
                              <span style={{ fontSize: "0.72rem", color: "#6d28d9", fontWeight: 700, background: "#ede9fe", padding: "1px 8px", borderRadius: 12 }}>+{c.weight} pts</span>
                              {isVerified && verif?.verifiedAt && (
                                <span style={{ fontSize: "0.72rem", color: "#16a34a" }}>Validé le {new Date(verif.verifiedAt).toLocaleDateString("fr-FR")}</span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 2 }}>{c.desc}</div>
                            {verif?.note && <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: 4, fontStyle: "italic" }}>"{verif.note}"</div>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={() => handleToggleCriterion(c.key, isVerified)}
                              disabled={isLoading}
                              className={isVerified ? styles.btnDanger : styles.btnPrimary}
                              style={{ fontSize: "0.78rem", padding: "5px 14px", minWidth: 100 }}>
                              {isLoading ? "…" : isVerified ? "✕ Retirer" : "✓ Valider"}
                            </button>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <input className={styles.pvInput} placeholder="Note (optionnel)…"
                            style={{ flex: 1, fontSize: "0.78rem", padding: "4px 10px" }}
                            value={criterionNote[c.key] ?? verif?.note ?? ""}
                            onChange={(e) => setCriterionNote((n) => ({ ...n, [c.key]: e.target.value }))} />
                        </div>
                        {/* Lien vers la pièce justificative de ce critère (criteria.<clé>.docUrl côté
                            modèle) — géré par le backend depuis l'origine (adminToggleCriterion) mais
                            jamais exposé ici : l'admin ne pouvait ni le voir, ni le renseigner. */}
                        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                          <input className={styles.pvInput} placeholder="Lien du justificatif (optionnel)…"
                            style={{ flex: 1, fontSize: "0.78rem", padding: "4px 10px" }}
                            value={criterionDocUrl[c.key] ?? verif?.docUrl ?? ""}
                            onChange={(e) => setCriterionDocUrl((n) => ({ ...n, [c.key]: e.target.value }))} />
                          {verif?.docUrl && (
                            <a href={safeImgHref(verif.docUrl) !== "#" ? safeImgHref(verif.docUrl) : safeHref(verif.docUrl)}
                              target="_blank" rel="noreferrer noopener"
                              style={{ fontSize: "0.78rem", color: "#6d28d9", textDecoration: "underline", whiteSpace: "nowrap" }}>
                              Voir →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Onglet Documents ── */}
              {detailTab === "docs" && (
                <div>
                  {(() => {
                    const requiredKeys = ["businessLicenseDoc", "rccmDoc", "taxIdDoc", "repIdDoc"];
                    const missingCount = requiredKeys.filter((k) => !pvDetail.documents?.[k]).length;
                    if (!missingCount || pvDetail.status === "verifie") return null;
                    return (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                        <span style={{ fontSize: "0.82rem", color: "#92400e" }}>⚠️ {missingCount} document(s) manquant(s) — le partenaire n'a pas été relancé automatiquement depuis plus de 7 jours au maximum.</span>
                        <button className={styles.btnPrimary} style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={handlePvRelance} disabled={pvSaving}>
                          {pvSaving ? "…" : "🔔 Relancer"}
                        </button>
                      </div>
                    );
                  })()}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["Licence commerciale", "businessLicenseDoc"],
                      ["RCCM",               "rccmDoc"],
                      ["NIF / Taxe",         "taxIdDoc"],
                      ["Relevé bancaire",    "bankStatementDoc"],
                      ["Pièce d'identité rep.", "repIdDoc"],
                      ["Autre document",     "otherDoc"],
                    ].map(([label, key]) => (
                      <div key={key} style={{ border: "1px dashed #e2e8f0", borderRadius: 10, padding: "14px", display: "flex", flexDirection: "column", gap: 8, background: "#fafbfc" }}>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>{label}</div>
                        {pvDetail.documents?.[key] ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <img src={pvDetail.documents[key]} alt={label} loading="lazy" decoding="async" style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} onError={(e) => { e.target.style.display = "none"; }} />
                            {/* safeHref (pas safeImgHref) laissait ce lien toujours pointer vers "#" pour un
                                document stocké en base64 (data:image/...) — l'aperçu s'affichait mais le
                                clic "Voir le document" ne faisait jamais rien, contrairement à tous les
                                autres blocs documents du fichier (KYC, Certification, Founding Partner). */}
                            <a href={safeImgHref(pvDetail.documents[key])} target="_blank" rel="noreferrer noopener"
                              style={{ fontSize: "0.78rem", color: "#6d28d9", textDecoration: "underline" }}>Voir le document</a>
                          </div>
                        ) : (
                          <div style={{ color: "#cbd5e1", fontSize: "0.8rem", textAlign: "center", padding: "10px 0" }}>Aucun document</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Onglet Audit ── */}
              {detailTab === "audit" && (
                <div>
                  {(!pvDetail.auditLog || pvDetail.auditLog.length === 0) && (
                    <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Aucune entrée d'audit</div>
                  )}
                  {pvDetail.auditLog?.slice().reverse().map((log, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 12, borderBottom: "1px solid #f1f5f9", marginBottom: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6d28d9", marginTop: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f1b3f" }}>{log.action}</span>
                          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString("fr-FR")}</span>
                        </div>
                        {log.criterion && <div style={{ fontSize: "0.75rem", color: "#6d28d9", marginTop: 1 }}>Critère : {log.criterion}</div>}
                        {log.note && <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: 2 }}>{log.note}</div>}
                        {log.performedBy && <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 1 }}>Par : {log.performedBy?.firstName} {log.performedBy?.lastName}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal : Changer statut ══ */}
      {statusModal && pvDetail && (
        <div className={styles.overlay} onClick={() => setStatusModal(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMsg} style={{ marginBottom: 14 }}>Changer le statut du dossier <strong>{pvDetail.companyName}</strong></p>
            <select className={styles.pvInput} style={{ marginBottom: 16 }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {Object.entries(STATUS_PV_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className={styles.confirmActions}>
              <button className={styles.btnPrimary} onClick={handleUpdateStatus} disabled={pvSaving}>{pvSaving ? "…" : "Confirmer"}</button>
              <button className={styles.btnGhost} onClick={() => setStatusModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
