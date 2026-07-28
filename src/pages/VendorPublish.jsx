import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useVehicles } from "../context/VehicleContext";
import { useToast } from "../context/ToastContext";
import { CAR_MAKES, BODY_TYPES, COUNTRIES_ALL, CURRENCIES, getCountryFlag } from "../data/autocomplete";
import { SUBSCRIPTIONS_ENABLED } from "../config/featureFlags";
import { INCOTERMS, INCOTERM_STAGES, INCOTERM_GROUP_LABELS, getIncoterm, isIncotermCompatible } from "../constants/incoterms";
import styles from "./VendorPublish.module.css";

// USD est la devise de base réelle des montants véhicule/réservation sur tout
// le site depuis la refonte du modèle économique (voir server/models/ExchangeRate.js,
// server/scripts/migrate-vehicle-booking-to-usd.mjs) — plus du FCFA/XOF.
const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " USD";
const fmtIE = (p, c = "EUR") => p ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";

// Cohérent avec IETransaction.escrow.method (server/models/IETransaction.js).
// Pas d'espèces pour un achat international (véhicule expédié par container/fret).
const PAYMENT_METHOD_OPTIONS = [
  { value: "carte",        label: "💳 Carte bancaire" },
  { value: "virement",     label: "🏦 Virement bancaire" },
  { value: "mobile_money", label: "📱 Mobile Money" },
  { value: "crypto",       label: "₿ Cryptomonnaie" },
  { value: "lc",           label: "📄 Lettre de crédit (L/C)" },
];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  approved: { label: "Publié",      color: "#10b981", bg: "#ecfdf5", dot: "#10b981" },
  pending:  { label: "En attente",  color: "#f59e0b", bg: "#fffbeb", dot: "#f59e0b" },
  rejected: { label: "Rejeté",      color: "#ef4444", bg: "#fef2f2", dot: "#ef4444" },
  draft:    { label: "Brouillon",   color: "#64748b", bg: "#f1f5f9", dot: "#64748b" },
  sold:     { label: "Vendu",       color: "#6366f1", bg: "#eef2ff", dot: "#6366f1" },
  archived: { label: "Archivé",     color: "#94a3b8", bg: "#f8fafc", dot: "#94a3b8" },
};

const TYPE_CFG = {
  location:  { label: "Location",  color: "#6366f1", bg: "rgba(99,102,241,.10)" },
  vente:     { label: "Vente",     color: "#ff4d2d", bg: "rgba(255,77,45,.10)"  },
  chauffeur: { label: "Chauffeur", color: "#0ea5e9", bg: "rgba(14,165,233,.10)" },
};

const IE_STATUS_CFG = {
  draft:    { label: "Brouillon",  color: "#94a3b8", bg: "#f8fafc" },
  pending:  { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
  approved: { label: "Publiée",    color: "#10b981", bg: "#ecfdf5" },
  rejected: { label: "Refusée",    color: "#ef4444", bg: "#fef2f2" },
  sold:     { label: "Vendue",     color: "#6366f1", bg: "#f0f4ff" },
  archived: { label: "Archivée",   color: "#64748b", bg: "#f8fafc" },
};

const PROFILE_STATUS = {
  none:      { label: "Non soumis",  color: "#94a3b8", bg: "#f8fafc", icon: "⬜" },
  pending:   { label: "En examen",   color: "#f59e0b", bg: "#fffbeb", icon: "⏳" },
  verified:  { label: "Vérifié",     color: "#10b981", bg: "#ecfdf5", icon: "✅" },
  rejected:  { label: "Refusé",      color: "#ef4444", bg: "#fef2f2", icon: "❌" },
  suspended: { label: "Suspendu",    color: "#ef4444", bg: "#fef2f2", icon: "🚫" },
};

const BADGE_ICONS = { silver: "🥈", gold: "🥇", platinum: "💎", none: "" };

const FILTER_TABS = [
  { key: "all",      label: "Toutes"      },
  { key: "approved", label: "Publiées"    },
  { key: "pending",  label: "En attente"  },
  { key: "rejected", label: "Rejetées"    },
  { key: "draft",    label: "Brouillons"  },
  { key: "sold",     label: "Vendues"     },
  { key: "archived", label: "Archivées"   },
];

// ── Utilitaires ───────────────────────────────────────────────────────────────

function vehicleStats(vehicleId, partnerBookings) {
  const bks = partnerBookings.filter((b) => String(b.vehicleId) === String(vehicleId));
  const completed = bks.filter((b) => b.status === "completed");
  const revenue   = completed.reduce((s, b) => s + (Number(b.partnerPayout) || 0), 0);
  return { bookings: bks.length, completed: completed.length, revenue };
}

const ScoreBar = ({ score }) => {
  const color = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className={styles.scoreWrap}>
      <div className={styles.scoreTrack}>
        <div style={{ width: `${score}%`, background: color, height: "100%", borderRadius: 99 }} />
      </div>
      <span style={{ color, fontSize: ".70rem", fontWeight: 800 }}>{score}/100</span>
    </div>
  );
};

