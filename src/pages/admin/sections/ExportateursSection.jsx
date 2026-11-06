import { Badge, StatCard, fmtDate, ieListingIncotermLabel } from "../shared.jsx";
import styles from "../../AdminPanel.module.css";
import { CheckCircle2, Globe, Hourglass, MapPin, Package, Pencil, XCircle, Eye, Megaphone } from "lucide-react";

// Onglet « Partenaires Export » — extrait d'AdminPanel.jsx le 2026-11-02, à l'identique :
// l'état et les actions restent dans le panneau, passés ici en propriétés.
export default function ExportateursSection({
  filteredImporterListings, filteredImporterProfiles, headers, importerFilter, importerListingCountryOptions, importerListingVilleOptions,
  importerListings, importerListingsTotal, importerLoading, importerProfiles, listingCountryFilter, listingFilter,
  listingVilleFilter, loadImporters, loadMoreImporterListings, openEditIeListing, setExporterDetail, setImporterFilter,
  setListingCountryFilter, setListingFilter, setListingRejectModal, setListingRejectNote, setListingVilleFilter, setReviewDecision,
  setReviewModal, showToast,
}) {
  return (
    <div className={styles.tabContent}>
      <div className={styles.uiEnteteSection}>
        <h2 className={styles.uiTitre}>
          <Package size={16} aria-hidden="true" /> Partenaires Exportateurs — Dossiers & Annonces d'Export
        </h2>
        <button className={styles.btnRefresh} onClick={loadImporters}>↻ Actualiser</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 14, marginBottom: "1.5rem" }}>
        {[
          { icon: <Package size={16} aria-hidden="true" />, label: "Total exportateurs",  value: importerProfiles.length, color: "#6366f1" },
          { icon: <Hourglass size={16} aria-hidden="true" />, label: "En attente",          value: importerProfiles.filter(p => p.status === "pending").length,  color: "#f59e0b" },
          { icon: <CheckCircle2 size={16} aria-hidden="true" />, label: "Vérifiés",            value: importerProfiles.filter(p => p.status === "verified").length, color: "#10b981" },
          { icon: <XCircle size={16} aria-hidden="true" />, label: "Refusés",             value: importerProfiles.filter(p => p.status === "rejected").length, color: "#ef4444" },
          { icon: <Globe size={16} aria-hidden="true" />, label: "Annonces export att.", value: importerListings.filter(l => l.status === "pending").length, color: "#f59e0b" },
        ].map((k) => (
          <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} color={k.color} />
        ))}
      </div>

      {/* ── SECTION 1 : Candidatures ── */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}><Package size={16} aria-hidden="true" /> Dossiers partenaires exportateurs</h3>
          <select
            className={styles.filterSelect}
            value={importerFilter}
            onChange={(e) => setImporterFilter(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
          >
            <option value="">Tous</option>
            <option value="pending">En attente</option>
            <option value="verified">Vérifiés</option>
            <option value="rejected">Refusés</option>
            <option value="suspended">Suspendus</option>
          </select>
        </div>

        {importerLoading ? (
          <div className={styles.loadingBox} style={{ minHeight: 100 }}>
            <div className={styles.spinner} /><p>Chargement...</p>
          </div>
        ) : filteredImporterProfiles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>🏅</div>
            <p style={{ margin: 0 }}>Aucune candidature pour ce filtre.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Partenaire</th>
                  <th>Entreprise</th>
                  <th>RCCM / NIF</th>
                  <th>Activités</th>
                  <th>Statut</th>
                  <th>Soumis le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredImporterProfiles.map((p) => {
                  const stCfg = {
                    pending:   { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
                    verified:  { label: "Vérifié",    color: "#10b981", bg: "#ecfdf5" },
                    rejected:  { label: "Refusé",     color: "#ef4444", bg: "#fef2f2" },
                    suspended: { label: "Suspendu",   color: "#ef4444", bg: "#fef2f2" },
                  }[p.status] || { label: p.status, color: "#94a3b8", bg: "#f8fafc" };
                  const u = p.userId;
                  return (
                    <tr key={p._id} className={styles.tr}>
                      <td>
                        <strong>{u?.firstName} {u?.lastName}</strong>
                        <span className={styles.vehMeta}>{u?.email}</span>
                      </td>
                      <td>
                        <strong style={{ fontSize: ".85rem" }}>{p.companyName}</strong>
                        <span className={styles.vehMeta}>{p.city}, {p.country}</span>
                      </td>
                      <td style={{ fontSize: ".82rem" }}>
                        <div>RCCM: {p.rccm || "—"}</div>
                        <div>NIF: {p.taxId || "—"}</div>
                      </td>
                      <td style={{ fontSize: ".8rem", color: "#475569" }}>
                        {(p.activityType || []).join(", ") || "—"}
                      </td>
                      <td>
                        <Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} />
                        {p.badgeLevel && p.badgeLevel !== "none" && (
                          <span style={{ marginLeft: 4, fontSize: ".75rem" }}>
                            {p.badgeLevel === "silver" ? "🥈" : p.badgeLevel === "gold" ? "🥇" : "💎"}
                          </span>
                        )}
                      </td>
                      <td className={styles.tdDate}>{fmtDate(p.submittedAt)}</td>
                      <td>
                        <div className={styles.actionBtns}>
                          {/* Visualiser le dossier complet */}
                          <button
                            title="Voir le dossier complet"
                            // La liste ne porte plus `documents` (base64,
                            // jusqu'à 5 Mo par profil — la réponse échouait
                            // après 90 s). La fiche complète est chargée à
                            // l'ouverture ; le dossier s'affiche d'abord
                            // avec ce qu'on a déjà, puis se complète.
                            onClick={async () => {
                              setExporterDetail(p);
                              try {
                                const r = await fetch(`/api/import-export/importer-profiles/${p._id}`, { headers });
                                const d = await r.json().catch(() => null);
                                const complet = d?.profile || d;
                                if (r.ok && complet?._id) setExporterDetail(complet);
                              } catch { /* la fiche reste affichée sans les pièces */ }
                            }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, background: "#eff6ff", color: "#2563eb", border: "1.5px solid #bfdbfe", borderRadius: 6, cursor: "pointer" }}>
                            <Eye size={16} aria-hidden="true" /> Visualiser
                          </button>
                          {/* Approuver / refuser */}
                          {p.status !== "verified" && (
                            <button className={styles.btnApprove}
                              onClick={() => { setReviewModal(p); setReviewDecision({ status: "verified", rejectionReason: "", badgeLevel: "silver" }); }}>
                              <CheckCircle2 size={16} aria-hidden="true" /> Valider
                            </button>
                          )}
                          {p.status !== "rejected" && (
                            <button className={styles.btnReject}
                              onClick={() => { setReviewModal(p); setReviewDecision({ status: "rejected", rejectionReason: "", badgeLevel: "none" }); }}>
                              ✕ Rejeter
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

      {/* ── SECTION 2 : Annonces import/export ── */}
      <div className={styles.chartCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 className={styles.chartTitle} style={{ margin: 0 }}><Megaphone size={16} aria-hidden="true" /> Annonces Import/Export</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={listingFilter}
              onChange={(e) => setListingFilter(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
            >
              <option value="">Toutes</option>
              <option value="pending">En attente</option>
              <option value="approved">Publiées</option>
              <option value="rejected">Refusées</option>
            </select>
            <select
              value={listingCountryFilter}
              onChange={(e) => setListingCountryFilter(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
            >
              <option value="">Tous les pays</option>
              {importerListingCountryOptions.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
            <select
              value={listingVilleFilter}
              onChange={(e) => setListingVilleFilter(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".82rem" }}
            >
              <option value="">Toutes les villes</option>
              {importerListingVilleOptions.map((ville) => (
                <option key={ville} value={ville}>{ville}</option>
              ))}
            </select>
          </div>
        </div>
        {importerLoading ? (
          <div className={styles.loadingBox} style={{ minHeight: 80 }}><div className={styles.spinner} /></div>
        ) : filteredImporterListings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
            <p style={{ margin: 0 }}>Aucune annonce pour ce filtre.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Annonce</th>
                  <th>Partenaire</th>
                  <th>Source</th>
                  <th>Incoterm</th>
                  <th>Prix</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredImporterListings.map((l) => {
                  const stCfg = {
                    pending:  { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
                    approved: { label: "Publiée",    color: "#10b981", bg: "#ecfdf5" },
                    rejected: { label: "Refusée",    color: "#ef4444", bg: "#fef2f2" },
                  }[l.status] || { label: l.status, color: "#94a3b8", bg: "#f8fafc" };
                  return (
                    <tr key={l._id} className={styles.tr}>
                      <td>
                        <strong style={{ fontSize: ".85rem" }}>{l.title}</strong>
                        <span className={styles.vehMeta}>{l.make} {l.model} {l.year} · {l.condition}</span>
                      </td>
                      <td style={{ fontSize: ".82rem" }}>
                        {l.partner?.firstName} {l.partner?.lastName}
                        <span className={styles.vehMeta}>{l.importerProfile?.companyName}</span>
                      </td>
                      <td style={{ fontSize: ".82rem" }}>{l.sourceCountry}</td>
                      <td style={{ fontSize: ".82rem" }}>
                        {l.incoterm
                          ? <span title={ieListingIncotermLabel(l.incoterm)} style={{ fontSize: ".72rem", fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}><Package size={16} aria-hidden="true" /> {l.incoterm}</span>
                          : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td className={styles.tdPrice}>
                        {l.price ? `${Number(l.price).toLocaleString("fr-FR")} ${l.currency}` : "—"}
                      </td>
                      <td><Badge label={stCfg.label} color={stCfg.color} bg={stCfg.bg} /></td>
                      <td className={styles.tdDate}>{fmtDate(l.createdAt)}</td>
                      <td>
                        <div className={styles.actionBtns}>
                          <button className={styles.btnGhost} style={{ fontSize: ".78rem" }}
                            onClick={() => openEditIeListing(l._id)}><Pencil size={16} aria-hidden="true" /> Modifier</button>
                          {l.status === "pending" && (
                            <>
                              <button className={styles.btnApprove}
                                onClick={async () => {
                                  const r = await fetch(`/api/import-export/listings/${l._id}/status`, {
                                    method: "PATCH", headers,
                                    body: JSON.stringify({ status: "approved" }),
                                  });
                                  if (r.ok) { showToast("Annonce publiée !"); loadImporters(); }
                                  else showToast("Erreur lors de la publication.", "error");
                                }}><CheckCircle2 size={16} aria-hidden="true" /> Publier</button>
                              <button className={styles.btnReject}
                                onClick={() => { setListingRejectModal(l); setListingRejectNote(""); }}>
                                ✕ Refuser</button>
                            </>
                          )}
                          {l.status === "approved" && (
                            <button className={styles.btnReject}
                              onClick={async () => {
                                const r = await fetch(`/api/import-export/listings/${l._id}/status`, {
                                  method: "PATCH", headers,
                                  body: JSON.stringify({ status: "archived" }),
                                });
                                if (r.ok) { showToast("Annonce archivée."); loadImporters(); }
                                else showToast("Erreur lors de l'archivage.", "error");
                              }}>Archiver</button>
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
        {/* Bug réel corrigé (audit) : plafond de 100 annonces IE
            chargées, invisible pour l'admin — voir loadMoreImporterListings. */}
        {importerListings.length < importerListingsTotal && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <p style={{ fontSize: ".8rem", color: "#94a3b8", marginBottom: 6 }}>{importerListings.length} chargées sur {importerListingsTotal} au total</p>
            <button onClick={loadMoreImporterListings}
              style={{ padding: "6px 16px", borderRadius: 10, border: "1.5px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
              Charger plus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
