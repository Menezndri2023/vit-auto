import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { COUNTRIES_ALL, CAR_MAKES } from "../data/autocomplete";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./IEListings.module.css";
import ieModalStyles from "./ImportExport.module.css";

const fmtPrice = (p, c = "EUR") => p ? `${Number(p).toLocaleString("fr-FR")} ${c}` : "—";

const BADGE_CFG = {
  silver:   { label: "Silver",   icon: "🥈" },
  gold:     { label: "Gold",     icon: "🥇" },
  platinum: { label: "Platinum", icon: "💎" },
  none:     { label: "",         icon: "" },
};

const FUEL_LABELS = {
  essence: "Essence", diesel: "Diesel", hybride: "Hybride",
  hybride_rechargeable: "Hybride rech.", electrique: "Électrique",
  gpl: "GPL", autre: "Autre",
};

// ── Modal de demande rapide ────────────────────────────────────────────────
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
    <div className={ieModalStyles.modalOverlay} onClick={onClose}>
      <div className={ieModalStyles.modalBox} onClick={(e) => e.stopPropagation()}>
        <button className={ieModalStyles.modalClose} onClick={onClose}>✕</button>
        {done ? (
          <div className={ieModalStyles.modalSuccess}>
            <div className={ieModalStyles.modalSuccessIcon}>✅</div>
            <h3>Demande envoyée !</h3>
            <p>Notre équipe vous contactera sous 24h à l'adresse <strong>{form.email}</strong>.</p>
            <button className={ieModalStyles.primaryBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <>
            <div className={ieModalStyles.modalHeader}>
              <span className={ieModalStyles.modalBadge}>🌍 DEMANDE DE CONTACT</span>
              <h2>{listing?.title}</h2>
              <p>Notre équipe vous répond sous 24h.</p>
            </div>
            <form onSubmit={submit} className={ieModalStyles.requestForm} autoComplete="on">
              <datalist id="qr-countries">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>
              <div className={ieModalStyles.formRow}>
                <label><span>Prénom *</span><input autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jean" required /></label>
                <label><span>Nom *</span><input autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Dupont" required /></label>
              </div>
              <div className={ieModalStyles.formRow}>
                <label><span>Email *</span><input type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="vous@exemple.com" required /></label>
                <label><span>Téléphone</span><input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+225 07 00 00 00" /></label>
              </div>
              <div className={ieModalStyles.formRow}>
                <label className={ieModalStyles.formFull}>
                  <span>Pays de destination</span>
                  <input list="qr-countries" value={form.destCountry} onChange={(e) => set("destCountry", e.target.value)} placeholder="Côte d'Ivoire, Sénégal…" />
                </label>
              </div>
              <label className={ieModalStyles.formFull}>
                <span>Message</span>
                <textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} />
              </label>
              {error && <p className={ieModalStyles.formError}>❌ {error}</p>}
              <button type="submit" className={ieModalStyles.primaryBtn} disabled={sending}>
                {sending ? "Envoi en cours…" : "Envoyer ma demande →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Carte annonce ──────────────────────────────────────────────────────────
function ListingCard({ l, onContact }) {
  const badge = BADGE_CFG[l.importerProfile?.badgeLevel || "none"];
  return (
    <div className={styles.card}>
      <Link to={`/import-export/listings/${l._id}`} className={styles.cardImgLink}>
        <div className={styles.cardImg}>
          {l.mainPhoto
            ? <img src={l.mainPhoto} alt={l.title} />
            : <div className={styles.cardImgFallback}>🚗</div>
          }
          <div className={styles.cardOrigin}>🌍 {l.sourceCountry}</div>
          {badge.icon && (
            <div className={styles.cardBadge}>{badge.icon} {badge.label}</div>
          )}
          {l.photos?.length > 1 && (
            <div className={styles.cardPhotoCount}>📷 {l.photos.length}</div>
          )}
          {l.inspectionReport && (
            <div className={styles.cardInspected}>🔍 Inspecté</div>
          )}
        </div>
      </Link>

      <div className={styles.cardBody}>
        <Link to={`/import-export/listings/${l._id}`} className={styles.cardTitleLink}>
          <p className={styles.cardTitle}>{l.title}</p>
        </Link>
        <span className={styles.cardMeta}>
          {l.make} {l.model} {l.year} · {FUEL_LABELS[l.fuelType] || l.fuelType} · {l.condition === "neuf" ? "Neuf" : l.condition === "occasion" ? "Occasion" : "Reconditionné"}
        </span>

        {l.availableIn?.length > 0 && (
          <div className={styles.cardTags}>
            {l.availableIn.slice(0, 4).map((c) => (
              <span key={c} className={styles.cardTag}>{c}</span>
            ))}
            {l.availableIn.length > 4 && (
              <span className={styles.cardTagMore}>+{l.availableIn.length - 4}</span>
            )}
          </div>
        )}

        {l.importerProfile?.companyName && (
          <div className={styles.cardCompany}>🏢 {l.importerProfile.companyName}</div>
        )}

        {l.estimatedDelay && (
          <div className={styles.cardDelay}>⏱️ {l.estimatedDelay}</div>
        )}

        <div className={styles.cardFooter}>
          <div>
            <span className={styles.cardPrice}>{fmtPrice(l.price, l.currency)}</span>
            {l.negotiable && <span className={styles.cardNeg}>Négociable</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={styles.cardViews}>👁️ {l.views || 0}</span>
            <Link to={`/import-export/listings/${l._id}`} className={styles.cardCta}>
              Voir →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═════════════════════════════════════════════════════════════════════════
export default function IEListings() {
  const { catalogCountry } = useCurrency();
  const [listings,     setListings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [contactModal, setContactModal] = useState(null);

  const [searchMake,    setSearchMake]    = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [sortOrder,     setSortOrder]     = useState("newest");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "approved", limit: 12, page });
      if (filterCountry) params.set("sourceCountry", filterCountry);
      if (catalogCountry) params.set("country", catalogCountry);
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
  }, [page, filterCountry, searchMake, sortOrder, catalogCountry]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <span className={styles.heroBadge}>🌍 ANNONCES IMPORT / EXPORT</span>
        <h1 className={styles.heroTitle}>Véhicules disponibles à l'import</h1>
        <p className={styles.heroSub}>
          Annonces publiées par nos importateurs certifiés VIT AUTO — Chine, Dubaï, Europe & Afrique.
        </p>
        <Link to="/importer-apply" className={styles.heroCta}>
          Devenir importateur partenaire →
        </Link>
      </section>

      {/* ── Filtres ── */}
      <div className={styles.filterBar}>
        <datalist id="fl-makes">{CAR_MAKES.map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="fl-countries">{COUNTRIES_ALL.map((c) => <option key={c} value={c} />)}</datalist>

        <div className={styles.filterInputs}>
          <div className={styles.filterSearch}>
            <span className={styles.filterSearchIcon}>🔍</span>
            <input
              list="fl-makes"
              className={styles.filterInput}
              value={searchMake}
              onChange={(e) => { setSearchMake(e.target.value); setPage(1); }}
              placeholder="Marque, modèle, type…"
            />
            {searchMake && (
              <button className={styles.filterClear} onClick={() => setSearchMake("")}>✕</button>
            )}
          </div>

          <div className={styles.filterCountry}>
            <input
              list="fl-countries"
              className={styles.filterCountryInput}
              value={filterCountry}
              onChange={(e) => { setFilterCountry(e.target.value); setPage(1); }}
              placeholder="Pays d'origine…"
            />
            {filterCountry && (
              <button className={styles.filterClear} style={{ right: 10, top: "50%", transform: "translateY(-50%)", position: "absolute" }} onClick={() => setFilterCountry("")}>✕</button>
            )}
          </div>
        </div>

        <select
          className={styles.filterSort}
          value={sortOrder}
          onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
        >
          <option value="newest">📅 Plus récentes</option>
          <option value="price_asc">💶 Prix croissant</option>
          <option value="price_desc">💶 Prix décroissant</option>
        </select>
      </div>

      {/* ── Corps ── */}
      <div className={styles.body}>

        <div className={styles.topBar}>
          <p className={styles.count}>
            {loading ? "Chargement…" : `${listings.length} annonce${listings.length !== 1 ? "s" : ""} disponible${listings.length !== 1 ? "s" : ""}`}
            {filterCountry && ` · depuis ${filterCountry}`}
            {searchMake && ` · "${searchMake}"`}
          </p>
          <Link to="/import-export" className={styles.backLink}>← Retour Import/Export</Link>
        </div>

        {loading ? (
          <div className={styles.grid}>
            {[...Array(6)].map((_, i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : listings.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🌍</div>
            <h3>{searchMake || filterCountry ? "Aucun résultat pour ce filtre" : "Aucune annonce disponible"}</h3>
            <p>
              {searchMake || filterCountry
                ? "Essayez un autre filtre ou effacez la recherche."
                : "Les importateurs partenaires vérifiés publieront bientôt leurs véhicules ici."}
            </p>
            <div className={styles.emptyActions}>
              {(searchMake || filterCountry) && (
                <button className={styles.emptyBtnPrimary} onClick={() => { setSearchMake(""); setFilterCountry(""); }}>
                  Effacer les filtres
                </button>
              )}
              <button className={styles.emptyBtnSecondary} onClick={() => setContactModal({ title: "Demande personnalisée" })}>
                Faire une demande personnalisée →
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {listings.map((l) => (
                <ListingCard key={l._id} l={l} onContact={setContactModal} />
              ))}
            </div>

            {total > 12 && (
              <div className={styles.pagination}>
                {page > 1 && (
                  <button className={styles.pageBtn} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
                )}
                <span className={styles.pageInfo}>Page {page} / {Math.ceil(total / 12)}</span>
                {page < Math.ceil(total / 12) && (
                  <button className={styles.pageBtn} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
                )}
              </div>
            )}
          </>
        )}

        {/* CTA Partenaire */}
        <div className={styles.partnerCta}>
          <div className={styles.partnerCtaText}>
            <h3>Vous êtes importateur ?</h3>
            <p>Rejoignez notre réseau de partenaires vérifiés et publiez vos véhicules import/export.</p>
          </div>
          <div className={styles.partnerCtaActions}>
            <Link to="/importer-apply" className={styles.partnerCtaBtnPrimary}>Devenir partenaire →</Link>
            <Link to="/import-export" className={styles.partnerCtaBtnGhost}>En savoir plus</Link>
          </div>
        </div>
      </div>

      {contactModal && (
        <QuickRequestModal listing={contactModal} onClose={() => setContactModal(null)} />
      )}
    </div>
  );
}
