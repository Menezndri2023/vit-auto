import { Badge, CountryFlag, safeImgHref } from "../shared.jsx";
import { PendingIdentitiesSection } from "./PendingIdentitiesSection.jsx";
import styles from "../../AdminPanel.module.css";

// Onglet « KYC / Identités » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function KycSection({
  COUNTRIES_CONFIG, handleKycReview, kycDetailLoading, kycDetailUser, kycFilter, kycList,
  kycLoading, kycReviewForm, kycReviewLoading, kycReviewMsg, kycSearch, kycTotal,
  loadKycList, loadMoreKyc, openKycDetail, openTrustOverview, setKycDetailUser, setKycFilter,
  setKycReviewForm, setKycSearch, showToast, token,
}) {
  return (
    <div className={styles.tabContent}>
      {/* En-tête KYC */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 3px" }}>🛡️ Gestion des dossiers KYC</h2>
          <p style={{ margin: 0, fontSize: ".83rem", color: "#64748b" }}>Examinez et validez les dossiers d'identité soumis par les utilisateurs.</p>
        </div>
        <button
          style={{ padding: "8px 16px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}
          onClick={() => loadKycList(kycFilter)}
        >
          🔄 Actualiser
        </button>
      </div>

      {/* Pièces d'identité soumises depuis le profil client — file distincte
          du parcours KYC complet, et jusqu'ici sans aucun écran (voir
          PendingIdentitiesSection). */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.chartTitle}>🪪 Pièces d'identité soumises depuis le profil</h3>
        <p style={{ margin: "0 0 12px", fontSize: ".8rem", color: "#64748b" }}>
          Envoyées par un client depuis sa page Profil, hors parcours KYC complet.
        </p>
        <PendingIdentitiesSection token={token} showToast={showToast} />
      </div>

      {/* Filtres par statut */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        {[
          { v: "ALL",                   l: "Tous",       ic: "📋" },
          { v: "EN_ATTENTE",            l: "En attente", ic: "⏳" },
          { v: "A_REVOIR_MANUELLEMENT", l: "En révision", ic: "🔍" },
          { v: "VERIFIE",               l: "Vérifiés",   ic: "✅" },
          { v: "REFUSE",                l: "Refusés",    ic: "❌" },
        ].map(({ v, l, ic }) => (
          <button key={v}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
              fontSize: ".82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              borderColor: kycFilter === v ? "#6366f1" : "#e2e8f0",
              background:  kycFilter === v ? "#6366f1" : "#f8fafc",
              color:       kycFilter === v ? "#fff"    : "#64748b",
            }}
            onClick={() => setKycFilter(v)}
          >
            {ic} {l}
          </button>
        ))}
      </div>

      {/* Recherche — pratique pour retrouver un compte précis (ex: déjà
          approuvé) sans devoir deviner sous quel filtre de statut il se trouve */}
      <input
        className={styles.searchInput}
        placeholder="Rechercher par nom ou email…"
        value={kycSearch}
        onChange={(e) => setKycSearch(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", marginBottom: "1.25rem" }}
      />

      {(() => {
        const q = kycSearch.trim().toLowerCase();
        const filteredKycList = q
          ? kycList.filter((u) =>
              `${u.firstName} ${u.lastName} ${u.email || ""}`.toLowerCase().includes(q))
          : kycList;

        if (kycLoading) return (
          <div className={styles.loadingBox}><div className={styles.spinner} /><p>Chargement des dossiers KYC…</p></div>
        );
        if (filteredKycList.length === 0) return (
          <div className={styles.emptyBox} style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>✅</div>
            <p style={{ margin: 0, fontWeight: 600, color: "#475569" }}>
              {q
                ? "Aucun résultat pour cette recherche."
                : kycFilter === "ALL"     ? "Aucun dossier KYC."
                : kycFilter === "VERIFIE" ? "Aucun dossier vérifié."
                : kycFilter === "REFUSE"  ? "Aucun dossier refusé."
                : "Aucun dossier en attente de traitement."}
            </p>
          </div>
        );
        return (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredKycList.map((u) => {
            const KC = {
              VERIFIE:               { c: "#059669", bg: "#d1fae5", border: "#6ee7b7", emoji: "✅" },
              EN_ATTENTE:            { c: "#d97706", bg: "#fef3c7", border: "#fde68a", emoji: "⏳" },
              A_REVOIR_MANUELLEMENT: { c: "#2563eb", bg: "#dbeafe", border: "#93c5fd", emoji: "🔍" },
              REFUSE:                { c: "#dc2626", bg: "#fee2e2", border: "#fca5a5", emoji: "❌" },
            };
            const kc = KC[u.kycStatus] || KC["EN_ATTENTE"];
            return (
              <div key={u._id} style={{
                background: "#fff", borderRadius: 14,
                border: `1.5px solid ${kc.border}`,
                padding: "16px 20px",
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                alignItems: "center", gap: 16,
              }}>
                {/* Infos utilisateur */}
                <div>
                  <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#0f1b3f", marginBottom: 2 }}>
                    {u.firstName} {u.lastName}<CountryFlag code={u.country} countriesConfig={COUNTRIES_CONFIG} />
                  </div>
                  <div style={{ fontSize: ".81rem", color: "#64748b" }}>{u.email}</div>
                  <div style={{ fontSize: ".76rem", color: "#94a3b8", marginTop: 3 }}>
                    Soumis {u.kycSubmittedAt ? new Date(u.kycSubmittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </div>
                </div>
                {/* OCR mini */}
                {u.kycOcrData ? (
                  <div style={{ fontSize: ".78rem", color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", textAlign: "right", minWidth: 140 }}>
                    <div style={{ fontWeight: 700 }}>{u.kycOcrData.documentType || "—"} · {u.kycOcrData.issuingCountry || "—"}</div>
                    <div>OCR <strong>{u.kycOcrData.ocrConfidence ?? 0}%</strong> · Face <strong>{u.kycFaceMatchScore ?? "—"}%</strong></div>
                    <div>Score <strong>{u.kycScore ?? 0}/100</strong></div>
                  </div>
                ) : <div />}
                {/* Badge statut */}
                <span style={{ padding: "4px 14px", borderRadius: 20, background: kc.bg, color: kc.c, fontSize: ".8rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {kc.emoji} {(u.kycStatus || "EN_ATTENTE").replace(/_/g, " ")}
                </span>
                {/* Boutons — examen KYC + vue de confiance unifiée (croise
                    KYC/Founding Partner/Certification/PMS sans changer d'onglet) */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    title="Vue de confiance unifiée"
                    style={{ padding: "8px 12px", borderRadius: 10, background: "#f1f5f9", color: "#0f1b3f", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer", whiteSpace: "nowrap" }}
                    onClick={() => openTrustOverview(u)}
                  >
                    🛡️
                  </button>
                  <button
                    style={{ padding: "8px 18px", borderRadius: 10, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: ".85rem", cursor: "pointer", whiteSpace: "nowrap" }}
                    onClick={() => openKycDetail(u)}
                  >
                    Examiner →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        );
      })()}

      {/* "Charger plus" — voir loadMoreKyc : le plafond était auparavant
          invisible (bug réel corrigé), les dossiers au-delà disparaissaient
          silencieusement sans aucun indice qu'il en restait. Volontairement
          PAS masqué pendant une recherche (bug réel corrigé, audit) — la
          recherche filtre côté client sur les kycLimit dossiers déjà
          chargés (comme les onglets Users/Bookings) ; masquer ce bouton
          en tapant rendait impossible de charger un dossier situé au-delà
          de kycLimit tant que le champ de recherche n'était pas vidé. */}
      {!kycLoading && kycList.length < kycTotal && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 8 }}>
            {kycList.length} affichés sur {kycTotal} au total
          </p>
          <button onClick={loadMoreKyc}
            style={{ padding: "8px 20px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".85rem", cursor: "pointer" }}>
            Charger plus
          </button>
        </div>
      )}

      {/* Modal détail + décision KYC */}
      {kycDetailUser && (
        <div className={styles.overlay} onClick={() => setKycDetailUser(null)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "0", maxWidth: 740, width: "98%", maxHeight: "94dvh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.22)" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header modal KYC */}
            <div style={{ background: "linear-gradient(135deg,#1e3a8a,#4f46e5)", borderRadius: "20px 20px 0 0", padding: "20px 24px", color: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {kycDetailUser.profilePhoto
                    ? <img src={kycDetailUser.profilePhoto} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.4)" }} />
                    : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>👤</div>
                  }
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{kycDetailUser.firstName} {kycDetailUser.lastName}</div>
                    <div style={{ fontSize: ".82rem", opacity: .8, marginTop: 2 }}>{kycDetailUser.email || "—"} · {kycDetailUser.phone || "—"}</div>
                    <div style={{ fontSize: ".75rem", opacity: .65, marginTop: 2 }}>
                      Rôle : <strong>{kycDetailUser.role}</strong> · Inscrit le {kycDetailUser.createdAt ? new Date(kycDetailUser.createdAt).toLocaleDateString("fr-FR") : "—"}
                    </div>
                  </div>
                </div>
                <button onClick={() => setKycDetailUser(null)} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#fff", fontSize: "1.1rem", cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Indicateurs rapides */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { l: "Score KYC",      v: `${kycDetailUser.kycScore ?? 0}/100`,      color: (kycDetailUser.kycScore ?? 0) >= 70 ? "#16a34a" : "#ef4444" },
                  { l: "OCR Confiance",  v: `${kycDetailUser.kycOcrData?.ocrConfidence ?? 0}%`, color: "#6366f1" },
                  { l: "Face match",     v: kycDetailUser.kycFaceMatchScore !== null ? `${kycDetailUser.kycFaceMatchScore}%` : "—", color: "#f59e0b" },
                  { l: "Badge KYC",      v: kycDetailUser.kycBadge || "—",              color: "#0f1b3f" },
                ].map(({ l, v, color }) => (
                  <div key={l} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1.5px solid #e2e8f0" }}>
                    <div style={{ fontSize: ".68rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
                    <div style={{ fontSize: "1rem", fontWeight: 900, color, marginTop: 3 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Infos contact */}
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", color: "#334155" }}>
                <div><span style={{ color: "#94a3b8" }}>Email </span>{kycDetailUser.email ? <>{kycDetailUser.email} {kycDetailUser.emailVerified ? "✅" : "❌"}</> : "—"}</div>
                <div><span style={{ color: "#94a3b8" }}>Tél. </span>{kycDetailUser.phone ? <>{kycDetailUser.phone} {kycDetailUser.phoneVerified ? "✅" : "❌"}</> : "—"}</div>
                <div><span style={{ color: "#94a3b8" }}>Rôle </span>{kycDetailUser.role}</div>
                <div><span style={{ color: "#94a3b8" }}>Soumis </span>{kycDetailUser.kycSubmittedAt ? new Date(kycDetailUser.kycSubmittedAt).toLocaleDateString("fr-FR") : "—"}</div>
              </div>

              {/* Chargement des documents complets (photos recto/verso/selfie/permis) */}
              {kycDetailLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginBottom: 14, color: "#64748b", fontSize: ".85rem" }}>
                  <div className={styles.spinner} style={{ width: 18, height: 18 }} />
                  Chargement des documents soumis…
                </div>
              )}

              {/* Données OCR */}
              {kycDetailUser.kycOcrData && (
                <div style={{ background: "#f5f3ff", border: "1.5px solid #c4b5fd", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: ".86rem", color: "#3730a3" }}>
                  <strong style={{ display: "block", marginBottom: 8 }}>📄 Données OCR du document</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                    {kycDetailUser.kycOcrData.firstName      && <div><span style={{ opacity: .7 }}>Prénom </span><strong>{kycDetailUser.kycOcrData.firstName}</strong></div>}
                    {kycDetailUser.kycOcrData.lastName       && <div><span style={{ opacity: .7 }}>Nom </span><strong>{kycDetailUser.kycOcrData.lastName}</strong></div>}
                    {kycDetailUser.kycOcrData.documentNumber && <div><span style={{ opacity: .7 }}>N° </span><strong style={{ fontFamily: "monospace" }}>{kycDetailUser.kycOcrData.documentNumber}</strong></div>}
                    {kycDetailUser.kycOcrData.issuingCountry && <div><span style={{ opacity: .7 }}>Pays </span><strong>{kycDetailUser.kycOcrData.issuingCountry}</strong></div>}
                    {kycDetailUser.kycOcrData.expiryDate     && <div><span style={{ opacity: .7 }}>Expire </span><strong>{new Date(kycDetailUser.kycOcrData.expiryDate).toLocaleDateString("fr-FR")}</strong></div>}
                    {kycDetailUser.kycOcrData.gender         && <div><span style={{ opacity: .7 }}>Sexe </span><strong>{kycDetailUser.kycOcrData.gender === "M" ? "Masculin" : "Féminin"}</strong></div>}
                  </div>
                </div>
              )}

              {/* ── Documents réels (recto, verso, selfie) ── */}
              {(kycDetailUser.identity?.frontImage || kycDetailUser.identity?.backImage || kycDetailUser.identity?.selfie) && (
                <div style={{ marginBottom: 16 }}>
                  <strong style={{ fontSize: ".82rem", color: "#0f1b3f", display: "block", marginBottom: 10 }}>
                    📄 Documents soumis — {kycDetailUser.identity?.type?.toUpperCase() || "PIÈCE D'IDENTITÉ"}
                  </strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {[
                      { label: "Recto", img: kycDetailUser.identity?.frontImage },
                      { label: "Verso", img: kycDetailUser.identity?.backImage },
                      { label: "Selfie", img: kycDetailUser.identity?.selfie },
                    ].map(({ label, img }) => (
                      <div key={label} style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#f8fafc" }}>
                        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#64748b", padding: "6px 10px", background: "#f1f5f9", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                        {img ? (
                          <a href={safeImgHref(img)} target="_blank" rel="noreferrer noopener">
                            <img src={img} alt={label} loading="lazy" decoding="async" style={{ width: "100%", maxHeight: 120, objectFit: "cover", display: "block" }}
                              onError={(e) => { e.target.style.display = "none"; }} />
                          </a>
                        ) : (
                          <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: ".8rem" }}>Non fourni</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!kycDetailLoading && !(kycDetailUser.identity?.frontImage || kycDetailUser.identity?.backImage || kycDetailUser.identity?.selfie) && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#dc2626" }}>
                  ⚠️ Aucune pièce d'identité soumise par cet utilisateur.
                </div>
              )}

              {/* ── Permis de conduire (si disponible) ── */}
              {(kycDetailUser.driverLicenseOcr?.frontImage || kycDetailUser.driverLicenseOcr?.backImage) && (
                <div style={{ marginBottom: 16 }}>
                  <strong style={{ fontSize: ".82rem", color: "#0f1b3f", display: "block", marginBottom: 10 }}>🚗 Permis de conduire</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Recto permis", img: kycDetailUser.driverLicenseOcr?.frontImage },
                      { label: "Verso permis",  img: kycDetailUser.driverLicenseOcr?.backImage },
                    ].map(({ label, img }) => img && (
                      <div key={label} style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#64748b", padding: "6px 10px", background: "#f1f5f9" }}>{label}</div>
                        <a href={img} target="_blank" rel="noreferrer">
                          <img src={img} alt={label} loading="lazy" decoding="async" style={{ width: "100%", maxHeight: 100, objectFit: "cover", display: "block" }} />
                        </a>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: ".78rem", color: "#475569", background: "#f8fafc", borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
                    N° : {kycDetailUser.driverLicenseOcr?.licenseNumber || "—"} · Catégories : {kycDetailUser.driverLicenseOcr?.categories || "—"} · Expire : {kycDetailUser.driverLicenseOcr?.expiryDate ? new Date(kycDetailUser.driverLicenseOcr.expiryDate).toLocaleDateString("fr-FR") : "—"}
                    {kycDetailUser.driverLicenseOcr?.isExpired && <span style={{ color: "#ef4444", fontWeight: 700 }}> ⚠️ EXPIRÉ</span>}
                  </div>
                </div>
              )}

              {/* ── Infos entreprise (si partenaire) ── */}
              {kycDetailUser.business?.companyName && (
                <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                  <strong style={{ fontSize: ".82rem", color: "#1e40af", display: "block", marginBottom: 6 }}>🏢 Entreprise partenaire</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 16px", fontSize: ".82rem", color: "#1e3a8a" }}>
                    <div><span style={{ opacity: .7 }}>Société </span><strong>{kycDetailUser.business.companyName}</strong></div>
                    <div><span style={{ opacity: .7 }}>RCCM </span>{kycDetailUser.business.rccm || "—"}</div>
                    <div><span style={{ opacity: .7 }}>NIF </span>{kycDetailUser.business.taxId || "—"}</div>
                    <div><span style={{ opacity: .7 }}>Adresse </span>{kycDetailUser.business.address || "—"}</div>
                  </div>
                </div>
              )}

              {/* Raison du rejet précédent */}
              {kycDetailUser.kycRejectionReason && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#dc2626" }}>
                  <strong>⚠️ Dernier motif de refus :</strong> {kycDetailUser.kycRejectionReason}
                </div>
              )}
              {kycDetailUser.kycReviewNote && (
                <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".82rem", color: "#92400e" }}>
                  <strong>📝 Note de révision :</strong> {kycDetailUser.kycReviewNote}
                </div>
              )}

              {/* Journal d'audit */}
              {kycDetailUser.kycAuditLog?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <strong style={{ fontSize: ".82rem", color: "#475569", display: "block", marginBottom: 8 }}>📋 Historique des actions</strong>
                  <div style={{ maxHeight: 110, overflowY: "auto", border: "1.5px solid #e2e8f0", borderRadius: 8 }}>
                    {kycDetailUser.kycAuditLog.slice().reverse().map((log, i) => (
                      <div key={i} style={{ fontSize: ".77rem", color: "#64748b", padding: "7px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span><span style={{ fontWeight: 700, color: "#334155" }}>{log.action}</span>{log.note && ` — ${log.note}`}</span>
                        <span style={{ flexShrink: 0, color: "#94a3b8" }}>{new Date(log.timestamp).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Décision */}
              <div style={{ borderTop: "1.5px solid #e2e8f0", paddingTop: 16 }}>
                <strong style={{ fontSize: ".88rem", color: "#0f1b3f", display: "block", marginBottom: 12 }}>Décision administrative</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { v: "VERIFIE",               l: "✅ Approuver",    col: "#059669", bg: kycReviewForm.decision === "VERIFIE" ? "#d1fae5" : "#f8fafc" },
                    { v: "REFUSE",                l: "❌ Refuser",      col: "#dc2626", bg: kycReviewForm.decision === "REFUSE" ? "#fee2e2" : "#f8fafc" },
                    { v: "A_REVOIR_MANUELLEMENT", l: "🔍 En révision",  col: "#2563eb", bg: kycReviewForm.decision === "A_REVOIR_MANUELLEMENT" ? "#dbeafe" : "#f8fafc" },
                    { v: "EN_ATTENTE",            l: "⏳ Remettre en attente", col: "#d97706", bg: kycReviewForm.decision === "EN_ATTENTE" ? "#fef3c7" : "#f8fafc" },
                  ].map(({ v, l, col, bg }) => (
                    <button key={v}
                      style={{ padding: "10px 8px", borderRadius: 9, border: `2px solid ${kycReviewForm.decision === v ? col : "#e2e8f0"}`, fontSize: ".82rem", fontWeight: 700, cursor: "pointer", background: bg, color: kycReviewForm.decision === v ? col : "#64748b", fontFamily: "inherit" }}
                      onClick={() => setKycReviewForm((f) => ({ ...f, decision: v }))}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Note interne ou raison du refus (visible dans le journal)"
                  value={kycReviewForm.note}
                  onChange={(e) => setKycReviewForm((f) => ({ ...f, note: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", fontFamily: "inherit", resize: "vertical", minHeight: 68, marginBottom: 12, boxSizing: "border-box" }}
                />
                {kycReviewMsg && (
                  <p style={{ fontSize: ".85rem", color: kycReviewMsg.startsWith("✅") ? "#059669" : "#dc2626", fontWeight: 600, marginBottom: 10 }}>{kycReviewMsg}</p>
                )}
                <button
                  style={{ width: "100%", padding: "12px", borderRadius: 10, background: kycReviewLoading ? "#94a3b8" : "#6366f1", color: "#fff", border: "none", fontWeight: 800, fontSize: ".95rem", cursor: kycReviewLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                  onClick={() => handleKycReview(kycDetailUser._id)} disabled={kycReviewLoading}
                >
                  {kycReviewLoading ? "Enregistrement…" : "Valider la décision"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