// ── Carte véhicule standard ───────────────────────────────────────────────────
const VehicleCard = ({ v, bookings, onDelete, onBoost, onLifecycle }) => {
  const [showHistory, setShowHistory] = useState(false);
  const st   = STATUS_CFG[v.status]   || STATUS_CFG.pending;
  const tp   = TYPE_CFG[v.type]       || TYPE_CFG.location;
  const vst  = vehicleStats(v.id || v._id, bookings);
  const hasScore = v.validationScore != null && v.status !== "approved";
  const isLive = ["approved", "pending", "rejected"].includes(v.status);

  return (
    <div className={styles.card}>
      <div className={styles.cardThumb}>
        {v.image
          ? <img src={v.image} alt={v.name} loading="lazy" decoding="async" />
          : <span className={styles.cardThumbFallback}>🚗</span>
        }
        <span className={styles.statusDot} style={{ background: st.dot }} title={st.label} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <div className={styles.cardNameRow}>
            <span className={styles.cardName}>{v.name || v.title || "Véhicule"}</span>
            <span className={styles.typeBadge} style={{ color: tp.color, background: tp.bg }}>{tp.label}</span>
            <span className={styles.statusBadge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
          </div>
          <p className={styles.cardMeta}>
            {v.type === "location"
              ? `${(v.pricePerDay || 0).toLocaleString("fr-FR")} USD / jour`
              : `${(v.priceForSale || 0).toLocaleString("fr-FR")} USD`}
            {v.ville ? ` · ${v.ville}` : ""}
            {v.year  ? ` · ${v.year}`  : ""}
          </p>
        </div>
        {hasScore && <ScoreBar score={v.validationScore} />}
        {v.validationErrors?.length > 0 && v.status !== "approved" && (
          <div className={styles.errorsBox}>
            {v.validationErrors.slice(0, 3).map((e, i) => (
              <span key={i} className={styles.errorTag}>❌ {e}</span>
            ))}
          </div>
        )}
        <div className={styles.miniStats}>
          <div className={styles.miniStat}><span className={styles.miniVal}>{vst.bookings}</span><span className={styles.miniLbl}>Réservations</span></div>
          <div className={styles.miniStatDivider} />
          <div className={styles.miniStat}><span className={styles.miniVal}>{vst.completed}</span><span className={styles.miniLbl}>Terminées</span></div>
          <div className={styles.miniStatDivider} />
          <div className={styles.miniStat}><span className={styles.miniVal} style={{ color: "#10b981" }}>{fmt(vst.revenue)}</span><span className={styles.miniLbl}>Revenus</span></div>
        </div>
        <div className={styles.cardActions}>
          {v.status === "approved" && SUBSCRIPTIONS_ENABLED && (
            <button className={styles.boostBtn} onClick={() => onBoost(v)}>⚡ Booster</button>
          )}
          {v.status === "rejected" && (
            <span className={styles.rejectTip}>Corrigez votre annonce et soumettez à nouveau</span>
          )}
          {isLive && (
            <button className={styles.deleteBtn} style={{ background: "#f1f5f9", color: "#475569" }} onClick={() => onLifecycle(v, "draft")}>📝 Brouillon</button>
          )}
          {isLive && (
            <button className={styles.deleteBtn} style={{ background: "#eef2ff", color: "#6366f1" }} onClick={() => onLifecycle(v, "sold")}>🏷️ Marquer vendu</button>
          )}
          {["draft", "archived"].includes(v.status) && (
            <button className={styles.deleteBtn} style={{ background: "#ecfdf5", color: "#10b981" }} onClick={() => onLifecycle(v, "pending")}>▶️ Remettre en vente</button>
          )}
          {v.status === "draft" && (
            <button className={styles.deleteBtn} style={{ background: "#f8fafc", color: "#94a3b8" }} onClick={() => onLifecycle(v, "archived")}>🗄️ Archiver</button>
          )}
          {v.statusHistory?.length > 0 && (
            <button className={styles.deleteBtn} style={{ background: "none", color: "#94a3b8" }} onClick={() => setShowHistory((s) => !s)}>
              🕓 Historique
            </button>
          )}
          <button className={styles.deleteBtn} onClick={() => onDelete(v)}>🗑️ Supprimer</button>
        </div>
        {showHistory && (
          <div style={{ marginTop: 8, borderTop: "1px solid #f1f5f9", paddingTop: 8, fontSize: ".76rem", color: "#64748b" }}>
            {v.statusHistory.slice().reverse().map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>{STATUS_CFG[h.status]?.label || h.status}</span>
                <span>{new Date(h.changedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Modal boost ───────────────────────────────────────────────────────────────
// 4 paliers de mise en avant configurables admin (PricingConfig.boosts, voir
// pricingEngine.getBoostPrice) — POST /api/subscriptions/boost {vehicleId, tier},
// activé après confirmation admin du paiement (subscriptionController.js).
const BOOST_TIERS = [
  { tier: "24h",           label: "Flash 24 h",       days: "1 jour",   color: "#f59e0b" },
  { tier: "7d",             label: "Semaine",          days: "7 jours",  color: "#0ea5e9" },
  { tier: "30d",            label: "Mise en avant",    days: "30 jours", color: "#ff4d2d" },
  { tier: "international",  label: "Internationale",   days: "30 jours", color: "#8b5cf6" },
];

const BoostModal = ({ vehicle, token, onClose, onBoosted }) => {
  const { fmtUSD } = useCurrency();
  const [prices, setPrices] = useState({});
  const [selected, setSelected] = useState("30d");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.boosts) setPrices(d.boosts); })
      .catch(() => {});
  }, []);

  const handleBoost = async () => {
    const vehicleId = vehicle?.id || vehicle?._id;
    if (!vehicleId) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/subscriptions/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicleId, tier: selected }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setErr(data?.message || "Erreur lors de la demande de mise en avant."); return; }
      onBoosted?.(data.message);
      onClose();
    } catch {
      setErr("Erreur réseau — réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.boostModal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <h2 className={styles.boostTitle}>⚡ Booster mon annonce</h2>
        <p className={styles.boostSub}>Multipliez la visibilité de <strong>{vehicle?.name}</strong> et recevez plus de réservations.</p>
        <div className={styles.boostPacksGrid}>
          {BOOST_TIERS.map((b) => (
            <div
              key={b.tier}
              className={styles.boostPack}
              style={{ borderColor: b.color + (selected === b.tier ? "" : "44"), cursor: "pointer", outline: selected === b.tier ? `2px solid ${b.color}` : "none" }}
              onClick={() => setSelected(b.tier)}
            >
              <div className={styles.boostPackName} style={{ color: b.color }}>{b.label}</div>
              <div className={styles.boostPackPrice}>{prices[b.tier] != null ? fmtUSD(prices[b.tier]) : "…"}</div>
              <div className={styles.boostPackDays}>{b.days}</div>
              <ul className={styles.boostPackFeatures}>
                <li><span style={{ color: b.color }}>✓</span> Badge Sponsorisé</li>
                <li><span style={{ color: b.color }}>✓</span> Priorité dans le catalogue</li>
                {b.tier === "international" && <li><span style={{ color: b.color }}>✓</span> Visibilité multi-pays</li>}
              </ul>
            </div>
          ))}
        </div>
        {err && <p style={{ color: "#ef4444", fontSize: ".85rem", margin: "12px 0 0" }}>{err}</p>}
        <button
          className={styles.boostPackBtn}
          style={{ background: BOOST_TIERS.find((b) => b.tier === selected)?.color, opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer", marginTop: 12 }}
          onClick={handleBoost}
          disabled={submitting}
        >
          {submitting ? "Envoi…" : "Demander la mise en avant →"}
        </button>
        <p style={{ fontSize: ".72rem", color: "#94a3b8", margin: "8px 0 0" }}>
          Activée après confirmation du paiement par notre équipe.
        </p>
      </div>
    </div>
  );
};

// ── Formulaire nouvelle annonce Import/Export ─────────────────────────────────
function IEListingForm({ onClose, onSaved, token }) {
  const [f, setF] = useState({
    title: "", make: "", model: "", year: new Date().getFullYear(),
    mileage: 0, fuelType: "essence", transmission: "automatique",
    bodyType: "", color: "", condition: "occasion", description: "",
    sourceCountry: "", sourceCity: "", availableIn: [],
    price: "", currency: "EUR", negotiable: false, stockQty: 1,
    vin: "", vehicleHistory: "", priceIncludes: [],
    estimatedShippingCost: "", shippingCostCurrency: "EUR",
    estimatedDelay: "", shippingType: "", exportDocumentsAvailable: [], videoUrl: "",
    acceptedPaymentMethods: [], incoterm: "", businessId: "",
  });
  const [photos, setPhotos]       = useState([]);
  const [availText, setAvailText] = useState("");
  const [includeText, setIncludeText] = useState("");
  const [docText, setDocText]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);

  // Entreprise du partenaire (facultatif, multi-entité/multi-pays — voir
  // VendorSubmit.jsx et PartnerFleetImport.jsx pour le même pattern côté
  // véhicules) : ImportExportListing accepte désormais businessId
  // (server/controllers/importExportController.js createListing).
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    fetch("/api/partner/businesses", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.businesses || [];
        setBusinesses(list);
        const def = list.find((b) => b.isDefault);
        if (def) set("businessId", def._id);
      })
      .catch(() => {});
  }, [token]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const addPhoto = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = () => setPhotos((p) => [...p, r.result]);
  }, []);

  const addAvail = () => {
    const c = availText.trim();
    if (c && !f.availableIn.includes(c)) set("availableIn", [...f.availableIn, c]);
    setAvailText("");
  };

  const addInclude = () => {
    const c = includeText.trim();
    if (c && !f.priceIncludes.includes(c)) set("priceIncludes", [...f.priceIncludes, c]);
    setIncludeText("");
  };

  const addDoc = () => {
    const c = docText.trim();
    if (c && !f.exportDocumentsAvailable.includes(c)) set("exportDocumentsAvailable", [...f.exportDocumentsAvailable, c]);
    setDocText("");
  };

  const save = useCallback(async () => {
    if (!f.title || !f.make || !f.model || !f.sourceCountry || !f.price) {
      setErr("Complétez : titre, marque, modèle, pays source, prix."); return;
    }
    if (f.availableIn.length === 0) {
      setErr("Indiquez au moins un pays de destination (livraison disponible vers)."); return;
    }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/import-export/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...f, photos, mainPhoto: photos[0] || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }, [f, photos, token, onSaved]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.boostModal} style={{ maxWidth: 760, maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>🌍 Nouvelle annonce Import/Export</h3>
          <button className={styles.modalClose} style={{ position: "relative", top: "auto", right: "auto" }} onClick={onClose}>✕</button>
        </div>

        {/* Datalists */}
        <datalist id="dl-vp-makes">{CAR_MAKES.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="dl-vp-bodies">{BODY_TYPES.map((b) => <option key={b} value={b} />)}</datalist>
        <datalist id="dl-vp-countries">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="dl-vp-avail">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".85rem" }}>
            Titre * <input style={iStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Toyota Land Cruiser V8 Import Dubaï" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".85rem" }}>
            Pays d'origine * <input list="dl-vp-countries" style={iStyle} value={f.sourceCountry} onChange={(e) => set("sourceCountry", e.target.value)} placeholder="Émirats Arabes Unis" />
          </label>
        </div>
        {businesses.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={lStyle}>Entreprise
              <select style={iStyle} value={f.businessId} onChange={(e) => set("businessId", e.target.value)}>
                <option value="">Compte personnel (aucune entreprise)</option>
                {businesses.map((b) => (
                  <option key={b._id} value={b._id}>{b.companyName} — {b.ville}, {b.country}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 12, marginBottom: 12 }}>
          <label style={lStyle}>Marque * <input list="dl-vp-makes" style={iStyle} value={f.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" /></label>
          <label style={lStyle}>Modèle * <input style={iStyle} value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="Land Cruiser" /></label>
          <label style={lStyle}>Année <input type="number" style={iStyle} min="1990" max={new Date().getFullYear() + 1} value={f.year} onChange={(e) => set("year", e.target.value)} /></label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px", gap: 12, marginBottom: 12 }}>
          <label style={lStyle}>Prix * <input type="number" style={iStyle} min="0" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="25 000" /></label>
          <label style={lStyle}>Devise
            <select style={iStyle} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label style={lStyle}>Kilométrage <input type="number" style={iStyle} min="0" value={f.mileage} onChange={(e) => set("mileage", e.target.value)} /></label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lStyle}>Carburant
            <select style={iStyle} value={f.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
              <option value="essence">Essence</option><option value="diesel">Diesel</option>
              <option value="hybride">Hybride</option><option value="hybride_rechargeable">Hybride rechargeable</option>
              <option value="electrique">Électrique</option><option value="gpl">GPL</option>
            </select>
          </label>
          <label style={lStyle}>Transmission
            <select style={iStyle} value={f.transmission} onChange={(e) => set("transmission", e.target.value)}>
              <option value="automatique">Automatique</option><option value="manuelle">Manuelle</option><option value="cvt">CVT</option>
            </select>
          </label>
          <label style={lStyle}>État
            <select style={iStyle} value={f.condition} onChange={(e) => set("condition", e.target.value)}>
              <option value="neuf">Neuf</option><option value="occasion">Occasion</option><option value="reconditionne">Reconditionné</option>
            </select>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lStyle}>Carrosserie <input list="dl-vp-bodies" style={iStyle} value={f.bodyType} onChange={(e) => set("bodyType", e.target.value)} placeholder="SUV, berline…" /></label>
          <label style={lStyle}>Couleur <input style={iStyle} value={f.color} onChange={(e) => set("color", e.target.value)} placeholder="Blanc perle" /></label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lStyle}>VIN (numéro de châssis) <input style={iStyle} value={f.vin} onChange={(e) => set("vin", e.target.value)} placeholder="JT..." /></label>
          <label style={lStyle}>Lien vidéo <input style={iStyle} value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://youtube.com/..." /></label>
        </div>
        <label style={{ ...lStyle, marginBottom: 12 }}>Historique véhicule
          <textarea style={{ ...iStyle, minHeight: 60, resize: "vertical" }} rows={2} value={f.vehicleHistory} onChange={(e) => set("vehicleHistory", e.target.value)} placeholder="Accidents, entretien, nombre de propriétaires…" />
        </label>

        {/* Logistique export */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <label style={lStyle}>Coût livraison estimé <input type="number" min="0" style={iStyle} value={f.estimatedShippingCost} onChange={(e) => set("estimatedShippingCost", e.target.value)} placeholder="1500" /></label>
          <label style={lStyle}>Devise du coût
            <select style={iStyle} value={f.shippingCostCurrency} onChange={(e) => set("shippingCostCurrency", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label style={lStyle}>Délai estimé <input style={iStyle} value={f.estimatedDelay} onChange={(e) => set("estimatedDelay", e.target.value)} placeholder="30-45 jours" /></label>
        </div>
        <label style={{ ...lStyle, marginBottom: 12 }}>Type de transport
          <select style={iStyle} value={f.shippingType} onChange={(e) => set("shippingType", e.target.value)}>
            <option value="">— Non précisé —</option>
            <option value="maritime">Maritime</option>
            <option value="terrestre">Terrestre</option>
            <option value="aerien">Aérien</option>
            <option value="multiple">Multiple</option>
          </select>
        </label>

        {/* Incoterm (règle de vente export) */}
        <label style={{ ...lStyle, marginBottom: 12 }}>Incoterm (règle de vente export)
          <select style={iStyle} value={f.incoterm} onChange={(e) => set("incoterm", e.target.value)}>
            <option value="">— Non précisé —</option>
            <optgroup label={INCOTERM_GROUP_LABELS.multimodal}>
              {INCOTERMS.filter((i) => i.group === "multimodal").map((i) => (
                <option key={i.code} value={i.code}>{i.label}</option>
              ))}
            </optgroup>
            <optgroup label={INCOTERM_GROUP_LABELS.maritime}>
              {INCOTERMS.filter((i) => i.group === "maritime").map((i) => (
                <option key={i.code} value={i.code} disabled={!isIncotermCompatible(i.code, f.shippingType)}>
                  {i.label}{!isIncotermCompatible(i.code, f.shippingType) ? " (maritime uniquement)" : ""}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {f.incoterm && getIncoterm(f.incoterm) && (
          <div style={{ marginBottom: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 8px", fontSize: ".82rem", color: "#475569" }}>{getIncoterm(f.incoterm).summary}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 6 }}>
              {INCOTERM_STAGES.map(([key, stageLabel]) => (
                <div key={key} style={{ fontSize: ".78rem", color: "#334155" }}>
                  <strong>{stageLabel} :</strong> {getIncoterm(f.incoterm).responsibilities[key] === "vendeur" ? "Vendeur" : "Acheteur"}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Moyens de paiement acceptés */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Moyens de paiement acceptés</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PAYMENT_METHOD_OPTIONS.map((pm) => {
              const active = f.acceptedPaymentMethods.includes(pm.value);
              return (
                <button type="button" key={pm.value}
                  onClick={() => set("acceptedPaymentMethods", active
                    ? f.acceptedPaymentMethods.filter((x) => x !== pm.value)
                    : [...f.acceptedPaymentMethods, pm.value])}
                  style={{
                    padding: "6px 12px", borderRadius: 20, border: "1px solid", cursor: "pointer",
                    fontSize: ".78rem", fontWeight: 600,
                    borderColor: active ? "#6366f1" : "#e2e8f0",
                    background: active ? "#6366f1" : "#f8fafc",
                    color: active ? "#fff" : "#475569",
                  }}>
                  {pm.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Prix inclut */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Le prix inclut</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input style={{ ...iStyle, flex: 1 }} value={includeText} onChange={(e) => setIncludeText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())} placeholder="Dédouanement, transport local…" />
            <button type="button" onClick={addInclude} style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>+</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {f.priceIncludes.map((c) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(99,102,241,.1)", color: "#6366f1", borderRadius: 99, padding: "3px 10px", fontSize: ".78rem", fontWeight: 600 }}>
                {c}<button onClick={() => set("priceIncludes", f.priceIncludes.filter((x) => x !== c))} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        </div>

        {/* Documents export disponibles */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Documents d'export disponibles</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input style={{ ...iStyle, flex: 1 }} value={docText} onChange={(e) => setDocText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDoc())} placeholder="Facture, connaissement, certificat d'origine…" />
            <button type="button" onClick={addDoc} style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>+</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {f.exportDocumentsAvailable.map((c) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(99,102,241,.1)", color: "#6366f1", borderRadius: 99, padding: "3px 10px", fontSize: ".78rem", fontWeight: 600 }}>
                {c}<button onClick={() => set("exportDocumentsAvailable", f.exportDocumentsAvailable.filter((x) => x !== c))} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        </div>

        {/* Disponible dans */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Disponible pour livraison dans *</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input list="dl-vp-avail" style={{ ...iStyle, flex: 1 }} value={availText} onChange={(e) => setAvailText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAvail())} placeholder="Côte d'Ivoire, Sénégal…" />
            <button type="button" onClick={addAvail} style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>+</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {f.availableIn.map((c) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(99,102,241,.1)", color: "#6366f1", borderRadius: 99, padding: "3px 10px", fontSize: ".78rem", fontWeight: 600 }}>
                {getCountryFlag(c)} {c}<button onClick={() => set("availableIn", f.availableIn.filter((x) => x !== c))} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        </div>

        <label style={lStyle}>Description
          <textarea style={{ ...iStyle, minHeight: 70, resize: "vertical" }} rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Détails, options, historique…" />
        </label>

        {/* Photos */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: ".82rem", fontWeight: 600, marginBottom: 6 }}>Photos ({photos.length}/8)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {photos.map((p, i) => <img key={i} src={p} style={{ width: 72, height: 56, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e2e8f0" }} alt={`p-${i}`} />)}
            {photos.length < 8 && (
              <label style={{ width: 72, height: 56, display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed #cbd5e1", borderRadius: 8, cursor: "pointer", color: "#94a3b8", fontSize: ".78rem", textAlign: "center" }}>
                <input type="file" accept="image/*" onChange={addPhoto} style={{ display: "none" }} />+ Photo
              </label>
            )}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: ".85rem", cursor: "pointer" }}>
          <input type="checkbox" checked={f.negotiable} onChange={(e) => set("negotiable", e.target.checked)} />
          Prix négociable
        </label>

        {err && <p style={{ color: "#ef4444", fontSize: ".85rem", margin: "0 0 12px" }}>❌ {err}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontWeight: 600 }}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ padding: "10px 24px", background: "#ff4d2d", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Envoi…" : "Soumettre l'annonce →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const iStyle = { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: ".85rem", width: "100%", boxSizing: "border-box", outline: "none" };
const lStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: ".82rem", fontWeight: 600, color: "#374151" };

// ═════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═════════════════════════════════════════════════════════════════════════════
const VendorPublish = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();
  const { partnerVehicles, partnerBookings, loadPartnerVehicles } = useVehicles();
  const { success: toastOk, error: toastErr } = useToast();

  // ── Onglet principal : "vehicles" | "import-export"
  const [mainTab, setMainTab] = useState(
    searchParams.get("tab") === "import-export" ? "import-export" : "vehicles"
  );

  // ── Véhicules classiques
  const [filter, setFilter]         = useState("all");
  const [search, setSearch]         = useState("");
  const [boostVehicle, setBoost]    = useState(null);
  const [deleteVehicle, setDelete]  = useState(null);
  const [deleting, setDeleting]     = useState(false);

  // ── Import/Export listings
  const [ieListings, setIeListings]    = useState([]);
  const [ieProfile, setIeProfile]      = useState(null);
  const [ieLoading, setIeLoading]      = useState(false);
  const [showIeForm, setShowIeForm]    = useState(false);
  const [ieToast, setIeToast]          = useState(null);

  const showIeMsg = (msg, type = "success") => { setIeToast({ msg, type }); setTimeout(() => setIeToast(null), 3500); };

  const loadIeData = useCallback(async () => {
    if (!token) return;
    setIeLoading(true);
    try {
      const [pRes, lRes] = await Promise.all([
        fetch("/api/import-export/importer-profile", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/import-export/listings/mine",    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setIeProfile(d.profile); }
      if (lRes.ok) { const d = await lRes.json(); setIeListings(d.listings || []); }
    } catch {}
    setIeLoading(false);
  }, [token]);

  useEffect(() => {
    if (mainTab === "import-export") loadIeData();
  }, [mainTab, loadIeData]);

  const deleteIeListing = async (id) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    await fetch(`/api/import-export/listings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    showIeMsg("Annonce supprimée.");
    loadIeData();
  };

  // ── Stats véhicules
  const published     = partnerVehicles.filter((v) => v.status === "approved").length;
  const pending       = partnerVehicles.filter((v) => v.status === "pending").length;
  const rejected      = partnerVehicles.filter((v) => v.status === "rejected").length;
  const totalRevenue  = useMemo(() =>
    (partnerBookings || []).filter((b) => b.status === "completed")
      .reduce((s, b) => s + (Number(b.partnerPayout) || 0), 0),
    [partnerBookings]
  );

  const filtered = useMemo(() => {
    let list = partnerVehicles;
    if (filter !== "all") list = list.filter((v) => v.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((v) =>
        (v.name || v.title || "").toLowerCase().includes(q) ||
        (v.ville || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1);
  }, [partnerVehicles, filter, search]);

  const confirmDelete = async () => {
    if (!deleteVehicle) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${deleteVehicle.id || deleteVehicle._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toastOk("Annonce supprimée."); loadPartnerVehicles?.(); }
      else { toastErr("Impossible de supprimer cette annonce."); }
    } catch { toastErr("Erreur réseau — réessayez."); }
    finally { setDeleting(false); setDelete(null); }
  };

  // Brouillon/vendu/archivé/remise en vente — alternative à la suppression
  // définitive, qui casse l'historique des réservations liées à l'annonce.
  const handleLifecycle = async (vehicle, status) => {
    const id = vehicle.id || vehicle._id;
    try {
      const res = await fetch(`/api/vehicles/${id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { toastOk("Statut mis à jour."); loadPartnerVehicles?.(); }
      else { toastErr(d.message || "Erreur lors de la mise à jour."); }
    } catch { toastErr("Erreur réseau — réessayez."); }
  };

  const pStatus    = PROFILE_STATUS[ieProfile?.status || "none"];
  const badgeIcon  = BADGE_ICONS[ieProfile?.badgeLevel || "none"];
  const isVerified = ieProfile?.status === "verified";

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.page}>

      {/* ── En-tête ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Gestion des publications</h1>
          <p className={styles.sub}>Gérez, boostez et suivez vos annonces — véhicules & import/export.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {mainTab === "vehicles" && (
            <>
              <Link to="/partner-fleet-import" style={{ display: "inline-flex", alignItems: "center", padding: "11px 20px", background: "#6366f1", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".88rem", whiteSpace: "nowrap" }}>
                📦 Importer ma flotte
              </Link>
              <button className={styles.newBtn} onClick={() => navigate("/vendor")}>+ Nouvelle annonce</button>
            </>
          )}
          {mainTab === "import-export" && isVerified && (
            <button className={styles.newBtn} onClick={() => setShowIeForm(true)}>🌍 Nouvelle annonce IE</button>
          )}
        </div>
      </div>

      {/* ── Onglets principaux ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #f1f5f9" }}>
        {[
          { key: "vehicles",      icon: "🚗", label: "Véhicules" },
          { key: "import-export", icon: "🌍", label: "Import / Export" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            style={{
              padding: "10px 22px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: ".92rem",
              color: mainTab === t.key ? "#ff4d2d" : "#64748b",
              borderBottom: mainTab === t.key ? "2.5px solid #ff4d2d" : "2.5px solid transparent",
              marginBottom: -2, transition: "all .2s",
            }}
          >
            {t.icon} {t.label}
            {t.key === "import-export" && ieListings.length > 0 && (
              <span style={{ marginLeft: 6, background: "#ff4d2d", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: ".72rem" }}>
                {ieListings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ONGLET VÉHICULES
      ══════════════════════════════════════════════════════════════════════ */}
      {mainTab === "vehicles" && (
        <>
          {/* KPI */}
          <div className={styles.kpiRow}>
            <div className={styles.kpiCard}><span className={styles.kpiIcon}>📦</span><span className={styles.kpiValue}>{partnerVehicles.length}</span><span className={styles.kpiLabel}>Total annonces</span></div>
            <div className={styles.kpiCard}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue} style={{ color: "#10b981" }}>{published}</span><span className={styles.kpiLabel}>Publiées</span></div>
            <div className={styles.kpiCard}><span className={styles.kpiIcon}>⏳</span><span className={styles.kpiValue} style={{ color: "#f59e0b" }}>{pending}</span><span className={styles.kpiLabel}>En attente</span></div>
            <div className={styles.kpiCard}><span className={styles.kpiIcon}>❌</span><span className={styles.kpiValue} style={{ color: "#ef4444" }}>{rejected}</span><span className={styles.kpiLabel}>Rejetées</span></div>
            <div className={styles.kpiCard}><span className={styles.kpiIcon}>💰</span><span className={styles.kpiValue} style={{ color: "#10b981" }}>{fmt(totalRevenue)}</span><span className={styles.kpiLabel}>Revenus générés</span></div>
          </div>

          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.filterTabs}>
              {FILTER_TABS.map((t) => {
                const count = t.key === "all" ? partnerVehicles.length : partnerVehicles.filter((v) => v.status === t.key).length;
                return (
                  <button
                    key={t.key}
                    className={`${styles.filterTab} ${filter === t.key ? styles.filterTabActive : ""}`}
                    onClick={() => setFilter(t.key)}
                  >
                    {t.label}
                    {count > 0 && <span className={styles.filterCount}>{count}</span>}
                  </button>
                );
              })}
            </div>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input className={styles.searchInput} placeholder="Rechercher par nom ou ville..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className={styles.searchClear} onClick={() => setSearch("")}>✕</button>}
            </div>
          </div>

          {rejected > 0 && (
            <div className={styles.rejectAlert}>
              <span>⚠️</span>
              <span>Vous avez <strong>{rejected} annonce{rejected > 1 ? "s" : ""} rejetée{rejected > 1 ? "s" : ""}</strong>.{" "}
                Corrigez les erreurs et publiez depuis{" "}
                <button className={styles.alertLink} onClick={() => navigate("/vendor")}>Nouvelle annonce</button>.
              </span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🚗</div>
              <h3>{search ? "Aucun résultat" : "Aucune annonce"}</h3>
              <p>{search ? `Aucune annonce ne correspond à "${search}".` : "Publiez votre première annonce pour commencer à recevoir des réservations."}</p>
              {!search && <button className={styles.newBtnSm} onClick={() => navigate("/vendor")}>Créer une annonce</button>}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filtered.map((v) => (
                <VehicleCard key={v.id || v._id} v={v} bookings={partnerBookings || []} onDelete={setDelete} onBoost={setBoost} onLifecycle={handleLifecycle} />
              ))}
            </div>
          )}

          {partnerVehicles.length > 0 && (
            <div className={styles.tipBox}>
              <span className={styles.tipIcon}>💡</span>
              <div>
                <strong>Conseil :</strong> Les annonces avec 4 photos ou plus et une description détaillée reçoivent
                en moyenne <strong>3× plus de réservations</strong>.
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ONGLET IMPORT / EXPORT
      ══════════════════════════════════════════════════════════════════════ */}
      {mainTab === "import-export" && (
        <div>
          {ieToast && (
            <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 20px", borderRadius: 12, background: ieToast.type === "error" ? "#ef4444" : "#10b981", color: "#fff", fontWeight: 700, boxShadow: "0 4px 20px rgba(0,0,0,.18)" }}>
              {ieToast.msg}
            </div>
          )}

          {/* Statut de vérification — le Founding Partner Program est l'unique
              vérification requise pour publier en export (plus de candidature
              "Importateur" séparée : voir ensureImporterProfile côté serveur). */}
          {!user?.isFounder && (!ieProfile || ieProfile.status === "none") ? (
            <div style={{ background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 14, padding: "20px 24px", marginBottom: 24, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.8rem" }}>⚠️</span>
              <div>
                <strong style={{ display: "block", marginBottom: 4 }}>Devenez Founding Partner pour publier en export</strong>
                <p style={{ margin: "0 0 12px", color: "#92400e", fontSize: ".88rem" }}>
                  La publication d'annonces Import/Export est réservée aux partenaires ayant signé l'Accord Founding Partner VIT AUTO — la vérification la plus complète du programme.
                </p>
                <Link to="/partner-onboarding" style={{ display: "inline-block", padding: "9px 20px", background: "#f59e0b", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".88rem" }}>
                  Devenir Founding Partner →
                </Link>
              </div>
            </div>
          ) : ieProfile?.status === "pending" ? (
            <div style={{ background: "#fffbeb", border: "1.5px solid #f59e0b", borderRadius: 14, padding: "20px 24px", marginBottom: 24, display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: "2rem" }}>⏳</span>
              <div>
                <strong>Candidature en cours d'examen</strong>
                <p style={{ margin: "4px 0 0", color: "#92400e", fontSize: ".88rem" }}>Notre équipe examine votre dossier sous 48–72h ouvrables. Vous recevrez une notification.</p>
              </div>
            </div>
          ) : ieProfile?.status === "rejected" ? (
            <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 14, padding: "20px 24px", marginBottom: 24, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.8rem" }}>❌</span>
              <div>
                <strong>Candidature refusée</strong>
                {ieProfile.rejectionReason && <p style={{ margin: "4px 0 8px", color: "#7f1d1d", fontSize: ".85rem" }}>Motif : {ieProfile.rejectionReason}</p>}
                <Link to="/partner-onboarding" style={{ display: "inline-block", padding: "9px 20px", background: "#ef4444", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".88rem" }}>
                  Devenir Founding Partner →
                </Link>
              </div>
            </div>
          ) : ieProfile ? (
            <div style={{ background: "#ecfdf5", border: "1.5px solid #6ee7b7", borderRadius: 14, padding: "18px 24px", marginBottom: 24, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <span style={{ fontSize: "2rem" }}>✅</span>
                <div>
                  <strong style={{ display: "block" }}>Founding Partner {badgeIcon} {ieProfile.badgeLevel?.toUpperCase()}</strong>
                  <p style={{ margin: "2px 0 0", color: "#065f46", fontSize: ".85rem" }}>
                    Publiez vos véhicules à exporter — manuellement ou en masse (fichier/Google Sheet).
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => setShowIeForm(true)} style={{ padding: "9px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                  + Nouvelle annonce
                </button>
                <Link to="/partner-fleet-import?type=export" style={{ display: "inline-block", padding: "9px 20px", background: "#6366f1", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".88rem" }}>
                  📦 Importer en masse
                </Link>
                <Link to="/importer-dashboard" style={{ display: "inline-block", padding: "9px 20px", border: "1.5px solid #10b981", color: "#10b981", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: ".88rem" }}>
                  Tableau de bord complet →
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 24, color: "#94a3b8" }}>Chargement…</div>
          )}

          {/* KPIs Import/Export */}
          <div className={styles.kpiRow} style={{ marginBottom: 24 }}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiIcon}>📢</span>
              <span className={styles.kpiValue}>{ieListings.length}</span>
              <span className={styles.kpiLabel}>Total annonces IE</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiIcon}>✅</span>
              <span className={styles.kpiValue} style={{ color: "#10b981" }}>{ieListings.filter((l) => l.status === "approved").length}</span>
              <span className={styles.kpiLabel}>Publiées</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiIcon}>⏳</span>
              <span className={styles.kpiValue} style={{ color: "#f59e0b" }}>{ieListings.filter((l) => l.status === "pending").length}</span>
              <span className={styles.kpiLabel}>En attente</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiIcon}>👁️</span>
              <span className={styles.kpiValue} style={{ color: "#6366f1" }}>{ieListings.reduce((acc, l) => acc + (l.views || 0), 0)}</span>
              <span className={styles.kpiLabel}>Vues totales</span>
            </div>
          </div>

          {/* Liste annonces IE */}
          {ieLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
              <div className={styles.kpiIcon} style={{ fontSize: "1.5rem" }}>⏳</div>
              <p>Chargement…</p>
            </div>
          ) : ieListings.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🌍</div>
              <h3>Aucune annonce import/export</h3>
              <p>{isVerified ? "Publiez votre première annonce import/export." : "Devenez importateur vérifié pour publier des annonces."}</p>
              {isVerified && (
                <button className={styles.newBtnSm} onClick={() => setShowIeForm(true)}>Créer une annonce IE</button>
              )}
              {!user?.isFounder && (!ieProfile || ieProfile.status === "none") && (
                <Link to="/partner-onboarding" className={styles.newBtnSm} style={{ textDecoration: "none" }}>Devenir Founding Partner</Link>
              )}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {ieListings.map((l) => {
                const st = IE_STATUS_CFG[l.status] || IE_STATUS_CFG.pending;
                return (
                  <div key={l._id} className={styles.card}>
                    <div className={styles.cardThumb}>
                      {l.mainPhoto
                        ? <img src={l.mainPhoto} alt={l.title} loading="lazy" decoding="async" />
                        : <span className={styles.cardThumbFallback}>🚗</span>
                      }
                      <span className={styles.statusDot} style={{ background: st.color }} title={st.label} />
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardNameRow}>
                          <span className={styles.cardName}>{l.title}</span>
                          <span className={styles.typeBadge} style={{ color: "#ff4d2d", background: "rgba(255,77,45,.10)" }}>IE</span>
                          <span className={styles.statusBadge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <p className={styles.cardMeta}>{l.make} {l.model} {l.year} · {l.sourceCountry} · {fmtDate(l.createdAt)}</p>
                        <p className={styles.cardMeta} style={{ color: "#10b981", fontWeight: 700 }}>{fmtIE(l.price, l.currency)}</p>
                      </div>
                      <div className={styles.miniStats}>
                        <div className={styles.miniStat}><span className={styles.miniVal}>{l.views || 0}</span><span className={styles.miniLbl}>Vues</span></div>
                        <div className={styles.miniStatDivider} />
                        <div className={styles.miniStat}><span className={styles.miniVal}>{l.inquiries || 0}</span><span className={styles.miniLbl}>Demandes</span></div>
                        <div className={styles.miniStatDivider} />
                        <div className={styles.miniStat}><span className={styles.miniVal}>{l.stockQty || 1}</span><span className={styles.miniLbl}>Stock</span></div>
                      </div>
                      {l.adminNote && (
                        <p style={{ fontSize: ".78rem", color: "#f59e0b", margin: "4px 0 0", padding: "4px 8px", background: "#fffbeb", borderRadius: 6 }}>
                          Note admin : {l.adminNote}
                        </p>
                      )}
                      <div className={styles.cardActions}>
                        <button className={styles.deleteBtn} onClick={() => deleteIeListing(l._id)}>🗑️ Supprimer</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Lien vers le tableau de bord complet */}
          {ieListings.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <Link to="/importer-dashboard" style={{ color: "#6366f1", fontWeight: 700, textDecoration: "none" }}>
                Accéder au tableau de bord importateur complet →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Modal boost ── */}
      {boostVehicle && (
        <BoostModal
          vehicle={boostVehicle}
          token={token}
          onClose={() => setBoost(null)}
          onBoosted={(msg) => toastOk(msg || "Demande de mise en avant envoyée.")}
        />
      )}

      {/* ── Modal suppression ── */}
      {deleteVehicle && (
        <div className={styles.modalOverlay} onClick={() => setDelete(null)}>
          <div className={styles.deleteModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.deleteIcon}>🗑️</div>
            <h3>Supprimer cette annonce ?</h3>
            <p><strong>{deleteVehicle.name || deleteVehicle.title}</strong> sera définitivement supprimée. Cette action est irréversible.</p>
            <div className={styles.deleteActions}>
              <button className={styles.cancelBtn} onClick={() => setDelete(null)}>Annuler</button>
              <button className={styles.confirmDeleteBtn} onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nouvelle annonce IE ── */}
      {showIeForm && (
        <IEListingForm
          token={token}
          onClose={() => setShowIeForm(false)}
          onSaved={() => { setShowIeForm(false); showIeMsg("Annonce soumise pour validation !"); loadIeData(); }}
        />
      )}
    </div>
  );
};

export default VendorPublish;
