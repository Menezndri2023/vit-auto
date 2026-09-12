// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrency } from "../../../context/CurrencyContext";
import styles from "../../AdminPanel.module.css";
import { MAX_SPOTLIGHTS_M } from "../shared.jsx";

// Filtre de recherche/pays/type réutilisé par les deux pickers (hero &
// vedette) — barre compacte pensée mobile-first (colonne unique sous ~480px,
// voir styles.pvFilterBar) pour rester utilisable depuis le panel admin sur
// téléphone, pas seulement desktop.
function VehiclePickerFilters({ filter, setFilter, countriesConfig }) {
  return (
    <div className={styles.pvFilterBar}>
      <input className={styles.pvInput} style={{ flex: "2 1 160px" }} placeholder="🔍 Titre, marque, modèle…"
        value={filter.search} onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))} />
      <select className={styles.pvInput} style={{ flex: "1 1 130px" }} value={filter.country}
        onChange={(e) => setFilter((p) => ({ ...p, country: e.target.value }))}>
        <option value="">🌍 Tous pays</option>
        {countriesConfig.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
      </select>
      <select className={styles.pvInput} style={{ flex: "1 1 110px" }} value={filter.type}
        onChange={(e) => setFilter((p) => ({ ...p, type: e.target.value }))}>
        <option value="">Location + Vente</option>
        <option value="location">🔑 Location</option>
        <option value="vente">💰 Vente</option>
      </select>
    </div>
  );
}

