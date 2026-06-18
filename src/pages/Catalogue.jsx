import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Catalogue.module.css";
import { useToast } from "../context/ToastContext";

const MODES = [
  { key: "Tout",      icon: "⚡", label: "Tout"       },
  { key: "Louer",     icon: "🔑", label: "Location"   },
  { key: "Acheter",   icon: "💰", label: "Achat"      },
  { key: "Chauffeur", icon: "👨‍✈️", label: "Chauffeur" },
];

const TYPE_ICONS = {
  "Tous": "🚘", "SUV": "🚙", "Berline": "🚗", "Viano": "🚐",
  "Monospace": "🚌", "Citadine": "🏎️", "4x4": "🛻", "Sportif": "⚡",
  "Pick-up": "🛻", "Cabriolet": "🚗", "Utilitaire": "📦", "Minibus": "🚌",
};

const types         = Object.keys(TYPE_ICONS);
const etats         = ["Tous", "Neuf", "Occasion"];
const fuels         = ["Tous", "Essence", "Diesel", "Hybride", "Électrique", "GPL"];
const transmissions = ["Tous", "Automatique", "Manuelle"];
const SORT_OPTIONS  = [
  { key: "default", label: "Par défaut" },
  { key: "price_asc",  label: "Prix croissant" },
  { key: "price_desc", label: "Prix décroissant" },
  { key: "newest",     label: "Plus récent" },
];

