import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { getCountryFlag } from "../data/autocomplete";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import styles from "./IEListingDetail.module.css";

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const FUEL_LABELS = {
  essence: "Essence", diesel: "Diesel", hybride: "Hybride",
  hybride_rechargeable: "Hybride rechargeable", electrique: "Électrique",
  gpl: "GPL", gaz: "Gaz", autre: "Autre",
};
const TRANS_LABELS = {
  manuelle: "Manuelle", automatique: "Automatique", cvt: "CVT", semi_automatique: "Semi-auto",
};
const COND_LABELS = {
  neuf: "Neuf", occasion: "Occasion", reconditionne: "Reconditionné",
};
const RATING_LABEL = { excellent: "Excellent", bon: "Bon", moyen: "Moyen", mauvais: "Mauvais", na: "N/A" };
const RATING_COLOR = { excellent: "#10b981", bon: "#3b82f6", moyen: "#f59e0b", mauvais: "#ef4444", na: "#94a3b8" };
const BADGE_CFG   = { silver: "🥈 Silver", gold: "🥇 Gold", platinum: "💎 Platinum", none: "" };
const PAYMENT_METHOD_LABELS = {
  carte: "💳 Carte bancaire", virement: "🏦 Virement bancaire", mobile_money: "📱 Mobile Money",
  crypto: "₿ Cryptomonnaie", lc: "📄 Lettre de crédit (L/C)", cash: "💵 Espèces à la livraison",
};

