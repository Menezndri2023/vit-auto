import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { COUNTRIES_ALL, CAR_MAKES, VEHICLE_TYPES } from "../data/autocomplete";
import styles from "./ImportExport.module.css";

const fmtPrice = (p, c = "EUR") => p ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const BADGE_CFG = {
  silver:   { label: "Silver",   icon: "🥈", color: "#94a3b8" },
  gold:     { label: "Gold",     icon: "🥇", color: "#f59e0b" },
  platinum: { label: "Platinum", icon: "💎", color: "#6366f1" },
  none:     { label: "",         icon: "",   color: "#94a3b8" },
};

const FUEL_LABELS = {
  essence: "Essence", diesel: "Diesel", hybride: "Hybride",
  hybride_rechargeable: "Hybride rechargeable",
  electrique: "Électrique", gpl: "GPL", autre: "Autre",
};

// ── Formulaire de demande rapide ───────────────────────────────────────────────
function QuickRequestModal({ listing, onClose }) {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    serviceType: "import", pack: "Silver",
    sourceCountry: listing?.sourceCountry || "",
    destCountry: "", vehicleType: listing?.bodyType || "",
    vehicleMake: listing?.make || "", vehicleModel: listing?.model || "",
    budget: listing?.price || "",
    message: `Je suis intéressé(e) par l'annonce : ${listing?.title || ""}`,
  });
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) return;
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/import-export/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: form.budget ? Number(form.budget) : undefined }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        {done ? (
          <div className={styles.modalSuccess}>
            <div className={styles.modalSuccessIcon}>✅</div>
            <h3>Demande envoyée !</h3>
            <p>Notre équipe vous contactera sous 24h à l'adresse <strong>{form.email}</strong>.</p>
            <button className={styles.primaryBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div className={styles.modalHeader}>
              <span className={styles.modalBadge}>🌍 DEMANDE DE CONTACT</span>
              <h2>{listing?.title}</h2>
              <p>Remplissez ce formulaire, notre équipe vous répond sous 24h.</p>
            </div>
            <form onSubmit={submit} className={styles.requestForm} autoComplete="on">
              <datalist id="qr-countries">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
              <div className={styles.formRow}>
                <label><span>Prénom *</span><input autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jean" required /></label>
                <label><span>Nom *</span><input autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dupont" required /></label>
              </div>
              <div className={styles.formRow}>
                <label><span>Email *</span><input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="vous@exemple.com" required /></label>
                <label><span>Téléphone</span><input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+225 07 00 00 00" /></label>
              </div>
              <div className={styles.formRow}>
                <label>
                  <span>Pack souhaité</span>
                  <select value={form.pack} onChange={(e) => set("pack", e.target.value)}>
                    <option value="Silver">Silver — 399 €</option>
                    <option value="Gold">Gold — 799 €</option>
                    <option value="Platinum">Platinum — 1 499 €</option>
                    <option value="Executive">Executive — 2 999 €</option>
                  </select>
                </label>
                <label>
                  <span>Pays de destination</span>
                  <input list="qr-countries" value={form.destCountry} onChange={(e) => set("destCountry", e.target.value)} placeholder="Côte d'Ivoire, Sénégal…" />
                </label>
              </div>
              <label className={styles.formFull}>
                <span>Message / précisions</span>
                <textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} />
              </label>
              {error && <p className={styles.formError}>❌ {error}</p>}
              <button type="submit" className={styles.primaryBtn} disabled={sending}>
                {sending ? "Envoi en cours…" : "Envoyer ma demande →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Carte annonce ──────────────────────────────────────────────────────────────
function ListingCard({ l, onContact }) {
  const badge = BADGE_CFG[l.importerProfile?.badgeLevel || "none"];
  return (
    <div style={{
      background: "#fff", borderRadius: 18, border: "1.5px solid #f1f5f9",
      boxShadow: "0 2px 16px rgba(0,0,0,.06)", overflow: "hidden",
      display: "flex", flexDirection: "column", transition: "transform .15s, box-shadow .15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 16px rgba(0,0,0,.06)"; }}
    >
      {/* Image */}
      <div style={{ position: "relative", height: 200, background: "#f8fafc", overflow: "hidden" }}>
        {l.mainPhoto
          ? <img src={l.mainPhoto} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "3rem", color: "#cbd5e1" }}>🚗</div>
        }
        {/* Pays source badge */}
        <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(15,27,63,.7)", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: ".75rem", fontWeight: 700, backdropFilter: "blur(4px)" }}>
          🌍 {l.sourceCountry}
        </div>
        {/* Badge importateur */}
        {badge.icon && (
          <div style={{ position: "absolute", top: 10, right: 10, background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: ".75rem", fontWeight: 800, color: badge.color, border: `1.5px solid ${badge.color}44` }}>
            {badge.icon} {badge.label}
          </div>
        )}
        {/* Galerie count */}
        {l.photos?.length > 1 && (
          <div style={{ position: "absolute", bottom: 8, right: 10, background: "rgba(0,0,0,.5)", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: ".72rem" }}>
            📷 {l.photos.length}
          </div>
        )}
      </div>

      {/* Corps */}
      <div style={{ padding: "16px 18px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: ".95rem", color: "#0f1b3f", display: "block", lineHeight: 1.3 }}>{l.title}</strong>
          <span style={{ fontSize: ".8rem", color: "#64748b", marginTop: 2, display: "block" }}>
            {l.make} {l.model} {l.year} · {FUEL_LABELS[l.fuelType] || l.fuelType} · {l.condition === "neuf" ? "Neuf" : l.condition === "occasion" ? "Occasion" : "Reconditionné"}
          </span>
        </div>

        {/* Tags livraison */}
        {l.availableIn?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {l.availableIn.slice(0, 4).map((c) => (
              <span key={c} style={{ background: "#eff6ff", color: "#3b82f6", borderRadius: 6, padding: "2px 8px", fontSize: ".72rem", fontWeight: 600 }}>
                {c}
              </span>
            ))}
            {l.availableIn.length > 4 && (
              <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 6, padding: "2px 8px", fontSize: ".72rem" }}>+{l.availableIn.length - 4}</span>
            )}
          </div>
        )}

        {/* Entreprise partenaire */}
        {l.importerProfile?.companyName && (
          <div style={{ fontSize: ".78rem", color: "#64748b", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            🏢 <span>{l.importerProfile.companyName}</span>
          </div>
        )}

        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ff4d2d" }}>{fmtPrice(l.price, l.currency)}</div>
            {l.negotiable && <span style={{ fontSize: ".7rem", color: "#10b981", fontWeight: 600 }}>Prix négociable</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontSize: ".72rem", color: "#94a3b8" }}>👁️ {l.views || 0} vues</span>
            <button
              onClick={() => onContact(l)}
              style={{ padding: "8px 14px", background: "#ff4d2d", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: ".82rem" }}
            >
              Contacter →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═════════════════════════════════════════════════════════════════════════════
export default function IEListings() {
  const [listings,     setListings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [contactModal, setContactModal] = useState(null);

  // ── Filtres
  const [searchMake,   setSearchMake]   = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [sortOrder,    setSortOrder]    = useState("newest");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "approved", limit: 12, page });
      if (filterCountry) params.set("sourceCountry", filterCountry);
      const res = await fetch(`/api/import-export/listings?${params}`);
      if (res.ok) {
        const d = await res.json();
        let list = d.listings || [];
        if (searchMake.trim()) {
          const q = searchMake.toLowerCase();
          list = list.filter((l) =>
            l.make?.toLowerCase().includes(q) ||
            l.model?.toLowerCase().includes(q) ||
            l.title?.toLowerCase().includes(q) ||
            l.bodyType?.toLowerCase().includes(q)
          );
        }
        if (sortOrder === "price_asc")  list.sort((a, b) => a.price - b.price);
        if (sortOrder === "price_desc") list.sort((a, b) => b.price - a.price);
        setListings(list);
        setTotal(d.total || list.length);
      }
    } catch {}
    setLoading(false);
  }, [page, filterCountry, searchMake, sortOrder]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.page}>

      {/* ── Hero compact ── */}
      <section style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a5f 60%, #ff4d2d 100%)",
        padding: "56px 24px 40px", textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at top right, rgba(255,77,45,.15), transparent 60%)" }} />
        <span style={{ display: "inline-block", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 99, padding: "5px 16px", fontSize: ".78rem", fontWeight: 700, letterSpacing: ".08em", marginBottom: 16 }}>
          🌍 ANNONCES IMPORT / EXPORT
        </span>
        <h1 style={{ color: "#fff", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 900, margin: "0 0 12px", lineHeight: 1.2 }}>
          Véhicules disponibles à l'import
        </h1>
        <p style={{ color: "rgba(255,255,255,.75)", fontSize: ".95rem", maxWidth: 560, margin: "0 auto 24px" }}>
          Annonces publiées par nos importateurs certifiés VIT AUTO — Chine, Dubaï, Europe & Afrique.
        </p>
        <Link to="/importer-apply" style={{ display: "inline-block", background: "#fff", color: "#ff4d2d", borderRadius: 12, padding: "11px 26px", fontWeight: 800, fontSize: ".9rem", textDecoration: "none", boxShadow: "0 4px 20px rgba(255,77,45,.25)" }}>
          Devenir importateur partenaire →
        </Link>
      </section>

      {/* ── Barre de filtres ── */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #f1f5f9", padding: "16px 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <datalist id="fl-makes">{CAR_MAKES.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="fl-countries">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1 }}>
          {/* Recherche marque/modèle */}
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>🔍</span>
            <input
              list="fl-makes"
              value={searchMake}
              onChange={(e) => { setSearchMake(e.target.value); setPage(1); }}
              placeholder="Marque, modèle, type…"
              style={{ width: "100%", paddingLeft: 36, paddingRight: 12, height: 40, border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".88rem", boxSizing: "border-box", outline: "none" }}
            />
            {searchMake && (
              <button onClick={() => setSearchMake("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>✕</button>
            )}
          </div>

          {/* Filtre pays d'origine */}
          <div style={{ position: "relative", minWidth: 160 }}>
            <input
              list="fl-countries"
              value={filterCountry}
              onChange={(e) => { setFilterCountry(e.target.value); setPage(1); }}
              placeholder="Pays d'origine…"
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".88rem", boxSizing: "border-box", outline: "none", height: 40 }}
            />
            {filterCountry && (
              <button onClick={() => setFilterCountry("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>✕</button>
            )}
          </div>
        </div>

        {/* Tri */}
        <select
          value={sortOrder}
          onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
          style={{ height: 40, padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".88rem", cursor: "pointer" }}
        >
          <option value="newest">📅 Plus récentes</option>
          <option value="price_asc">💶 Prix croissant</option>
          <option value="price_desc">💶 Prix décroissant</option>
        </select>
      </div>

      {/* ── Résultats ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 20px" }}>

        {/* Compteur */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: ".88rem" }}>
            {loading ? "Chargement…" : `${listings.length} annonce${listings.length !== 1 ? "s" : ""} disponible${listings.length !== 1 ? "s" : ""}`}
            {filterCountry && ` depuis ${filterCountry}`}
            {searchMake && ` · "${searchMake}"`}
          </p>
          <Link to="/import-export" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: ".85rem", textDecoration: "none" }}>
            ← Retour à la page Import/Export
          </Link>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 20 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 380, borderRadius: 18, background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>🌍</div>
            <h3 style={{ margin: "0 0 8px", color: "#475569" }}>
              {searchMake || filterCountry ? "Aucun résultat pour ce filtre" : "Aucune annonce disponible pour l'instant"}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: ".88rem" }}>
              {searchMake || filterCountry
                ? "Essayez un autre filtre ou effacez la recherche."
                : "Les importateurs partenaires vérifiés publieront bientôt leurs véhicules ici."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {(searchMake || filterCountry) && (
                <button onClick={() => { setSearchMake(""); setFilterCountry(""); }} style={{ padding: "10px 20px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                  Effacer les filtres
                </button>
              )}
              <button onClick={() => setContactModal({ title: "Demande personnalisée" })} style={{ padding: "10px 20px", background: "#ff4d2d", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
                Faire une demande personnalisée →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 20 }}>
              {listings.map((l) => (
                <ListingCard key={l._id} l={l} onContact={setContactModal} />
              ))}
            </div>

            {/* Pagination */}
            {total > 12 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 32 }}>
                {page > 1 && (
                  <button onClick={() => setPage((p) => p - 1)} style={{ padding: "9px 18px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                    ← Précédent
                  </button>
                )}
                <span style={{ padding: "9px 18px", color: "#64748b", fontSize: ".88rem" }}>Page {page} sur {Math.ceil(total / 12)}</span>
                {page < Math.ceil(total / 12) && (
                  <button onClick={() => setPage((p) => p + 1)} style={{ padding: "9px 18px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                    Suivant →
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* CTA Partenaire */}
        <div style={{
          marginTop: 48, background: "linear-gradient(135deg, #0f1b3f, #1e3a5f)", borderRadius: 20,
          padding: "32px 28px", display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
        }}>
          <div>
            <h3 style={{ color: "#fff", margin: "0 0 8px", fontSize: "1.15rem" }}>Vous êtes importateur ?</h3>
            <p style={{ color: "rgba(255,255,255,.7)", margin: 0, fontSize: ".88rem" }}>
              Rejoignez notre réseau de partenaires vérifiés et publiez vos véhicules import/export.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/importer-apply" style={{ display: "inline-block", padding: "11px 22px", background: "#ff4d2d", color: "#fff", borderRadius: 12, fontWeight: 700, textDecoration: "none", fontSize: ".88rem" }}>
              Devenir partenaire →
            </Link>
            <Link to="/import-export" style={{ display: "inline-block", padding: "11px 22px", border: "1.5px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 12, fontWeight: 700, textDecoration: "none", fontSize: ".88rem" }}>
              En savoir plus
            </Link>
          </div>
        </div>

        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      </div>

      {contactModal && (
        <QuickRequestModal listing={contactModal} onClose={() => setContactModal(null)} />
      )}
    </div>
  );
}