const Catalogue = () => {
  const { vehicles, refreshVehicles } = useVehicles();
  const { fmt } = useCurrency();
  const { success: toastSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshing,  setRefreshing]  = useState(false);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [sortKey,     setSortKey]     = useState("default");
  const [page,        setPage]        = useState(1); // eslint-disable-line no-unused-vars

  const [activeMode, setActiveMode] = useState(
    () => { const m = searchParams.get("mode") || "Tout"; return MODES.find(x => x.key === m) ? m : "Tout"; }
  );
  const [searchTerm,   setSearchTerm]   = useState(() => searchParams.get("location") || "");
  const [activeType,   setActiveType]   = useState(() => searchParams.get("type")     || "Tous");
  const [activeEtat,   setActiveEtat]   = useState(() => searchParams.get("etat")     || "Tous");
  const [fuelType,     setFuelType]     = useState("Tous");
  const [transmission, setTransmission] = useState("Tous");
  const [maxPrice,     setMaxPrice]     = useState(200000);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "Tous" || value === "Tout") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const resetFilters = () => {
    setActiveType("Tous"); setActiveEtat("Tous"); setFuelType("Tous");
    setTransmission("Tous"); setMaxPrice(200000); setSearchTerm("");
    setActiveMode("Tout"); setSearchParams(new URLSearchParams()); setPage(1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshVehicles();
    setRefreshing(false);
    toastSuccess("Catalogue actualisé");
  };

  const filtered = useMemo(() => {
    let list = vehicles.filter((v) => {
      const modeOk = activeMode === "Tout" || v.mode === activeMode;
      const typeOk = activeType === "Tous" || (v.vehicleType || v.type) === activeType;
      const etatOk = activeEtat === "Tous"
        || (activeEtat === "Neuf"     && v.etat === "Neuf")
        || (activeEtat === "Occasion" && v.etat && v.etat !== "Neuf");
      const fuelOk = fuelType === "Tous" || (v.fuel || v.carburant) === fuelType;
      const transOk = transmission === "Tous" || v.transmission === transmission;
      const priceOk = activeMode === "Acheter" || (v.pricePerDay || 0) <= maxPrice;
      const q = searchTerm.toLowerCase();
      const textOk = !q
        || (v.title || v.name || "").toLowerCase().includes(q)
        || (v.description || "").toLowerCase().includes(q)
        || (v.ville || v.city || "").toLowerCase().includes(q)
        || (v.marque || "").toLowerCase().includes(q);
      return modeOk && typeOk && etatOk && fuelOk && transOk && priceOk && textOk;
    });

    if (sortKey === "price_asc")  list = [...list].sort((a,b) => (a.pricePerDay||a.priceForSale||0) - (b.pricePerDay||b.priceForSale||0));
    if (sortKey === "price_desc") list = [...list].sort((a,b) => (b.pricePerDay||b.priceForSale||0) - (a.pricePerDay||a.priceForSale||0));
    if (sortKey === "newest")     list = [...list].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    return list;
  }, [vehicles, activeMode, activeType, activeEtat, fuelType, transmission, maxPrice, searchTerm, sortKey]);

  const activeChips = [
    activeMode !== "Tout"      && { label: activeMode,      clear: () => { setActiveMode("Tout"); setParam("mode",""); } },
    activeType !== "Tous"      && { label: activeType,      clear: () => { setActiveType("Tous"); setParam("type",""); } },
    activeEtat !== "Tous"      && { label: activeEtat,      clear: () => { setActiveEtat("Tous"); setParam("etat",""); } },
    fuelType   !== "Tous"      && { label: fuelType,        clear: () => setFuelType("Tous") },
    transmission !== "Tous"    && { label: transmission,    clear: () => setTransmission("Tous") },
    maxPrice < 200000          && { label: `≤ ${fmt(maxPrice)}`, clear: () => setMaxPrice(200000) },
    searchTerm                 && { label: `"${searchTerm}"`, clear: () => setSearchTerm("") },
  ].filter(Boolean);

  return (
    <div className={styles.page}>

      {/* ══════════════════════════════
          HEADER
      ══════════════════════════════ */}
      <header className={styles.header}>
        <div className={styles.headerDeco1} />
        <div className={styles.headerDeco2} />

        <div className={styles.headerInner}>

          {/* Ligne 1 : titre + refresh */}
          <div className={styles.headerRow}>
            <div>
              <span className={styles.headerTag}>🚗 VIT AUTO</span>
              <h1 className={styles.headerTitle}>Catalogue</h1>
            </div>
            <button
              type="button"
              className={`${styles.refreshBtn} ${refreshing ? styles.refreshSpinning : ""}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title="Actualiser"
            >
              <span>↻</span>
            </button>
          </div>

          {/* Ligne 2 : tabs mode */}
          <nav className={styles.modeTabs}>
            {MODES.map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                className={`${styles.modeTab} ${activeMode === key ? styles.modeTabActive : ""}`}
                onClick={() => { setActiveMode(key); setParam("mode", key === "Tout" ? "" : key); setPage(1); }}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Ligne 3 : search */}
          <div className={styles.searchBar}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Marque, modèle, ville…"
              className={styles.searchInput}
            />
            {searchTerm && (
              <button type="button" className={styles.searchClear} onClick={() => setSearchTerm("")}>✕</button>
            )}
          </div>

          {/* Ligne 4 : type pills avec icônes */}
          <div className={styles.typePillsRow}>
            {types.map((t) => (
              <button
                key={t}
                type="button"
                className={`${styles.typePill} ${activeType === t ? styles.typePillActive : ""}`}
                onClick={() => { setActiveType(t); setParam("type", t); }}
              >
                <span>{TYPE_ICONS[t]}</span>
                <span>{t === "Tous" ? "Tout" : t}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Wave de transition */}
        <div className={styles.headerWave}>
          <svg viewBox="0 0 1440 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,40 C360,0 1080,0 1440,40 L1440,40 L0,40 Z" fill="#f5f7fb"/>
          </svg>
        </div>
      </header>

      {/* ══════════════════════════════
          CORPS
      ══════════════════════════════ */}
      <div className={styles.body}>

        {/* Barre résultats */}
        <div className={styles.resultsBar}>
          <div className={styles.resultsLeft}>
            <span className={styles.resultCount}>
              <strong>{filtered.length}</strong> véhicule{filtered.length !== 1 ? "s" : ""}
            </span>

            {/* Chips filtres actifs */}
            {activeChips.map((chip, i) => (
              <button key={i} type="button" className={styles.activeChip} onClick={chip.clear}>
                {chip.label} <span>✕</span>
              </button>
            ))}

            {activeChips.length > 1 && (
              <button type="button" className={styles.clearAllBtn} onClick={resetFilters}>
                Tout effacer
              </button>
            )}
          </div>

          <div className={styles.resultsRight}>
            {/* Bouton filtre mobile */}
            <button
              type="button"
              className={styles.filterToggleBtn}
              onClick={() => setFilterOpen(true)}
            >
              ⚙️ Filtres
              {activeChips.length > 0 && (
                <span className={styles.filterBadge}>{activeChips.length}</span>
              )}
            </button>

            {/* Sort */}
            <select
              className={styles.sortSelect}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Drawer mobile */}
        {filterOpen && (
          <>
            <div className={styles.overlay} onClick={() => setFilterOpen(false)} />
            <div className={styles.drawer}>
              <div className={styles.drawerHandle} />
              <div className={styles.drawerHead}>
                <h3>Filtres</h3>
                <button className={styles.drawerClose} onClick={() => setFilterOpen(false)}>✕</button>
              </div>
              <DrawerFilters
                maxPrice={maxPrice} setMaxPrice={setMaxPrice}
                activeEtat={activeEtat} setActiveEtat={(v) => { setActiveEtat(v); setParam("etat", v); }}
                fuelType={fuelType} setFuelType={setFuelType}
                transmission={transmission} setTransmission={setTransmission}
                fuels={fuels} etats={etats} transmissions={transmissions}
                fmt={fmt}
              />
              <button className={styles.resetBtn} onClick={() => { resetFilters(); setFilterOpen(false); }}>
                Réinitialiser
              </button>
            </div>
          </>
        )}

        {/* Layout sidebar + grille */}
        <div className={styles.layout}>

          {/* ── Sidebar desktop ── */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarInner}>

              <div className={styles.sidebarSection}>
                <h4 className={styles.sidebarTitle}>💰 Prix max / jour</h4>
                <div className={styles.priceRange}>
                  <span className={styles.priceLabel}>{fmt(maxPrice)}</span>
                  <input type="range" min="10000" max="200000" step="5000"
                    value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className={styles.rangeInput} />
                  <div className={styles.rangeLimits}>
                    <span>{fmt(10000)}</span>
                    <span>{fmt(200000)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.sidebarSection}>
                <h4 className={styles.sidebarTitle}>✨ État</h4>
                <div className={styles.pillGroup}>
                  {etats.map((e) => (
                    <button key={e} type="button"
                      className={`${styles.filterPill} ${activeEtat === e ? styles.filterPillActive : ""}`}
                      onClick={() => { setActiveEtat(e); setParam("etat", e); }}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sidebarSection}>
                <h4 className={styles.sidebarTitle}>⛽ Carburant</h4>
                <div className={styles.pillGroup}>
                  {fuels.map((f) => (
                    <button key={f} type="button"
                      className={`${styles.filterPill} ${fuelType === f ? styles.filterPillActive : ""}`}
                      onClick={() => setFuelType(f)}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sidebarSection}>
                <h4 className={styles.sidebarTitle}>⚙️ Transmission</h4>
                <div className={styles.pillGroup}>
                  {transmissions.map((t) => (
                    <button key={t} type="button"
                      className={`${styles.filterPill} ${transmission === t ? styles.filterPillActive : ""}`}
                      onClick={() => setTransmission(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {activeChips.length > 0 && (
                <button className={styles.resetBtn} onClick={resetFilters}>
                  ↺ Réinitialiser les filtres
                </button>
              )}
            </div>
          </aside>

          {/* ── Grille ── */}
          <main className={styles.grid}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>🔍</div>
                <h3>Aucun véhicule trouvé</h3>
                <p>Modifiez vos filtres ou explorez tout le catalogue.</p>
                <button className={styles.emptyReset} onClick={resetFilters}>
                  Voir tous les véhicules
                </button>
              </div>
            ) : (
              filtered.map((car) => (
                <VehicleCard key={car._id || car.id} car={car} />
              ))
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

/* ── Composant filtres drawer mobile ── */
function DrawerFilters({ maxPrice, setMaxPrice, activeEtat, setActiveEtat, fuelType, setFuelType,
  transmission, setTransmission, fuels, etats, transmissions, fmt }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 16 }}>
      <div>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", color: "#0f1b3f" }}>💰 Prix max / jour — {fmt(maxPrice)}</p>
        <input type="range" min="10000" max="200000" step="5000" value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#ff4d2d" }} />
      </div>
      {[
        { title: "✨ État", opts: etats,         val: activeEtat,   set: setActiveEtat },
        { title: "⛽ Carburant", opts: fuels,    val: fuelType,     set: setFuelType },
        { title: "⚙️ Transmission", opts: transmissions, val: transmission, set: setTransmission },
      ].map(({ title, opts, val, set }) => (
        <div key={title}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", color: "#0f1b3f" }}>{title}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {opts.map((o) => (
              <button key={o} type="button" onClick={() => set(o)}
                style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${val === o ? "#ff4d2d" : "#e2e8f0"}`,
                  background: val === o ? "#ff4d2d" : "#fff", color: val === o ? "#fff" : "#374151",
                  fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" }}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Catalogue;
