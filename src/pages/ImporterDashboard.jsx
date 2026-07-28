import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./ImporterDashboard.module.css";
import { CAR_MAKES, BODY_TYPES, COUNTRIES_ALL, CURRENCIES, getCountryFlag } from "../data/autocomplete";
import { INCOTERMS, INCOTERM_STAGES, INCOTERM_GROUP_LABELS, getIncoterm, isIncotermCompatible } from "../constants/incoterms";

const toBase64 = (file) =>
  new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result); r.onerror = rej; });

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtPrice = (p, c = "EUR") => p ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";

// Cohérent avec IETransaction.escrow.method (server/models/IETransaction.js).
// Pas d'espèces pour un achat international (véhicule expédié par container/fret).
const PAYMENT_METHOD_OPTIONS = [
  { value: "carte",        label: "💳 Carte bancaire" },
  { value: "virement",     label: "🏦 Virement bancaire" },
  { value: "mobile_money", label: "📱 Mobile Money" },
  { value: "crypto",       label: "₿ Cryptomonnaie" },
  { value: "lc",           label: "📄 Lettre de crédit (L/C)" },
];

const STATUS_CFG = {
  draft:    { label: "Brouillon",  color: "#94a3b8", bg: "#f8fafc" },
  pending:  { label: "En attente", color: "#f59e0b", bg: "#fffbeb" },
  approved: { label: "Publiée",    color: "#10b981", bg: "#ecfdf5" },
  rejected: { label: "Refusée",    color: "#ef4444", bg: "#fef2f2" },
  sold:     { label: "Vendue",     color: "#6366f1", bg: "#f0f4ff" },
  archived: { label: "Archivée",   color: "#64748b", bg: "#f8fafc" },
};

const PROFILE_STATUS = {
  none:          { label: "Non soumis",    color: "#94a3b8", bg: "#f8fafc",  icon: "⬜" },
  pending:       { label: "En examen",     color: "#f59e0b", bg: "#fffbeb",  icon: "⏳" },
  verified:      { label: "Vérifié",       color: "#10b981", bg: "#ecfdf5",  icon: "✅" },
  rejected:      { label: "Refusé",        color: "#ef4444", bg: "#fef2f2",  icon: "❌" },
  suspended:     { label: "Suspendu",      color: "#ef4444", bg: "#fef2f2",  icon: "🚫" },
};

const BADGE_ICONS = { silver: "🥈", gold: "🥇", platinum: "💎", none: "" };