// ── Composant galerie photos ───────────────────────────────────────────────
function Gallery({ photos, mainPhoto, title }) {
  const [active, setActive] = useState(0);
  const safePhotos = photos || [];
  const all = mainPhoto && !safePhotos.includes(mainPhoto) ? [mainPhoto, ...safePhotos] : safePhotos;

  if (!all.length) {
    return <div className={styles.galleryFallback}><span>🚗</span><p>{title}</p></div>;
  }
  return (
    <div className={styles.gallery}>
      <div className={styles.galleryMain}>
        <img src={all[active]} alt={title} />
        {all.length > 1 && (
          <>
            <button className={`${styles.galleryArrow} ${styles.galleryArrowLeft}`}
              onClick={() => setActive((i) => (i - 1 + all.length) % all.length)}>‹</button>
            <button className={`${styles.galleryArrow} ${styles.galleryArrowRight}`}
              onClick={() => setActive((i) => (i + 1) % all.length)}>›</button>
            <div className={styles.galleryCounter}>{active + 1} / {all.length}</div>
          </>
        )}
      </div>
      {all.length > 1 && (
        <div className={styles.galleryThumbs}>
          {all.map((src, i) => (
            <button key={i} className={`${styles.galleryThumb} ${i === active ? styles.galleryThumbActive : ""}`}
              onClick={() => setActive(i)}>
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rapport d'inspection ───────────────────────────────────────────────────
function InspectionSection({ listingId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/import-export/listings/${listingId}/inspection-report`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setReport(d?.report || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [listingId]);

  if (loading) return <div className={styles.card}><p className={styles.loading}>Chargement du rapport…</p></div>;
  if (!report) return (
    <div className={styles.card}>
      <div className={styles.sectionHeader}><span>🔍</span><h3>Rapport d'inspection</h3></div>
      <p className={styles.noReport}>Rapport en cours de préparation par le fournisseur.</p>
    </div>
  );

  const components = [
    { key: "engine",       label: "Moteur",        icon: "⚙️" },
    { key: "transmission", label: "Boîte de vitesses", icon: "🔧" },
    { key: "suspension",   label: "Suspension",    icon: "🛞" },
    { key: "brakes",       label: "Freins",        icon: "🛑" },
    { key: "tires",        label: "Pneus",         icon: "⬛" },
    { key: "bodywork",     label: "Carrosserie",   icon: "🚗" },
    { key: "interior",     label: "Intérieur",     icon: "🪑" },
    { key: "electronics",  label: "Électronique",  icon: "💡" },
    { key: "battery",      label: "Batterie (VE)", icon: "🔋" },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.sectionHeader}>
        <span>🔍</span><h3>Rapport d'inspection fournisseur</h3>
        <div className={styles.overallBadge} style={{ background: RATING_COLOR[report.overallRating] + "22", color: RATING_COLOR[report.overallRating] }}>
          {RATING_LABEL[report.overallRating]}
        </div>
      </div>

      <div className={styles.inspMeta}>
        {report.inspectorName && <span>👤 {report.inspectorName}</span>}
        {report.inspectionDate && <span>📅 {fmtDate(report.inspectionDate)}</span>}
        {report.inspectionLocation && <span>📍 {report.inspectionLocation}</span>}
      </div>

      <div className={styles.inspGrid}>
        {components.map(({ key, label, icon }) => {
          const comp = report[key];
          if (!comp || comp.rating === "na") return null;
          return (
            <div key={key} className={styles.inspItem}>
              <span className={styles.inspIcon}>{icon}</span>
              <div>
                <p className={styles.inspLabel}>{label}</p>
                <span className={styles.inspRating} style={{ color: RATING_COLOR[comp.rating] }}>
                  {RATING_LABEL[comp.rating]}
                </span>
                {comp.notes && <p className={styles.inspNotes}>{comp.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {report.overallNotes && (
        <div className={styles.overallNotes}>
          <strong>Observations générales :</strong>
          <p>{report.overallNotes}</p>
        </div>
      )}

      {report.defects?.length > 0 && (
        <div className={styles.defects}>
          <button className={styles.defectsToggle} onClick={() => setOpen((o) => !o)}>
            ⚠️ {report.defects.length} défaut(s) signalé(s) {open ? "▲" : "▼"}
          </button>
          {open && (
            <div className={styles.defectsList}>
              {report.defects.map((d, i) => (
                <div key={i} className={styles.defectItem}>
                  <span className={styles.defectSeverity} data-severity={d.severity}>
                    {d.severity === "majeur" ? "🔴" : d.severity === "modere" ? "🟡" : "🟢"} {d.severity}
                  </span>
                  <p>{d.description}</p>
                  {d.photo && <img src={d.photo} alt="défaut" className={styles.defectPhoto} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {report.photos?.length > 0 && (
        <div className={styles.inspPhotos}>
          {report.photos.map((src, i) => (
            <img key={i} src={src} alt={`Inspection ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Calculateur du coût total d'importation (Import Cost Engine) ───────────
// Estimation instantanée (niveau 1 — voir demande produit) : le client choisit
// un pays de destination (parmi ceux déclarés par le partenaire) et voit tout
// de suite le détail transport/fret/assurance/douanes/livraison/commission.
// Rien n'est verrouillé ici — seule l'offre finale du fournisseur fait foi.
const COST_LINE_LABELS = {
  vehiclePrice: "Prix du véhicule", inlandTransport: "Transport intérieur",
  seaFreight: "Fret maritime", insurance: "Assurance maritime",
  portFees: "Frais portuaires", customs: "Douanes / transit",
  delivery: "Livraison finale", commission: "Frais de service VIT AUTO",
};
function ImportCostCalculator({ listingId, availableIn }) {
  const { fmtFromCurrency } = useCurrency();
  const [destCountry, setDestCountry] = useState(availableIn?.[0] || "");
  const [destCity, setDestCity]       = useState("");
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  const compute = async () => {
    if (!destCountry) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const params = new URLSearchParams({ destCountry });
      if (destCity) params.set("destCity", destCity);
      const res = await fetch(`/api/import-cost/listings/${listingId}/estimate?${params}`);
      const d = await res.json();
      if (!res.ok || !d.available) { setError(d.message || "Estimation indisponible pour cette destination."); return; }
      setResult(d);
    } catch { setError("Erreur réseau."); }
    finally { setLoading(false); }
  };

  if (!availableIn?.length) return null;

  return (
    <div className={styles.card}>
      <div className={styles.sectionHeader}><span>🧮</span><h3>Calculateur du coût total d'importation</h3></div>
      <p style={{ fontSize: ".85rem", color: "#64748b", margin: "0 0 14px" }}>
        Estimation instantanée — transport, fret, assurance, douanes et livraison inclus. Le montant définitif sera confirmé dans l'offre du fournisseur.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={destCountry} onChange={(e) => setDestCountry(e.target.value)}
          style={{ flex: "1 1 200px", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }}>
          {availableIn.map((c) => <option key={c} value={c}>{getCountryFlag(c)} {c}</option>)}
        </select>
        <input value={destCity} onChange={(e) => setDestCity(e.target.value)} placeholder="Ville d'arrivée (optionnel)"
          style={{ flex: "1 1 160px", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem" }} />
        <button onClick={compute} disabled={loading || !destCountry}
          style={{ padding: "9px 18px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Calcul…" : "Calculer"}
        </button>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: ".85rem" }}>❌ {error}</p>}

      {result && (
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", border: "1.5px solid #e2e8f0" }}>
          {Object.entries(result.breakdown).map(([key, value]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem", padding: "5px 0", borderBottom: "1px solid #eef1f8" }}>
              <span style={{ color: "#475569" }}>{COST_LINE_LABELS[key] || key}</span>
              <strong>{fmtFromCurrency(value, result.currency)}</strong>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", fontWeight: 900, paddingTop: 10, marginTop: 4, color: "#0f1b3f" }}>
            <span>Total à payer</span>
            <span>{fmtFromCurrency(result.grandTotal, result.currency)}</span>
          </div>
          {!result.laneConfigured && (
            <p style={{ fontSize: ".72rem", color: "#94a3b8", margin: "8px 0 0" }}>
              Fret estimé sur une base générique (aucune liaison exacte configurée pour cette route).
            </p>
          )}
          {result.ageSurchargeApplied && (
            <p style={{ fontSize: ".72rem", color: "#d97706", margin: "8px 0 0" }}>
              ⚠️ Surtaxe douanière appliquée — véhicule au-delà de l'âge seuil pour ce pays.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formulaire de réservation ──────────────────────────────────────────────
function ReservationModal({ listing, onClose, onSuccess }) {
  const { token } = useAuth();
  const [form, setForm] = useState({ destCountry: "", destCity: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/import-export/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: listing._id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      onSuccess(data.transaction);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>

        <div className={styles.modalHeader}>
          <span className={styles.modalBadge}>🆓 RÉSERVATION GRATUITE</span>
          <h2>Réserver ce véhicule</h2>
          <p className={styles.modalSub}>{listing.title}</p>
        </div>

        <div className={styles.modalInfo}>
          <div className={styles.infoBox}>
            <span>✅</span>
            <div>
              <strong>Réservation sans frais</strong>
              <p>Le véhicule sera marqué comme réservé pendant 72h. Aucun paiement n'est requis à cette étape.</p>
            </div>
          </div>
          <div className={styles.infoBox}>
            <span>🔒</span>
            <div>
              <strong>Processus sécurisé</strong>
              <p>Votre paiement sera effectué uniquement après confirmation du fournisseur et validation de l'offre finale.</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className={styles.reserveForm}>
          <div className={styles.formRow}>
            <label>
              <span>Pays de destination *</span>
              <input
                value={form.destCountry}
                onChange={(e) => set("destCountry", e.target.value)}
                placeholder="Ex : Côte d'Ivoire, Sénégal…"
                required
              />
            </label>
            <label>
              <span>Ville</span>
              <input
                value={form.destCity}
                onChange={(e) => set("destCity", e.target.value)}
                placeholder="Ex : Abidjan, Dakar…"
              />
            </label>
          </div>
          <label className={styles.formFull}>
            <span>Message au fournisseur (optionnel)</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Précisez vos attentes, questions sur le véhicule…"
            />
          </label>
          {error && <p className={styles.formError}>❌ {error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Annuler</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? "Réservation en cours…" : "Confirmer la réservation gratuite →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════
export default function IEListingDetail() {
  const { id }        = useParams();
  const navigate      = useNavigate();
  const { user, token } = useAuth();
  const { fmtFromCurrency } = useCurrency();

  const [listing,     setListing]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showReserve, setShowReserve] = useState(false);
  const [activeTab,   setActiveTab]   = useState("details");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/import-export/listings/${id}`);
      if (!res.ok) throw new Error("Annonce introuvable.");
      const d = await res.json();
      setListing(d.listing);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Aperçu WhatsApp/Facebook spécifique à CETTE annonce — sans ce hook, le lien
  // partagé affiche toujours le titre/l'image génériques de la page d'accueil
  // (voir hooks/useDocumentMeta.js).
  useDocumentMeta(listing ? {
    title:       listing.title,
    description: listing.description,
    image:       listing.mainPhoto || listing.photos?.[0],
    url:         `https://vit-auto.com/import-export/listings/${id}`,
  } : {});

  const handleReservationSuccess = (transaction) => {
    setShowReserve(false);
    navigate(`/import-export/transaction/${transaction._id}`);
  };

  const handleReserveClick = () => {
    if (!user) { navigate("/login", { state: { from: { pathname: `/import-export/listings/${id}` } } }); return; }
    setShowReserve(true);
  };

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <p>Chargement de l'annonce…</p>
      </div>
    </div>
  );

  if (error || !listing) return (
    <div className={styles.page}>
      <div className={styles.errorWrap}>
        <span>😕</span>
        <h2>Annonce introuvable</h2>
        <p>{error}</p>
        <Link to="/import-export/listings" className={styles.btnPrimary}>← Retour aux annonces</Link>
      </div>
    </div>
  );

  const badge = BADGE_CFG[listing.importerProfile?.badgeLevel || "none"];

  return (
    <div className={styles.page}>
      {/* ── Breadcrumb ── */}
      <div className={styles.breadcrumb}>
        <Link to="/">Accueil</Link>
        <span>/</span>
        <Link to="/import-export">Import / Export</Link>
        <span>/</span>
        <Link to="/import-export/listings">Annonces</Link>
        <span>/</span>
        <span>{listing.title}</span>
      </div>

      <div className={styles.layout}>
        {/* ── Colonne principale ── */}
        <div className={styles.main}>

          {/* Galerie */}
          <Gallery photos={listing.photos} mainPhoto={listing.mainPhoto} title={listing.title} />

          {/* En-tête véhicule */}
          <div className={styles.card}>
            <div className={styles.listingHeader}>
              <div>
                <h1 className={styles.title}>{listing.title}</h1>
                <div className={styles.metaRow}>
                  <span className={styles.badgePill}>🌍 Import/Export</span>
                  <span className={styles.origin}>{getCountryFlag(listing.sourceCountry)} {listing.sourceCountry}</span>
                  {listing.sourceCity && <span>· {listing.sourceCity}</span>}
                  {badge && <span className={styles.badgePill}>{badge}</span>}
                  <span className={styles.condition}>{COND_LABELS[listing.condition] || listing.condition}</span>
                </div>
              </div>
              <div className={styles.priceBlock}>
                <span className={styles.price}>{fmtFromCurrency(listing.price, listing.currency)}</span>
                {listing.negotiable && <span className={styles.neg}>Négociable</span>}
              </div>
            </div>

            {/* Onglets */}
            <div className={styles.tabs}>
              {["details", "inspection", "transport", "fournisseur"].map((tab) => (
                <button
                  key={tab}
                  className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {{ details: "📋 Détails", inspection: "🔍 Inspection", transport: "🚢 Transport", fournisseur: "🏢 Fournisseur" }[tab]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Onglet Détails ── */}
          {activeTab === "details" && (
            <div className={styles.card}>
              <div className={styles.sectionHeader}><span>📋</span><h3>Caractéristiques</h3></div>
              <div className={styles.specsGrid}>
                <div className={styles.specItem}><span>Marque</span><strong>{listing.make}</strong></div>
                <div className={styles.specItem}><span>Modèle</span><strong>{listing.model}</strong></div>
                <div className={styles.specItem}><span>Année</span><strong>{listing.year}</strong></div>
                <div className={styles.specItem}><span>Kilométrage</span><strong>{listing.mileage?.toLocaleString("fr-FR") || 0} km</strong></div>
                <div className={styles.specItem}><span>Carburant</span><strong>{FUEL_LABELS[listing.fuelType] || listing.fuelType}</strong></div>
                <div className={styles.specItem}><span>Transmission</span><strong>{TRANS_LABELS[listing.transmission] || listing.transmission}</strong></div>
                {listing.bodyType && <div className={styles.specItem}><span>Carrosserie</span><strong>{listing.bodyType}</strong></div>}
                {listing.color    && <div className={styles.specItem}><span>Couleur</span><strong>{listing.color}</strong></div>}
                {listing.vin      && <div className={styles.specItem}><span>VIN</span><strong className={styles.vin}>{listing.vin}</strong></div>}
                <div className={styles.specItem}><span>Stock</span><strong>{listing.stockQty} unité(s)</strong></div>
              </div>

              {listing.description && (
                <div className={styles.description}>
                  <h4>Description</h4>
                  <p>{listing.description}</p>
                </div>
              )}

              {listing.vehicleHistory && (
                <div className={styles.history}>
                  <h4>📜 Historique du véhicule</h4>
                  <p>{listing.vehicleHistory}</p>
                </div>
              )}

              {listing.videoUrl && (() => {
                const ytMatch = listing.videoUrl.match(
                  /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/
                );
                if (!ytMatch) return null;
                return (
                  <div className={styles.videoWrap}>
                    <h4>📹 Vidéo du véhicule</h4>
                    <div className={styles.videoEmbed}>
                      <iframe
                        src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                        title="Vidéo véhicule"
                        allowFullScreen
                      />
                    </div>
                  </div>
                );
              })()}

              {listing.availableIn?.length > 0 && (
                <div className={styles.availability}>
                  <h4>🌍 Livraison disponible vers</h4>
                  <div className={styles.availTags}>
                    {listing.availableIn.map((c) => <span key={c}>{getCountryFlag(c)} {c}</span>)}
                  </div>
                </div>
              )}

              {listing.priceIncludes?.length > 0 && (
                <div className={styles.includes}>
                  <h4>✅ Prix inclut</h4>
                  <ul>{listing.priceIncludes.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {/* ── Onglet Inspection ── */}
          {activeTab === "inspection" && <InspectionSection listingId={id} />}

          {/* ── Onglet Transport ── */}
          {activeTab === "transport" && (
            <div className={styles.card}>
              <div className={styles.sectionHeader}><span>🚢</span><h3>Informations de transport</h3></div>
              <div className={styles.transportGrid}>
                {listing.estimatedShippingCost != null && (
                  <div className={styles.transportItem}>
                    <span>💶</span>
                    <div>
                      <p>Coût de transport estimatif</p>
                      <strong>{fmtFromCurrency(listing.estimatedShippingCost, listing.shippingCostCurrency)}</strong>
                    </div>
                  </div>
                )}
                {listing.estimatedDelay && (
                  <div className={styles.transportItem}>
                    <span>⏱️</span>
                    <div>
                      <p>Délai d'expédition estimé</p>
                      <strong>{listing.estimatedDelay}</strong>
                    </div>
                  </div>
                )}
                {listing.shippingType && (
                  <div className={styles.transportItem}>
                    <span>🚢</span>
                    <div>
                      <p>Type de transport</p>
                      <strong style={{ textTransform: "capitalize" }}>{listing.shippingType}</strong>
                    </div>
                  </div>
                )}
              </div>

              {listing.exportDocumentsAvailable?.length > 0 && (
                <div className={styles.exportDocs}>
                  <h4>📄 Documents disponibles</h4>
                  <div className={styles.docTags}>
                    {listing.exportDocumentsAvailable.map((doc, i) => (
                      <span key={i} className={styles.docTag}>✓ {doc}</span>
                    ))}
                  </div>
                </div>
              )}

              {listing.acceptedPaymentMethods?.length > 0 && (
                <div className={styles.exportDocs}>
                  <h4>💳 Moyens de paiement acceptés</h4>
                  <div className={styles.docTags}>
                    {listing.acceptedPaymentMethods.map((pm, i) => (
                      <span key={i} className={styles.docTag}>{PAYMENT_METHOD_LABELS[pm] || pm}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.transportNote}>
                <span>ℹ️</span>
                <p>Les coûts de transport définitifs seront précisés dans l'offre finale du fournisseur après confirmation de votre destination.</p>
              </div>
            </div>
          )}

          {activeTab === "transport" && (
            <ImportCostCalculator listingId={id} availableIn={listing.availableIn} />
          )}

          {/* ── Onglet Fournisseur ── */}
          {activeTab === "fournisseur" && (
            <div className={styles.card}>
              <div className={styles.sectionHeader}><span>🏢</span><h3>Profil du fournisseur</h3></div>
              <div className={styles.partnerCard}>
                <div className={styles.partnerAvatar}>
                  {listing.partner?.profilePhoto
                    ? <img src={listing.partner.profilePhoto} alt="" />
                    : <span>{listing.partner?.firstName?.[0] || ""}{listing.partner?.lastName?.[0] || ""}</span>
                  }
                </div>
                <div className={styles.partnerInfo}>
                  <h4>{listing.partner?.firstName} {listing.partner?.lastName}</h4>
                  {listing.partner?.business?.name && <p className={styles.company}>{listing.partner.business.name}</p>}
                  {listing.importerProfile?.companyName && <p className={styles.company}>🏢 {listing.importerProfile.companyName}</p>}
                  {badge && <p className={styles.partnerBadge}>{badge} Importateur vérifié VIT AUTO</p>}
                  {listing.importerProfile?.operatingCountries?.length > 0 && (
                    <p className={styles.countries}>🌍 {listing.importerProfile.operatingCountries.slice(0, 5).join(", ")}</p>
                  )}
                </div>
              </div>
              <div className={styles.partnerStats}>
                <div><span>👁️</span><strong>{listing.views || 0}</strong><p>Vues</p></div>
                <div><span>📩</span><strong>{listing.inquiries || 0}</strong><p>Demandes</p></div>
                <div><span>📅</span><strong>{fmtDate(listing.createdAt)}</strong><p>Publié le</p></div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className={styles.sidebar}>
          <div className={styles.stickyCard}>
            <div className={styles.sidePrice}>
              <span className={styles.sidePriceLabel}>Prix</span>
              <span className={styles.sidePriceValue}>{fmtFromCurrency(listing.price, listing.currency)}</span>
              {listing.negotiable && <span className={styles.neg}>Négociable</span>}
            </div>

            {listing.estimatedShippingCost != null && (
              <div className={styles.sideShipping}>
                <span>🚢 Transport estimé</span>
                <strong>{fmtFromCurrency(listing.estimatedShippingCost, listing.shippingCostCurrency)}</strong>
              </div>
            )}

            {listing.estimatedDelay && (
              <div className={styles.sideDelay}>
                <span>⏱️ Délai estimé</span>
                <strong>{listing.estimatedDelay}</strong>
              </div>
            )}

            <button
              className={styles.btnReserve}
              onClick={handleReserveClick}
              disabled={listing.status !== "approved" || listing.stockQty <= 0}
            >
              {listing.stockQty <= 0 ? "Épuisé" : "🆓 Réserver gratuitement"}
            </button>

            <p className={styles.reserveNote}>
              Réservation gratuite · Sans engagement de paiement<br />
              Le fournisseur confirme sous 48h
            </p>

            <div className={styles.sideSteps}>
              <h4>Comment ça marche ?</h4>
              {[
                "Réservation gratuite (sans paiement)",
                "Confirmation du fournisseur",
                "Discussion & inspection (si souhaitée)",
                "Offre finale + paiement sécurisé",
                "Suivi de l'expédition en temps réel",
                "Libération des fonds à la livraison",
              ].map((step, i) => (
                <div key={i} className={styles.sideStep}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>

            <div className={styles.sideContact}>
              <Link to="/import-export" className={styles.btnGhost}>← Toutes les annonces</Link>
            </div>
          </div>
        </div>
      </div>

      {showReserve && (
        <ReservationModal
          listing={listing}
          onClose={() => setShowReserve(false)}
          onSuccess={handleReservationSuccess}
        />
      )}
    </div>
  );
}