export function MarketingSection({ vehicles, token, onRefresh, adsList, adsLoading, adForm, setAdForm, adSaving, saveAd, toggleAdActive, deleteAd }) {
  const { COUNTRIES_CONFIG } = useCurrency();
  const approved = vehicles.filter((v) => v.status === "approved" || v.available);
  const [subTab, setSubTab] = useState("accueil");

  // ── Accueil / Hero ──────────────────────────────────────────────────────────
  // Bug réel corrigé (audit) : ce bloc n'écrivait qu'en localStorage du
  // navigateur admin — aucun visiteur réel du site ne voyait jamais ces
  // changements (le titre/sous-titre n'étaient même pas lus par
  // HeroSection.jsx). Persisté désormais côté serveur (SiteContent) via
  // GET/PATCH /api/site-content/hero.
  // Sélection PAR PAYS (demande explicite) : "GLOBAL" édite la sélection par
  // défaut (heroSpotlights), un code pays édite/crée son entrée dédiée dans
  // heroSpotlightsByCountry — voir HeroSection.jsx pour la logique de repli
  // côté visiteur (pays sans entrée dédiée → sélection globale).
  const [activeCountryTab, setActiveCountryTab] = useState("GLOBAL");
  const [heroSpotlights, setHeroSpotlightsState] = useState([]);
  const [heroByCountry, setHeroByCountry] = useState([]); // [{ country, vehicles }]
  const [heroText, setHeroText] = useState("");
  const [heroSub,  setHeroSub]  = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [heroLoading, setHeroLoading] = useState(true);
  const [heroFilter, setHeroFilter] = useState({ search: "", country: "", type: "" });

  const loadHero = useCallback(() => {
    fetch("/api/site-content/hero")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setHeroText(d.heroTitle || "");
        setHeroSub(d.heroSubtitle || "");
        setHeroSpotlightsState((d.heroSpotlights || []).map((v) => String(v?._id || v)));
        setHeroByCountry((d.heroSpotlightsByCountry || []).map((c) => ({
          country: c.country, vehicles: (c.vehicles || []).map((v) => String(v?._id || v)),
        })));
      })
      .catch(() => {})
      .finally(() => setHeroLoading(false));
  }, []);

  useEffect(() => { loadHero(); }, [loadHero]);

  const flash = (msg) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 2800); };

  const patchHero = async (body) => {
    const r = await fetch("/api/site-content/hero", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return r.ok;
  };

  // Liste actuellement affichée/éditée par l'onglet pays sélectionné.
  const spotlightIds = activeCountryTab === "GLOBAL"
    ? heroSpotlights
    : (heroByCountry.find((c) => c.country === activeCountryTab)?.vehicles || []);

  const saveSpotlights = async (ids) => {
    if (activeCountryTab === "GLOBAL") {
      setHeroSpotlightsState(ids);
    } else {
      setHeroByCountry((prev) => {
        const exists = prev.some((c) => c.country === activeCountryTab);
        return exists
          ? prev.map((c) => (c.country === activeCountryTab ? { ...c, vehicles: ids } : c))
          : [...prev, { country: activeCountryTab, vehicles: ids }];
      });
    }
    const ok = await patchHero({ heroSpotlights: ids, country: activeCountryTab });
    if (!ok) flash("Erreur — non sauvegardé côté serveur");
  };

  const toggleSpotlight = (vid) => {
    const str = String(vid);
    if (spotlightIds.includes(str)) {
      saveSpotlights(spotlightIds.filter((id) => id !== str));
      flash("Retiré du carrousel");
    } else if (spotlightIds.length >= MAX_SPOTLIGHTS_M) {
      flash(`Maximum ${MAX_SPOTLIGHTS_M} véhicules dans le carrousel`);
    } else {
      saveSpotlights([...spotlightIds, str]);
      flash("Ajouté au carrousel ✅");
    }
  };

  const saveHero = async () => {
    const ok = await patchHero({ heroTitle: heroText, heroSubtitle: heroSub, country: activeCountryTab });
    flash(ok ? "Texte héro sauvegardé ✅ (visible par tous les visiteurs)" : "Erreur lors de la sauvegarde");
  };

  const heroPickerVehicles = useMemo(() => {
    const s = heroFilter.search.trim().toLowerCase();
    return approved.filter((v) => {
      if (heroFilter.country && v.country !== heroFilter.country) return false;
      if (heroFilter.type && v.type !== heroFilter.type) return false;
      if (s) {
        const hay = `${v.title || ""} ${v.marque || ""} ${v.modele || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [approved, heroFilter]);

  // ── Vedette ─────────────────────────────────────────────────────────────────
  const [featuredLoading, setFeaturedLoading] = useState(null);
  const [vedetteFilter, setVedetteFilter] = useState({ search: "", country: "", type: "" });

  const toggleFeatured = async (vid, isFeatured) => {
    setFeaturedLoading(vid);
    try {
      // "featured" est un champ de mise à jour partielle géré par la route
      // générique PATCH /:id (voir vehicleController.js, whitelist ADMIN_ONLY)
      // — /:id/feature n'a jamais existé côté serveur, ce qui faisait échouer
      // ce bouton en 404 silencieux (bug réel trouvé en audit).
      const r = await fetch(`/api/vehicles/${vid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ featured: !isFeatured }),
      });
      if (r.ok) { onRefresh(); flash(!isFeatured ? "Véhicule en vedette ⭐" : "Retiré de la vedette"); }
      else flash("Erreur lors de la mise à jour.");
    } catch { flash("Erreur"); }
    setFeaturedLoading(null);
  };

  const featuredVehiclesList = useMemo(() => approved.filter((v) => v.featured), [approved]);
  const featuredCount = featuredVehiclesList.length;

  // Répartition par pays — vue d'ensemble rapide avant de plonger dans le
  // filtre détaillé ci-dessous (utile dès que le nombre d'annonces "vedette"
  // dépasse ce qui tient sur un seul écran).
  const featuredByCountry = useMemo(() => {
    const counts = new Map();
    for (const v of featuredVehiclesList) {
      const code = v.country || "—";
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [featuredVehiclesList]);

  const vedettePickerVehicles = useMemo(() => {
    const s = vedetteFilter.search.trim().toLowerCase();
    return approved.filter((v) => {
      if (vedetteFilter.country && v.country !== vedetteFilter.country) return false;
      if (vedetteFilter.type && v.type !== vedetteFilter.type) return false;
      if (s) {
        const hay = `${v.title || ""} ${v.marque || ""} ${v.modele || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [approved, vedetteFilter]);

  const SUB_TABS_M = [
    { k: "accueil",  l: "🏠 Page d'accueil",       desc: "Texte hero & carrousel" },
    { k: "vedette",  l: "⭐ Véhicules en vedette",  desc: "Mise en avant catalogue" },
    { k: "campagnes",l: "📢 Campagnes",             desc: "Bannières & promotions (bientôt)" },
  ];

  return (
    <div className={styles.scrollZone}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { l: "Annonces publiées", v: approved.length, c: "#16a34a" },
          { l: "En vedette",        v: featuredCount,   c: "#f59e0b" },
          { l: "Dans le carrousel", v: spotlightIds.length, c: "#6366f1" },
        ].map(({ l, v, c }) => (
          <div key={l} className={styles.pvStatCard} style={{ borderLeftColor: c }}>
            <div className={styles.pvStatVal} style={{ color: c }}>{v}</div>
            <div className={styles.pvStatLbl}>{l}</div>
          </div>
        ))}
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {SUB_TABS_M.map((t) => (
          <button key={t.k} onClick={() => setSubTab(t.k)}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: ".82rem", borderBottom: subTab === t.k ? "3px solid #6366f1" : "3px solid transparent", color: subTab === t.k ? "#6366f1" : "#64748b", fontFamily: "inherit" }}>
            {t.l}
          </button>
        ))}
      </div>

      {savedMsg && <div style={{ background: "#dcfce7", color: "#16a34a", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontWeight: 700 }}>{savedMsg}</div>}

      {/* ── Accueil ── */}
      {subTab === "accueil" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Texte hero */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>✏️ Texte de la bannière principale</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label className={styles.pvLabel}>Titre principal</label>
                <input className={styles.pvInput} value={heroText} onChange={e => setHeroText(e.target.value)} placeholder="Ex : Trouvez votre véhicule idéal en Afrique" />
              </div>
              <div><label className={styles.pvLabel}>Sous-titre</label>
                <input className={styles.pvInput} value={heroSub} onChange={e => setHeroSub(e.target.value)} placeholder="Ex : Location, vente et import/export dans 14 pays" />
              </div>
              <button className={styles.btnPrimary} style={{ alignSelf: "flex-start" }} onClick={saveHero} disabled={heroLoading}>
                {heroLoading ? "Chargement…" : "Sauvegarder"}
              </button>
            </div>
          </div>

          {/* Carrousel hero — sélection par pays (demande explicite) */}
          <div className={styles.chartCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <h3 className={styles.chartTitle} style={{ margin: 0 }}>🎠 Carrousel Hero ({spotlightIds.length}/{MAX_SPOTLIGHTS_M})</h3>
              <button className={styles.btnSmall} onClick={() => saveSpotlights([])}>Vider cette sélection</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className={styles.pvLabel}>Pays ciblé par cette sélection</label>
              <select className={styles.pvInput} style={{ maxWidth: 280 }} value={activeCountryTab}
                onChange={(e) => setActiveCountryTab(e.target.value)}>
                <option value="GLOBAL">🌍 Global (par défaut, tous pays sans sélection dédiée)</option>
                {COUNTRIES_CONFIG.map((c) => {
                  const n = heroByCountry.find((h) => h.country === c.code)?.vehicles.length || 0;
                  return <option key={c.code} value={c.code}>{c.flag} {c.name}{n ? ` (${n})` : ""}</option>;
                })}
              </select>
              <p style={{ fontSize: ".76rem", color: "#94a3b8", margin: "4px 0 0" }}>
                {activeCountryTab === "GLOBAL"
                  ? "Affiché à tout visiteur dont le pays n'a pas de sélection dédiée ci-dessous."
                  : "Affiché uniquement aux visiteurs de ce pays — tant que vide, ils voient la sélection Globale."}
              </p>
            </div>

            <VehiclePickerFilters filter={heroFilter} setFilter={setHeroFilter} countriesConfig={COUNTRIES_CONFIG} />

            {heroPickerVehicles.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Aucune annonce ne correspond à ce filtre.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                {heroPickerVehicles.map((v) => {
                  const vid = String(v._id || v.id);
                  const inSpotlight = spotlightIds.includes(vid);
                  return (
                    <div key={vid} style={{ border: `2px solid ${inSpotlight ? "#6366f1" : "#e2e8f0"}`, borderRadius: 10, overflow: "hidden", transition: "border-color .2s" }}>
                      {(v.images?.[0] || v.image)
                        ? <img src={v.images?.[0] || v.image} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: 90, objectFit: "cover" }} />
                        : <div style={{ height: 90, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>🚗</div>
                      }
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#0f1b3f", marginBottom: 2 }}>{v.title || `${v.marque} ${v.modele}`}</div>
                        <div style={{ fontSize: ".7rem", color: "#94a3b8", marginBottom: 6 }}>
                          {COUNTRIES_CONFIG.find((c) => c.code === v.country)?.flag || "🌍"} {v.type === "vente" ? "Vente" : "Location"}
                        </div>
                        <button onClick={() => toggleSpotlight(vid)}
                          style={{ width: "100%", padding: "4px 0", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".74rem",
                            background: inSpotlight ? "#6366f1" : "#f1f5f9", color: inSpotlight ? "#fff" : "#475569" }}>
                          {inSpotlight ? "✓ Dans le carrousel" : "+ Ajouter"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Vedette ── */}
      {subTab === "vedette" && (
        <div className={styles.chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
            <h3 className={styles.chartTitle} style={{ margin: 0 }}>⭐ Véhicules en vedette ({featuredCount} actifs)</h3>
            <span style={{ fontSize: ".78rem", color: "#94a3b8" }}>Un visiteur voit d'abord la vedette de son pays, puis la vedette globale en repli</span>
          </div>

          {featuredByCountry.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {featuredByCountry.map(([code, n]) => (
                <button key={code} onClick={() => setVedetteFilter((p) => ({ ...p, country: p.country === code ? "" : code }))}
                  style={{ fontSize: ".74rem", fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: vedetteFilter.country === code ? "#f59e0b" : "#fef3c7", color: vedetteFilter.country === code ? "#fff" : "#b45309" }}>
                  {COUNTRIES_CONFIG.find((c) => c.code === code)?.flag || "🌍"} {COUNTRIES_CONFIG.find((c) => c.code === code)?.name || code} · {n}
                </button>
              ))}
            </div>
          )}

          <VehiclePickerFilters filter={vedetteFilter} setFilter={setVedetteFilter} countriesConfig={COUNTRIES_CONFIG} />

          {vedettePickerVehicles.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: ".85rem" }}>Aucune annonce ne correspond à ce filtre.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {vedettePickerVehicles.map((v) => {
                const vid = v._id || v.id;
                return (
                  <div key={vid} style={{ border: `2px solid ${v.featured ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 12, overflow: "hidden", transition: "border-color .2s" }}>
                    {(v.images?.[0] || v.image)
                      ? <img src={v.images?.[0] || v.image} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: 100, objectFit: "cover" }} />
                      : <div style={{ height: 100, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }}>🚗</div>
                    }
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#0f1b3f", marginBottom: 2 }}>{v.title || `${v.marque} ${v.modele} ${v.annee}`}</div>
                      <div style={{ fontSize: ".72rem", color: "#94a3b8", marginBottom: 8 }}>
                        {COUNTRIES_CONFIG.find((c) => c.code === v.country)?.flag || "🌍"} {v.type === "vente" ? "Vente" : "Location"}
                      </div>
                      <button onClick={() => toggleFeatured(vid, v.featured)} disabled={featuredLoading === vid}
                        style={{ width: "100%", padding: "5px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".78rem",
                          background: v.featured ? "#fef3c7" : "#f1f5f9", color: v.featured ? "#b45309" : "#475569" }}>
                        {featuredLoading === vid ? "…" : v.featured ? "⭐ Retirer vedette" : "+ Mettre en vedette"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Campagnes ── */}
      {subTab === "campagnes" && (
        <AdsSection ads={adsList} loading={adsLoading} form={adForm} setForm={setAdForm} saving={adSaving}
          onSave={saveAd} onToggle={toggleAdActive} onDelete={deleteAd} />
      )}
    </div>
  );
}