/* ─── Formulaire nouvelle annonce ─────────────────────────────────────────── */
// Exporté pour réutilisation côté admin (AdminPanel.jsx) — même formulaire
// complet, l'édition admin passe aussi par PUT /listings/:id (voir
// importExportController.updateListing, désormais compatible admin).
export function ListingForm({ onClose, onSaved, token, listing }) {
  const isEdit = !!listing;
  const [f, setF] = useState(() => listing ? {
    title: listing.title || "", make: listing.make || "", model: listing.model || "",
    year: listing.year || new Date().getFullYear(),
    mileage: listing.mileage || 0, fuelType: listing.fuelType || "essence",
    transmission: listing.transmission || "automatique",
    bodyType: listing.bodyType || "", color: listing.color || "",
    condition: listing.condition || "occasion", description: listing.description || "",
    sourceCountry: listing.sourceCountry || "", sourceCity: listing.sourceCity || "",
    availableIn: listing.availableIn || [],
    price: listing.price || "", currency: listing.currency || "EUR",
    negotiable: !!listing.negotiable, stockQty: listing.stockQty || 1,
    vin: listing.vin || "", vehicleHistory: listing.vehicleHistory || "",
    priceIncludes: listing.priceIncludes || [],
    estimatedShippingCost: listing.estimatedShippingCost || "",
    shippingCostCurrency: listing.shippingCostCurrency || "EUR",
    estimatedDelay: listing.estimatedDelay || "", shippingType: listing.shippingType || "",
    exportDocumentsAvailable: listing.exportDocumentsAvailable || [], videoUrl: listing.videoUrl || "",
    acceptedPaymentMethods: listing.acceptedPaymentMethods || [],
    incoterm: listing.incoterm || "", businessId: listing.business || "",
  } : {
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
  const [photos, setPhotos]         = useState(() => listing?.photos || []);
  const [availText, setAvailText]   = useState("");
  const [includeText, setIncludeText] = useState("");
  const [docText, setDocText]         = useState("");
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState(null);

  // Entreprise du partenaire (facultatif, multi-entité/multi-pays) —
  // ImportExportListing accepte businessId depuis createListing/updateListing.
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    fetch("/api/partner/businesses", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.businesses || [];
        setBusinesses(list);
        if (!isEdit) {
          const def = list.find((b) => b.isDefault);
          if (def) set("businessId", def._id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const addPhoto = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await toBase64(file);
    setPhotos((p) => [...p, b64]);
  }, []);

  const removePhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i));

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
      setErr("Complétez au minimum : titre, marque, modèle, pays source, prix.");
      return;
    }
    if (f.availableIn.length === 0) {
      setErr("Indiquez au moins un pays de destination (livraison disponible vers).");
      return;
    }
    setSaving(true); setErr(null);
    try {
      const url = isEdit ? `/api/import-export/listings/${listing._id}` : "/api/import-export/listings";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // businessId="" veut dire "compte personnel" — updateListing distingue
        // null (retirer l'entreprise) de undefined (ne pas toucher au champ),
        // donc "" doit être envoyé comme null explicite, jamais tel quel.
        body: JSON.stringify({ ...f, businessId: f.businessId || null, photos, mainPhoto: photos[0] || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }, [f, photos, token, onSaved, isEdit, listing]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.formModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.formModalHeader}>
          <h3>{isEdit ? "Modifier l'annonce" : "Nouvelle annonce Import/Export"}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.formScroll}>
          {/* Datalists autocomplete */}
          <datalist id="dl-dash-makes">{CAR_MAKES.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="dl-dash-bodies">{BODY_TYPES.map((b) => <option key={b} value={b} />)}</datalist>
          <datalist id="dl-dash-countries">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="dl-dash-avail">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>

          <div className={styles.fGrid2}>
            <label><span>Titre de l'annonce *</span><input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Toyota Land Cruiser V8 Import Dubaï" /></label>
            <label><span>Pays d'origine *</span><input list="dl-dash-countries" value={f.sourceCountry} onChange={(e) => set("sourceCountry", e.target.value)} placeholder="Émirats Arabes Unis" /></label>
          </div>
          {businesses.length > 0 && (
            <div className={styles.fGrid2}>
              <label><span>Entreprise</span>
                <select value={f.businessId} onChange={(e) => set("businessId", e.target.value)}>
                  <option value="">Compte personnel (aucune entreprise)</option>
                  {businesses.map((b) => (
                    <option key={b._id} value={b._id}>{b.companyName} — {b.ville}, {b.country}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className={styles.fGrid3}>
            <label><span>Marque *</span><input list="dl-dash-makes" value={f.make} onChange={(e) => set("make", e.target.value)} placeholder="Toyota" /></label>
            <label><span>Modèle *</span><input value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="Land Cruiser" /></label>
            <label><span>Année *</span><input type="number" min="1990" max={new Date().getFullYear() + 1} value={f.year} onChange={(e) => set("year", e.target.value)} /></label>
          </div>
          <div className={styles.fGrid3}>
            <label><span>Prix *</span><input type="number" min="0" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="25000" /></label>
            <label><span>Devise</span>
              <select value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label><span>Kilométrage</span><input type="number" min="0" value={f.mileage} onChange={(e) => set("mileage", e.target.value)} /></label>
          </div>
          <div className={styles.fGrid3}>
            <label><span>Carburant</span>
              <select value={f.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
                <option value="essence">Essence</option><option value="diesel">Diesel</option>
                <option value="hybride">Hybride</option><option value="hybride_rechargeable">Hybride rechargeable</option>
                <option value="electrique">Électrique</option><option value="gpl">GPL</option>
              </select>
            </label>
            <label><span>Transmission</span>
              <select value={f.transmission} onChange={(e) => set("transmission", e.target.value)}>
                <option value="automatique">Automatique</option><option value="manuelle">Manuelle</option>
                <option value="cvt">CVT</option>
              </select>
            </label>
            <label><span>État</span>
              <select value={f.condition} onChange={(e) => set("condition", e.target.value)}>
                <option value="neuf">Neuf</option><option value="occasion">Occasion</option>
                <option value="reconditionne">Reconditionné</option>
              </select>
            </label>
          </div>
          <div className={styles.fGrid2}>
            <label><span>Carrosserie</span><input list="dl-dash-bodies" value={f.bodyType} onChange={(e) => set("bodyType", e.target.value)} placeholder="SUV, berline, pick-up…" /></label>
            <label><span>Couleur</span><input value={f.color} onChange={(e) => set("color", e.target.value)} placeholder="Blanc perle" /></label>
          </div>
          <div className={styles.fGrid2}>
            <label><span>VIN (numéro de châssis)</span><input value={f.vin} onChange={(e) => set("vin", e.target.value)} placeholder="JT..." /></label>
            <label><span>Lien vidéo</span><input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://youtube.com/..." /></label>
          </div>
          <label className={styles.formFull}><span>Historique véhicule</span><textarea rows={2} value={f.vehicleHistory} onChange={(e) => set("vehicleHistory", e.target.value)} placeholder="Accidents, entretien, nombre de propriétaires..." /></label>

          {/* Logistique export */}
          <div className={styles.fGrid3}>
            <label><span>Coût livraison estimé</span><input type="number" min="0" value={f.estimatedShippingCost} onChange={(e) => set("estimatedShippingCost", e.target.value)} placeholder="1500" /></label>
            <label><span>Devise du coût</span>
              <select value={f.shippingCostCurrency} onChange={(e) => set("shippingCostCurrency", e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label><span>Délai estimé</span><input value={f.estimatedDelay} onChange={(e) => set("estimatedDelay", e.target.value)} placeholder="30-45 jours" /></label>
          </div>
          <label><span>Type de transport</span>
            <select value={f.shippingType} onChange={(e) => set("shippingType", e.target.value)}>
              <option value="">— Non précisé —</option>
              <option value="maritime">Maritime</option>
              <option value="terrestre">Terrestre</option>
              <option value="aerien">Aérien</option>
              <option value="multiple">Multiple</option>
            </select>
          </label>

          {/* Incoterm (règle de vente export) */}
          <label><span>Incoterm (règle de vente export)</span>
            <select value={f.incoterm} onChange={(e) => set("incoterm", e.target.value)}>
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
            <div className={styles.fieldset} style={{ background: "#f8fafc" }}>
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
          <div className={styles.fieldset}>
            <label className={styles.fsLegend}>Moyens de paiement acceptés</label>
            <div className={styles.tagList}>
              {PAYMENT_METHOD_OPTIONS.map((pm) => {
                const active = f.acceptedPaymentMethods.includes(pm.value);
                return (
                  <button type="button" key={pm.value}
                    onClick={() => set("acceptedPaymentMethods", active
                      ? f.acceptedPaymentMethods.filter((x) => x !== pm.value)
                      : [...f.acceptedPaymentMethods, pm.value])}
                    className={styles.tag}
                    style={active ? { background: "#6366f1", color: "#fff" } : { background: "#f1f5f9", color: "#475569" }}>
                    {pm.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prix inclut */}
          <div className={styles.fieldset}>
            <label className={styles.fsLegend}>Le prix inclut</label>
            <div className={styles.addRow}>
              <input value={includeText} onChange={(e) => setIncludeText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())} placeholder="Dédouanement, transport local…" />
              <button type="button" className={styles.btnAdd} onClick={addInclude}>+</button>
            </div>
            <div className={styles.tagList}>
              {f.priceIncludes.map((c) => (
                <span key={c} className={styles.tag}>{c}<button onClick={() => set("priceIncludes", f.priceIncludes.filter((x) => x !== c))}>×</button></span>
              ))}
            </div>
          </div>

          {/* Documents export disponibles */}
          <div className={styles.fieldset}>
            <label className={styles.fsLegend}>Documents d'export disponibles</label>
            <div className={styles.addRow}>
              <input value={docText} onChange={(e) => setDocText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDoc())} placeholder="Facture, connaissement, certificat d'origine…" />
              <button type="button" className={styles.btnAdd} onClick={addDoc}>+</button>
            </div>
            <div className={styles.tagList}>
              {f.exportDocumentsAvailable.map((c) => (
                <span key={c} className={styles.tag}>{c}<button onClick={() => set("exportDocumentsAvailable", f.exportDocumentsAvailable.filter((x) => x !== c))}>×</button></span>
              ))}
            </div>
          </div>

          {/* Disponibilité dans */}
          <div className={styles.fieldset}>
            <label className={styles.fsLegend}>Disponible pour livraison dans *</label>
            <div className={styles.addRow}>
              <input list="dl-dash-avail" value={availText} onChange={(e) => setAvailText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAvail())} placeholder="Côte d'Ivoire, Sénégal…" />
              <button type="button" className={styles.btnAdd} onClick={addAvail}>+</button>
            </div>
            <div className={styles.tagList}>
              {f.availableIn.map((c) => (
                <span key={c} className={styles.tag}>{getCountryFlag(c)} {c}<button onClick={() => set("availableIn", f.availableIn.filter((x) => x !== c))}>×</button></span>
              ))}
            </div>
          </div>

          <label className={styles.formFull}><span>Description</span><textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Détails, options, historique..." /></label>

          {/* Photos */}
          <div className={styles.fieldset}>
            <label className={styles.fsLegend}>Photos ({photos.length}/8)</label>
            <div className={styles.photosRow}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={p} className={styles.photoThumb} alt={`photo-${i}`} />
                  <button type="button" onClick={() => removePhoto(i)}
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: ".7rem" }}>✕</button>
                </div>
              ))}
              {photos.length < 8 && (
                <label className={styles.photoAdd}>
                  <input type="file" accept="image/*" onChange={addPhoto} />
                  <span>+ Photo</span>
                </label>
              )}
            </div>
          </div>

          <label className={styles.checkRow}>
            <input type="checkbox" checked={f.negotiable} onChange={(e) => set("negotiable", e.target.checked)} />
            <span>Prix négociable</span>
          </label>

          {err && <p className={styles.formErr}>❌ {err}</p>}
        </div>
        <div className={styles.formModalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>Annuler</button>
          <button className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Envoi..." : isEdit ? "Enregistrer les modifications" : "Soumettre l'annonce →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const TX_STATUS_CFG = {
  reserved:             { label: "Réservé",            color: "#2563eb", bg: "#eff6ff" },
  confirmed:            { label: "Confirmé",            color: "#059669", bg: "#ecfdf5" },
  in_discussion:        { label: "En discussion",       color: "#6366f1", bg: "#f0f4ff" },
  inspection_requested: { label: "Inspection demandée", color: "#d97706", bg: "#fffbeb" },
  inspection_done:      { label: "Inspection terminée", color: "#059669", bg: "#ecfdf5" },
  offer_sent:           { label: "Offre envoyée",       color: "#9333ea", bg: "#fdf4ff" },
  offer_accepted:       { label: "Offre acceptée",      color: "#9333ea", bg: "#fdf4ff" },
  payment_pending:      { label: "Paiement en attente", color: "#ea580c", bg: "#fff7ed" },
  payment_submitted:    { label: "Paiement à vérifier",  color: "#d97706", bg: "#fffbeb" },
  in_escrow:            { label: "Fonds sécurisés",     color: "#059669", bg: "#ecfdf5" },
  preparing:            { label: "Préparation export",  color: "#6366f1", bg: "#f0f4ff" },
  shipped:              { label: "Expédié",             color: "#2563eb", bg: "#eff6ff" },
  in_transit:           { label: "En transit",          color: "#2563eb", bg: "#eff6ff" },
  delivered:            { label: "Livré",               color: "#059669", bg: "#ecfdf5" },
  funds_released:       { label: "Fonds libérés",       color: "#059669", bg: "#ecfdf5" },
  completed:            { label: "Terminé",             color: "#d97706", bg: "#fffbeb" },
  disputed:             { label: "Litige",              color: "#dc2626", bg: "#fef2f2" },
  cancelled:            { label: "Annulé",              color: "#94a3b8", bg: "#f1f5f9" },
};

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ImporterDashboard() {
  const { user, isAuthenticated, token } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]   = useState("overview");
  const [profile, setProfile]       = useState(null);
  const [listings, setListings]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [ieAnalytics, setIeAnalytics] = useState([]); // totaux par devise — voir getPartnerIEAnalytics
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingListing, setEditingListing] = useState(null); // annonce complète en édition (getMyListings tronque `photos`)
  const [toast, setToast]           = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const showMsg = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [pRes, lRes, txRes, aRes] = await Promise.all([
        fetch("/api/import-export/importer-profile", { headers }),
        fetch("/api/import-export/listings/mine",    { headers }),
        fetch("/api/import-export/transactions/partner?limit=50", { headers }),
        fetch("/api/import-export/transactions/partner/analytics", { headers }),
      ]);
      if (pRes.ok)  { const d = await pRes.json();  setProfile(d.profile); }
      if (lRes.ok)  { const d = await lRes.json();  setListings(d.listings || []); }
      if (txRes.ok) { const d = await txRes.json(); setTransactions(d.transactions || []); }
      if (aRes.ok)  { const d = await aRes.json();  setIeAnalytics(d.byCurrency || []); }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);

  const deleteListing = async (id) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    await fetch(`/api/import-export/listings/${id}`, { method: "DELETE", headers });
    showMsg("Annonce supprimée.");
    load();
  };

  // /listings/mine (liste) ne renvoie plus le tableau `photos` complet — voir
  // importExportController.getMyListings (optimisation payload liste). Il faut
  // recharger l'annonce en entier (getListingById, jamais tronqué) pour éditer.
  const openEditListing = async (id) => {
    try {
      const r = await fetch(`/api/import-export/listings/${id}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error();
      setEditingListing(d.listing);
      setShowForm(true);
    } catch { showMsg("Impossible de charger l'annonce."); }
  };


  const pStatus = PROFILE_STATUS[profile?.status || "none"];
  const badgeIcon = BADGE_ICONS[profile?.badgeLevel || "none"];
  const isVerified = profile?.status === "verified";

  const stats = [
    { icon: "📢", label: "Annonces",          value: listings.length },
    { icon: "✅", label: "Publiées",          value: listings.filter((l) => l.status === "approved").length, color: "#10b981" },
    { icon: "📋", label: "Transactions",      value: transactions.length, color: "#6366f1" },
    { icon: "🔴", label: "À traiter",         value: transactions.filter((t) => ["reserved", "in_escrow", "preparing"].includes(t.status)).length, color: "#ef4444" },
  ];

  return (
    <div className={styles.page}>
      {toast && <div className={`${styles.toast} ${toast.type === "error" ? styles.toastErr : ""}`}>{toast.msg}</div>}

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sideProfile}>
          <div className={styles.sideAvatar}>
            {user?.profilePhoto
              ? <img src={user.profilePhoto} alt="avatar" />
              : <span>{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
            }
          </div>
          <strong>{user?.firstName} {user?.lastName}</strong>
          <span className={styles.sideSub}>{profile?.companyName || "Mon entreprise"}</span>
          <span className={styles.sideStatus} style={{ color: pStatus.color, background: pStatus.bg }}>
            {pStatus.icon} {pStatus.label} {badgeIcon}
          </span>
        </div>

        <nav className={styles.sideNav}>
          {[
            { key: "overview",      icon: "📊", label: "Vue d'ensemble" },
            { key: "transactions",  icon: "📋", label: "Transactions", badge: transactions.filter((t) => ["reserved", "in_escrow", "preparing"].includes(t.status)).length },
            { key: "listings",      icon: "📢", label: "Mes annonces" },
            { key: "profile",       icon: "🏢", label: "Mon profil importateur" },
          ].map((t) => (
            <button
              key={t.key}
              className={`${styles.navBtn} ${activeTab === t.key ? styles.navActive : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              <span>{t.icon}</span> {t.label}
              {t.badge > 0 && <span className={styles.navBadge}>{t.badge}</span>}
            </button>
          ))}
        </nav>

        <div className={styles.sideLinks}>
          <Link to="/import-export" className={styles.sideLink}>🌍 Page Import/Export</Link>
          <Link to="/partner-onboarding" className={styles.sideLink}>🚀 Founding Partner Program</Link>
          <Link to="/vendor/dashboard" className={styles.sideLink}>← Dashboard partenaire</Link>
        </div>
      </aside>

      {/* ── Contenu ── */}
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loadBox}><div className={styles.spinner} /><p>Chargement...</p></div>
        ) : (

          <>
            {/* ── VUE D'ENSEMBLE ── */}
            {activeTab === "overview" && (
              <div className={styles.tabContent}>
                <h2 className={styles.tabTitle}>Vue d'ensemble</h2>

                {/* Statut de vérification — Founding Partner Program uniquement */}
                {!user?.isFounder && (!profile || profile.status === "none") ? (
                  <div className={styles.alertBox} style={{ borderColor: "#f59e0b" }}>
                    <span>⚠️</span>
                    <div>
                      <strong>Devenez Founding Partner pour publier en export</strong>
                      <p>La publication d'annonces Import/Export est réservée aux partenaires ayant signé l'Accord Founding Partner VIT AUTO.</p>
                      <Link to="/partner-onboarding" className={styles.btnPrimary}>Devenir Founding Partner →</Link>
                    </div>
                  </div>
                ) : !user?.isFounder && profile?.status === "pending" ? (
                  <div className={styles.alertBox} style={{ borderColor: "#f59e0b" }}>
                    <span>⏳</span>
                    <div>
                      <strong>Candidature en cours d'examen</strong>
                      <p>Notre équipe examine votre dossier sous 48–72h ouvrables. Vous recevrez une notification.</p>
                    </div>
                  </div>
                ) : !user?.isFounder && profile?.status === "rejected" ? (
                  <div className={styles.alertBox} style={{ borderColor: "#ef4444" }}>
                    <span>❌</span>
                    <div>
                      <strong>Candidature refusée</strong>
                      {profile.rejectionReason && <p>Motif : {profile.rejectionReason}</p>}
                      <Link to="/partner-onboarding" className={styles.btnPrimary}>Devenir Founding Partner →</Link>
                    </div>
                  </div>
                ) : profile ? (
                  <div className={styles.verifiedBanner}>
                    <span className={styles.verifiedIcon}>✅</span>
                    <div>
                      <strong>Founding Partner {badgeIcon} {profile.badgeLevel?.toUpperCase()}</strong>
                      <p>Publiez vos annonces import/export — manuellement ou en masse.</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className={styles.btnPrimary} onClick={() => setShowForm(true)}>+ Nouvelle annonce</button>
                      <Link to="/partner-fleet-import?type=export" className={styles.btnPrimary}>📦 Importer en masse</Link>
                    </div>
                  </div>
                ) : (
                  <div className={styles.loadBox}><div className={styles.spinner} /><p>Chargement...</p></div>
                )}

                {/* KPIs */}
                <div className={styles.statsGrid}>
                  {stats.map((s) => (
                    <div key={s.label} className={styles.statCard} style={{ borderTop: `3px solid ${s.color || "#e2e8f0"}` }}>
                      <span className={styles.statIcon}>{s.icon}</span>
                      <span className={styles.statValue}>{s.value}</span>
                      <span className={styles.statLabel}>{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Totaux par devise — chaque transaction affichait sa propre devise
                    isolément, aucun total agrégé n'existait jusqu'ici. */}
                {ieAnalytics.length > 0 && (
                  <div className={styles.recentCard}>
                    <div className={styles.recentHeader}>
                      <h3>💱 Totaux par devise</h3>
                      <button
                        className={styles.btnLink}
                        onClick={async () => {
                          try {
                            const r = await fetch("/api/import-export/transactions/partner/export", { headers });
                            if (!r.ok) { showMsg("Erreur lors de l'export.", "error"); return; }
                            const blob = await r.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url; a.download = `mes-transactions-export-${new Date().toISOString().slice(0, 10)}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch { showMsg("Erreur réseau.", "error"); }
                        }}
                      >
                        📥 Exporter (CSV)
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {ieAnalytics.map((c) => (
                        <div key={c.currency} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: ".85rem" }}>
                          <strong>{c.currency} ({c.count} transaction{c.count > 1 ? "s" : ""})</strong>
                          <span>Total : <strong>{c.totalAmount.toLocaleString("fr-FR")} {c.currency}</strong></span>
                          {c.inEscrow > 0 && <span style={{ color: "#d97706" }}>En séquestre : {c.inEscrow.toLocaleString("fr-FR")} {c.currency}</span>}
                          {c.totalPayout > 0 && <span style={{ color: "#059669" }}>Versé net : {c.totalPayout.toLocaleString("fr-FR")} {c.currency}</span>}
                          {c.disputed > 0 && <span style={{ color: "#dc2626" }}>En litige : {c.disputed.toLocaleString("fr-FR")} {c.currency}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dernières annonces */}
                {listings.length > 0 && (
                  <div className={styles.recentCard}>
                    <div className={styles.recentHeader}>
                      <h3>Annonces récentes</h3>
                      <button className={styles.btnLink} onClick={() => setActiveTab("listings")}>Voir tout →</button>
                    </div>
                    {listings.slice(0, 3).map((l) => {
                      const st = STATUS_CFG[l.status] || STATUS_CFG.pending;
                      return (
                        <div key={l._id} className={styles.recentRow}>
                          {l.mainPhoto
                            ? <img src={l.mainPhoto} className={styles.recentThumb} alt={l.title} loading="lazy" decoding="async" />
                            : <div className={styles.recentThumbEmpty}>🚗</div>
                          }
                          <div className={styles.recentInfo}>
                            <strong>{l.title}</strong>
                            <span>{l.make} {l.model} {l.year} — {l.sourceCountry}</span>
                          </div>
                          <div>
                            <span className={styles.badge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
                            <span className={styles.price}>{fmtPrice(l.price, l.currency)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── TRANSACTIONS ── */}
            {activeTab === "transactions" && (
              <div className={styles.tabContent}>
                <h2 className={styles.tabTitle}>Mes transactions</h2>
                <p className={styles.tabSub}>Gérez les réservations et commandes de vos clients.</p>

                {transactions.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span>📋</span>
                    <p>Aucune transaction pour l'instant. Lorsque des clients réservent vos véhicules, elles apparaissent ici.</p>
                  </div>
                ) : (
                  <div className={styles.txList}>
                    {transactions.map((tx) => {
                      const cfg = TX_STATUS_CFG[tx.status] || { label: tx.status, color: "#64748b", bg: "#f8fafc" };
                      const isUrgent = ["reserved", "in_escrow"].includes(tx.status);
                      return (
                        <Link
                          key={tx._id}
                          to={`/import-export/transaction/${tx._id}`}
                          className={`${styles.txRow} ${isUrgent ? styles.txRowUrgent : ""}`}
                        >
                          <div className={styles.txRowImg}>
                            {tx.listing?.mainPhoto
                              ? <img src={tx.listing.mainPhoto} alt="" loading="lazy" decoding="async" />
                              : <span>🚗</span>
                            }
                          </div>
                          <div className={styles.txRowInfo}>
                            <strong>{tx.listing?.title || "Véhicule"}</strong>
                            <span>{tx.listing?.make} {tx.listing?.model} {tx.listing?.year}</span>
                            <span>Client : {tx.client?.firstName} {tx.client?.lastName}</span>
                            {tx.destCountry && <span>→ {tx.destCountry}</span>}
                          </div>
                          <div className={styles.txRowRight}>
                            <span className={styles.badge} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                            {tx.finalOffer?.totalAmount && (
                              <span className={styles.price}>{fmtPrice(tx.finalOffer.totalAmount, tx.finalOffer.currency)}</span>
                            )}
                            <span className={styles.txDate}>{fmtDate(tx.createdAt)}</span>
                            {isUrgent && <span className={styles.urgentTag}>Action requise →</span>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── ANNONCES ── */}
            {activeTab === "listings" && (
              <div className={styles.tabContent}>
                <div className={styles.tabHeader}>
                  <h2 className={styles.tabTitle}>Mes annonces Import/Export</h2>
                  {isVerified && (
                    <button className={styles.btnPrimary} onClick={() => setShowForm(true)}>+ Nouvelle annonce</button>
                  )}
                </div>

                {!isVerified && (
                  <div className={styles.alertBox} style={{ borderColor: "#f59e0b" }}>
                    <span>⚠️</span>
                    <p>Vous devez être <strong>importateur vérifié</strong> pour publier des annonces.</p>
                  </div>
                )}

                {listings.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span>📢</span>
                    <p>Aucune annonce publiée pour l'instant.</p>
                    {isVerified && <button className={styles.btnPrimary} onClick={() => setShowForm(true)}>Créer ma première annonce</button>}
                  </div>
                ) : (
                  <div className={styles.listingsGrid}>
                    {listings.map((l) => {
                      const st = STATUS_CFG[l.status] || STATUS_CFG.pending;
                      return (
                        <div key={l._id} className={styles.listingCard}>
                          <div className={styles.listingImg}>
                            {l.mainPhoto ? <img src={l.mainPhoto} alt={l.title} loading="lazy" decoding="async" /> : <span>🚗</span>}
                            <span className={styles.listingBadge} style={{ color: st.color, background: st.bg }}>{st.label}</span>
                          </div>
                          <div className={styles.listingBody}>
                            <strong className={styles.listingTitle}>{l.title}</strong>
                            <span className={styles.listingMeta}>{l.make} {l.model} {l.year} · {l.condition}</span>
                            <span className={styles.listingMeta}>🌍 {l.sourceCountry} · {fmtDate(l.createdAt)}</span>
                            <span className={styles.listingPrice}>{fmtPrice(l.price, l.currency)}</span>
                            <div className={styles.listingStats}>
                              <span>👁️ {l.views || 0} vues</span>
                              <span>💬 {l.inquiries || 0} demandes</span>
                            </div>
                            {l.adminNote && (
                              <p className={styles.adminNote}>Note admin : {l.adminNote}</p>
                            )}
                          </div>
                          <div className={styles.listingActions}>
                            <button className={styles.btnGhost} onClick={() => openEditListing(l._id)}>✏️ Modifier</button>
                            <button className={styles.btnDanger} onClick={() => deleteListing(l._id)}>Supprimer</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── PROFIL ── */}
            {activeTab === "profile" && (
              <div className={styles.tabContent}>
                <h2 className={styles.tabTitle}>Mon profil importateur</h2>
                {!profile ? (
                  <div className={styles.emptyState}>
                    <span>🏢</span>
                    <p>Devenez Founding Partner pour activer votre profil Import/Export.</p>
                    <Link to="/partner-onboarding" className={styles.btnPrimary}>Devenir Founding Partner</Link>
                  </div>
                ) : (
                  <div className={styles.profileCard}>
                    <div className={styles.profileHeader}>
                      {profile.documents?.companyLogo && (
                        <img src={profile.documents.companyLogo} className={styles.companyLogo} alt="logo" />
                      )}
                      <div>
                        <h3>{profile.companyName}</h3>
                        <span className={styles.badge} style={{ color: pStatus.color, background: pStatus.bg }}>
                          {pStatus.icon} {pStatus.label} {badgeIcon}
                        </span>
                        {profile.submittedAt && <p className={styles.profileDate}>Soumis le {fmtDate(profile.submittedAt)}</p>}
                        {profile.reviewedAt && <p className={styles.profileDate}>Examiné le {fmtDate(profile.reviewedAt)}</p>}
                        {profile.rejectionReason && (
                          <p className={styles.rejectReason}>Motif refus : {profile.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                    <div className={styles.profileGrid}>
                      <div>
                        <p><strong>RCCM :</strong> {profile.rccm || "—"}</p>
                        <p><strong>NIF :</strong> {profile.taxId || "—"}</p>
                        <p><strong>Agrément :</strong> {profile.operatingLicense || "—"}</p>
                        <p><strong>Adresse :</strong> {profile.address}, {profile.city}, {profile.country}</p>
                      </div>
                      <div>
                        <p><strong>Activités :</strong> {(profile.activityType || []).join(", ")}</p>
                        <p><strong>Pays :</strong> {(profile.operatingCountries || []).join(", ") || "—"}</p>
                        <p><strong>Catégories :</strong> {(profile.vehicleCategories || []).join(", ") || "—"}</p>
                        <p><strong>Expérience :</strong> {profile.yearsExperience || 0} ans</p>
                      </div>
                    </div>
                    {!user?.isFounder && ["rejected", "not_submitted"].includes(profile.status) && (
                      <Link to="/partner-onboarding" className={styles.btnPrimary}>Devenir Founding Partner →</Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showForm && (
        <ListingForm
          token={token}
          listing={editingListing}
          onClose={() => { setShowForm(false); setEditingListing(null); }}
          onSaved={() => {
            setShowForm(false);
            showMsg(editingListing ? "Annonce mise à jour !" : "Annonce soumise pour validation !");
            setEditingListing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
