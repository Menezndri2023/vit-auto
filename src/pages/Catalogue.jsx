import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { useVehicles } from "../context/VehicleContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./Catalogue.module.css";
import { useToast } from "../context/ToastContext";
import { haversineKm, getCurrentPosition } from "../utils/geo";
import { getCountryFlag } from "../data/autocomplete";

const MODES = [
  { key: "Tout",      icon: "⚡", label: "Tout"         },
  { key: "Louer",     icon: "🔑", label: "Location"     },
  { key: "Acheter",   icon: "💰", label: "Achat"        },
  { key: "Chauffeur", icon: "👨‍✈️", label: "Chauffeur"   },
  { key: "Import",    icon: "🌍", label: "Import/Export" },
];

const TYPE_ICONS = {
  "Tous": "🚘", "SUV": "🚙", "Berline": "🚗", "Viano": "🚐",
  "Monospace": "🚌", "Citadine": "🏎️", "4x4": "🛻", "Sportif": "⚡",
  "Pick-up": "🛻", "Cabriolet": "🚗", "Utilitaire": "📦", "Minibus": "🚌",
};

const IE_SOURCE_ZONES = [
  { key: "",       label: "Tous pays" },
  { key: "Chine",  label: "🇨🇳 Chine" },
  { key: "Dubaï",  label: "🇦🇪 Dubaï / EAU" },
  { key: "France", label: "🇫🇷 France" },
  { key: "Europe", label: "🇪🇺 Europe" },
];

const IE_SORT = [
  { key: "newest",     label: "Plus récentes" },
  { key: "price_asc",  label: "Prix croissant" },
  { key: "price_desc", label: "Prix décroissant" },
];

const FUEL_LABELS = {
  essence: "Essence", diesel: "Diesel", hybride: "Hybride",
  hybride_rechargeable: "Hybride rech.", electrique: "Électrique",
  gpl: "GPL", autre: "Autre",
};

const BADGE_ICONS_MAP = { silver: "🥈", gold: "🥇", platinum: "💎" };

/* ── Carte Import/Export ── */
function IECard({ l }) {
  const { fmtFromCurrency } = useCurrency();
  return (
    <div className={styles.ieCard}>
      <div className={styles.ieCardImg}>
        {l.mainPhoto
          ? <img src={l.mainPhoto} alt={l.title} loading="lazy" width="320" height="200" />
          : <div className={styles.ieCardImgFallback}>🚗</div>
        }
        <div className={styles.ieCardOrigin}>{getCountryFlag(l.sourceCountry)} {l.sourceCountry}</div>
        <div className={styles.ieCardTypeBadge}>🌍 Import/Export</div>
        {l.incoterm && (
          <div className={styles.ieCardIncoterm}>📦 {l.incoterm}</div>
        )}
        {l.importerProfile?.badgeLevel && l.importerProfile.badgeLevel !== "none" && (
          <div className={styles.ieCardBadge}>
            {BADGE_ICONS_MAP[l.importerProfile.badgeLevel]} {l.importerProfile.badgeLevel.toUpperCase()}
          </div>
        )}
      </div>

      <div className={styles.ieCardBody}>
        <strong className={styles.ieCardTitle}>{l.title}</strong>
        <span className={styles.ieCardMeta}>
          {l.make} {l.model} {l.year} · {FUEL_LABELS[l.fuelType] || l.fuelType} · {l.condition === "neuf" ? "Neuf" : l.condition === "occasion" ? "Occasion" : "Reconditionné"}
        </span>

        {l.availableIn?.length > 0 && (
          <div className={styles.ieCardTags}>
            {l.availableIn.slice(0, 3).map((c) => (
              <span key={c} className={styles.ieCardTag}>{getCountryFlag(c)} {c}</span>
            ))}
            {l.availableIn.length > 3 && <span style={{ fontSize: ".7rem", color: "#94a3b8" }}>+{l.availableIn.length - 3}</span>}
          </div>
        )}

        {l.importerProfile?.companyName && (
          <span className={styles.ieCardCompany}>🏢 {l.importerProfile.companyName}</span>
        )}

        <div className={styles.ieCardFooter}>
          <div>
            <div className={styles.ieCardPrice}>{fmtFromCurrency(l.price, l.currency)}</div>
            {l.negotiable && <span className={styles.ieCardNeg}>Négociable</span>}
          </div>
          <Link to="/import-export/listings" className={styles.ieCardLink}>Voir →</Link>
        </div>
      </div>
    </div>
  );
}

/* ── Carte Chauffeur ── */
function DriverCard({ d, fmt }) {
  const tarifHeure = d.tarifHeure || d.tarif || 0;
  return (
    <div className={styles.ieCard}>
      <div className={styles.ieCardImg}>
        {d.profilePhoto || d.images?.[0]
          ? <img src={d.profilePhoto || d.images[0]} alt={`${d.firstName} ${d.lastName}`} loading="lazy" width="320" height="200" />
          : <div className={styles.ieCardImgFallback}>🧑‍✈️</div>
        }
      </div>
      <div className={styles.ieCardBody}>
        <strong className={styles.ieCardTitle}>{d.firstName} {d.lastName}</strong>
        <span className={styles.ieCardMeta}>
          {d.title || "Chauffeur professionnel"} · {d.experience || 0} ans d'expérience
        </span>
        <span className={styles.ieCardMeta}>
          📍 {d.zone || d.ville || "—"}
          {d.noteMoyenne > 0 && <> · ⭐ {d.noteMoyenne.toFixed(1)} ({d.nombreAvis || 0})</>}
        </span>
        <div className={styles.ieCardFooter}>
          <div>
            <div className={styles.ieCardPrice}>{fmt(tarifHeure)}/h</div>
          </div>
          <Link to={`/driver-booking/${d._id}`} className={styles.ieCardLink}>Réserver →</Link>
        </div>
      </div>
    </div>
  );
}

const types         = Object.keys(TYPE_ICONS);
const etats         = ["Tous", "Neuf", "Occasion"];
const fuels         = ["Tous", "Essence", "Diesel", "Hybride", "Électrique", "GPL"];
const transmissions = ["Tous", "Automatique", "Manuelle"];
const SORT_OPTIONS  = [
  { key: "default",    label: "Par défaut" },
  { key: "price_asc",  label: "Prix croissant" },
  { key: "price_desc", label: "Prix décroissant" },
  { key: "newest",     label: "Plus récent" },
];

const Catalogue = () => {
  const { vehicles, drivers, refreshVehicles } = useVehicles();
  const { fmt, catalogCountry, setCatalogCountry, COUNTRIES_CONFIG, COUNTRY_INTERNATIONAL, detectPreciseCountry } = useCurrency();
  const { success: toastSuccess, error: toastError } = useToast();
  const [detectingCountry, setDetectingCountry] = useState(false);

  const handleDetectCountry = async () => {
    setDetectingCountry(true);
    const res = await detectPreciseCountry();
    setDetectingCountry(false);
    if (res.ok) {
      const c = COUNTRIES_CONFIG.find((x) => x.code === res.country);
      toastSuccess(`📍 Pays détecté : ${c ? `${c.flag} ${c.name}` : res.country}`);
    } else {
      toastError(res.message || "Détection impossible.");
    }
  };
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
  const [activeDuree,  setActiveDuree]  = useState(() => searchParams.get("duree")    || "Tous");
  const [fuelType,     setFuelType]     = useState("Tous");
  const [transmission, setTransmission] = useState("Tous");
  const [maxPrice,     setMaxPrice]     = useState(200000);

  // ── "Près de moi" (recherche géolocalisée) ────────────────────────────────
  const [nearMeActive, setNearMeActive] = useState(false);
  const [userPos,      setUserPos]      = useState(null); // { lat, lng }
  const [geoLoading,   setGeoLoading]   = useState(false);
  const [geoError,     setGeoError]     = useState(null);

  const handleToggleNearMe = () => {
    if (nearMeActive) { setNearMeActive(false); return; }
    setGeoLoading(true);
    setGeoError(null);
    getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMeActive(true);
        setGeoLoading(false);
      },
      () => {
        setGeoError("Impossible d'obtenir votre position. Vérifiez les autorisations de localisation.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  // ── État Import/Export ────────────────────────────────────────────────────
  const [ieListings,  setIeListings]  = useState([]);
  const [ieLoading,   setIeLoading]   = useState(false);
  const [ieTotal,     setIeTotal]     = useState(0);
  const [ieSearch,    setIeSearch]    = useState("");
  const [ieSource,    setIeSource]    = useState("");
  const [ieSortKey,   setIeSortKey]   = useState("newest");

  const isImportMode    = activeMode === "Import";
  const isChauffeurMode = activeMode === "Chauffeur";

  const loadIEListings = useCallback(async () => {
    setIeLoading(true);
    try {
      const params = new URLSearchParams({ status: "approved", limit: 24 });
      if (ieSource) params.set("sourceCountry", ieSource);
      if (catalogCountry) params.set("country", catalogCountry);
      const res = await fetch(`/api/import-export/listings?${params}`);
      if (res.ok) {
        const d = await res.json();
        let list = d.listings || [];
        // Filtre texte côté client
        if (ieSearch.trim()) {
          const q = ieSearch.toLowerCase();
          list = list.filter((l) =>
            l.make?.toLowerCase().includes(q) ||
            l.model?.toLowerCase().includes(q) ||
            l.title?.toLowerCase().includes(q) ||
            l.sourceCountry?.toLowerCase().includes(q)
          );
        }
        // Tri
        if (ieSortKey === "price_asc")  list = [...list].sort((a, b) => a.price - b.price);
        if (ieSortKey === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
        setIeListings(list);
        setIeTotal(d.total || list.length);
      }
    } catch {}
    setIeLoading(false);
  }, [ieSource, ieSearch, ieSortKey, catalogCountry]);

  useEffect(() => {
    if (isImportMode) loadIEListings();
  }, [isImportMode, loadIEListings]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "Tous" || value === "Tout") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const resetFilters = () => {
    setActiveType("Tous"); setActiveEtat("Tous"); setFuelType("Tous");
    setTransmission("Tous"); setMaxPrice(200000); setSearchTerm(""); setActiveDuree("Tous");
    setActiveMode("Tout"); setSearchParams(new URLSearchParams()); setPage(1);
    setIeSearch(""); setIeSource(""); setIeSortKey("newest");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (isImportMode) await loadIEListings();
    else await refreshVehicles();
    setRefreshing(false);
    toastSuccess(isImportMode ? "Annonces Import/Export actualisées" : "Catalogue actualisé");
  };

  const chauffeursFiltered = useMemo(() => {
    if (!isChauffeurMode) return [];
    const q = searchTerm.toLowerCase();
    // Un chauffeur sans pays renseigné (créé avant cette fonctionnalité) reste
    // toujours visible, quel que soit le pays sélectionné.
    let list = drivers.filter((d) =>
      (catalogCountry === COUNTRY_INTERNATIONAL || !d.country || d.country === catalogCountry)
      && (!q
        || `${d.firstName} ${d.lastName}`.toLowerCase().includes(q)
        || (d.zone || d.ville || "").toLowerCase().includes(q)
        || (d.title || "").toLowerCase().includes(q)));
    if (sortKey === "price_asc")  list = [...list].sort((a,b) => (a.tarifHeure||a.tarif||0) - (b.tarifHeure||b.tarif||0));
    if (sortKey === "price_desc") list = [...list].sort((a,b) => (b.tarifHeure||b.tarif||0) - (a.tarifHeure||a.tarif||0));
    if (sortKey === "newest")     list = [...list].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    return list;
  }, [drivers, isChauffeurMode, searchTerm, sortKey, catalogCountry, COUNTRY_INTERNATIONAL]);

  const filtered = useMemo(() => {
    if (isImportMode || isChauffeurMode) return [];
    let list = vehicles.filter((v) => {
      const modeOk = activeMode === "Tout" || v.mode === activeMode;
      const typeOk = activeType === "Tous" || (v.vehicleType || v.type) === activeType;
      const etatOk = activeEtat === "Tous"
        || (activeEtat === "Neuf"     && v.etat === "Neuf")
        || (activeEtat === "Occasion" && v.etat && v.etat !== "Neuf");
      const fuelOk = fuelType === "Tous" || (v.fuel || v.carburant) === fuelType;
      const transOk = transmission === "Tous" || v.transmission === transmission;
      const priceOk = activeMode === "Acheter" || (v.pricePerDay || 0) <= maxPrice;
      // Un véhicule sans durée renseignée (créé avant cette fonctionnalité) ou
      // marqué "les_deux" reste visible sous les deux filtres.
      const dureeOk = activeMode !== "Louer" || activeDuree === "Tous"
        || !v.rentalDurationType || v.rentalDurationType === "les_deux"
        || v.rentalDurationType === (activeDuree === "Courte" ? "courte" : "longue");
      // Un véhicule sans pays renseigné (créé avant cette fonctionnalité) reste
      // toujours visible, quel que soit le pays sélectionné.
      const countryOk = catalogCountry === COUNTRY_INTERNATIONAL || !v.country || v.country === catalogCountry;
      const q = searchTerm.toLowerCase();
      const textOk = !q
        || (v.title || v.name || "").toLowerCase().includes(q)
        || (v.description || "").toLowerCase().includes(q)
        || (v.ville || v.city || "").toLowerCase().includes(q)
        || (v.marque || "").toLowerCase().includes(q);
      return modeOk && typeOk && etatOk && fuelOk && transOk && priceOk && dureeOk && countryOk && textOk;
    });

    // "Près de moi" : ne garder que les véhicules avec des coordonnées connues,
    // calculer la distance et trier par proximité — prioritaire sur le tri choisi.
    if (nearMeActive && userPos) {
      list = list
        .filter((v) => v.coordonnees?.lat != null && v.coordonnees?.lng != null)
        .map((v) => ({ ...v, distance: haversineKm(userPos.lat, userPos.lng, v.coordonnees.lat, v.coordonnees.lng) }))
        .sort((a, b) => a.distance - b.distance);
      return list;
    }

    if (sortKey === "price_asc")  list = [...list].sort((a,b) => (a.pricePerDay||a.priceForSale||0) - (b.pricePerDay||b.priceForSale||0));
    if (sortKey === "price_desc") list = [...list].sort((a,b) => (b.pricePerDay||b.priceForSale||0) - (a.pricePerDay||a.priceForSale||0));
    if (sortKey === "newest")     list = [...list].sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    return list;
  }, [vehicles, activeMode, activeType, activeEtat, activeDuree, fuelType, transmission, maxPrice, searchTerm, sortKey, isImportMode, isChauffeurMode, catalogCountry, COUNTRY_INTERNATIONAL, nearMeActive, userPos]);

  const activeChips = (!isImportMode && !isChauffeurMode) ? [
    activeMode !== "Tout"   && { label: activeMode,         clear: () => { setActiveMode("Tout"); setParam("mode",""); } },
    activeType !== "Tous"   && { label: activeType,         clear: () => { setActiveType("Tous"); setParam("type",""); } },
    activeEtat !== "Tous"   && { label: activeEtat,         clear: () => { setActiveEtat("Tous"); setParam("etat",""); } },
    activeMode === "Louer" && activeDuree !== "Tous" && { label: activeDuree, clear: () => { setActiveDuree("Tous"); setParam("duree",""); } },
    fuelType   !== "Tous"   && { label: fuelType,           clear: () => setFuelType("Tous") },
    transmission !== "Tous" && { label: transmission,       clear: () => setTransmission("Tous") },
    activeMode !== "Acheter" && maxPrice < 200000 && { label: `≤ ${fmt(maxPrice)}`, clear: () => setMaxPrice(200000) },
    searchTerm              && { label: `"${searchTerm}"`,  clear: () => setSearchTerm("") },
  ].filter(Boolean) : [];

  return (
    <div className={styles.page}>

      {/* ══════════════════════════════
          HEADER
      ══════════════════════════════ */}
      <header className={styles.header}>
        <div className={styles.headerDeco1} />
        <div className={styles.headerDeco2} />

        <div className={styles.headerInner}>

          <div className={styles.headerRow}>
            <div>
              <span className={styles.headerTag}>{isImportMode ? "🌍 VIT AUTO" : isChauffeurMode ? "🧑‍✈️ VIT AUTO" : "🚗 VIT AUTO"}</span>
              <h1 className={styles.headerTitle}>{isImportMode ? "Import / Export" : isChauffeurMode ? "Chauffeurs" : "Catalogue"}</h1>
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

          {/* Tabs mode */}
          <nav className={styles.modeTabs}>
            {MODES.map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                className={`${styles.modeTab} ${activeMode === key ? styles.modeTabActive : ""}`}
                onClick={() => {
                  setActiveMode(key);
                  setParam("mode", key === "Tout" ? "" : key);
                  setPage(1);
                }}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Barre de recherche */}
          <div className={styles.searchBar}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="search"
              value={isImportMode ? ieSearch : searchTerm}
              onChange={(e) => isImportMode ? setIeSearch(e.target.value) : setSearchTerm(e.target.value)}
              placeholder={isImportMode ? "Marque, modèle, pays d'origine…" : isChauffeurMode ? "Nom, zone…" : "Marque, modèle, ville…"}
              className={styles.searchInput}
            />
            {(isImportMode ? ieSearch : searchTerm) && (
              <button type="button" className={styles.searchClear}
                onClick={() => isImportMode ? setIeSearch("") : setSearchTerm("")}>✕</button>
            )}
          </div>

          {/* Pills type véhicule (mode standard) ou pays source (mode IE) — masquées en mode Chauffeur */}
          {isImportMode ? (
            <div className={styles.typePillsRow}>
              {IE_SOURCE_ZONES.map((z) => (
                <button key={z.key} type="button"
                  className={`${styles.typePill} ${ieSource === z.key ? styles.typePillActive : ""}`}
                  onClick={() => setIeSource(z.key)}>
                  <span>{z.label}</span>
                </button>
              ))}
            </div>
          ) : !isChauffeurMode ? (
            <div className={styles.typePillsRow}>
              {types.map((t) => (
                <button key={t} type="button"
                  className={`${styles.typePill} ${activeType === t ? styles.typePillActive : ""}`}
                  onClick={() => { setActiveType(t); setParam("type", t); }}>
                  <span>{TYPE_ICONS[t]}</span>
                  <span>{t === "Tous" ? "Tout" : t}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

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
              {isImportMode
                ? <><strong>{ieListings.length}</strong> annonce{ieListings.length !== 1 ? "s" : ""} internationale{ieListings.length !== 1 ? "s" : ""}</>
                : isChauffeurMode
                ? <><strong>{chauffeursFiltered.length}</strong> chauffeur{chauffeursFiltered.length !== 1 ? "s" : ""}</>
                : <><strong>{filtered.length}</strong> véhicule{filtered.length !== 1 ? "s" : ""}</>
              }
            </span>

            {geoError && !isImportMode && !isChauffeurMode && (
              <span className={styles.activeChip} title={geoError}>⚠️ {geoError}</span>
            )}

            {!isImportMode && !isChauffeurMode && activeChips.map((chip, i) => (
              <button key={i} type="button" className={styles.activeChip} onClick={chip.clear}>
                {chip.label} <span>✕</span>
              </button>
            ))}

            {activeChips.length > 1 && (
              <button type="button" className={styles.clearAllBtn} onClick={resetFilters}>Tout effacer</button>
            )}
          </div>

          <div className={styles.resultsRight}>
            <select
              className={styles.sortSelect}
              value={catalogCountry}
              onChange={(e) => setCatalogCountry(e.target.value)}
              title="Filtrer les annonces par pays"
            >
              <option value={COUNTRY_INTERNATIONAL}>🌍 Tous pays (International)</option>
              {COUNTRIES_CONFIG.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
              ))}
            </select>

            <button
              type="button"
              className={styles.filterToggleBtn}
              onClick={handleDetectCountry}
              disabled={detectingCountry}
              title="Détecter mon pays via ma position (plus précis que l'IP)"
            >
              {detectingCountry ? "📍 Détection…" : "📍 Détecter"}
            </button>

            {!isImportMode && !isChauffeurMode && (
              <button
                type="button"
                className={styles.filterToggleBtn}
                onClick={handleToggleNearMe}
                disabled={geoLoading}
                title={nearMeActive ? "Désactiver le tri par proximité" : "Trier les véhicules par distance depuis ma position"}
              >
                {geoLoading ? "📍 Localisation…" : nearMeActive ? "✅ Près de moi" : "📍 Près de moi"}
              </button>
            )}

            {!isImportMode && !isChauffeurMode && (
              <button type="button" className={styles.filterToggleBtn} onClick={() => setFilterOpen(true)}>
                ⚙️ Filtres
                {activeChips.length > 0 && <span className={styles.filterBadge}>{activeChips.length}</span>}
              </button>
            )}

            {!isChauffeurMode && (
              <select
                className={styles.sortSelect}
                value={isImportMode ? ieSortKey : sortKey}
                onChange={(e) => isImportMode ? setIeSortKey(e.target.value) : setSortKey(e.target.value)}
              >
                {(isImportMode ? IE_SORT : SORT_OPTIONS).map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Drawer mobile (mode standard uniquement) */}
        {!isImportMode && !isChauffeurMode && filterOpen && (
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
                fmt={fmt} activeMode={activeMode}
              />
              <button className={styles.resetBtn} onClick={() => { resetFilters(); setFilterOpen(false); }}>
                Réinitialiser
              </button>
            </div>
          </>
        )}

        {/* ── MODE STANDARD ── */}
        {!isImportMode && !isChauffeurMode && (
          <div className={styles.layout}>
            <aside className={styles.sidebar}>
              <div className={styles.sidebarInner}>
                {activeMode !== "Acheter" && (
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
                )}
                <div className={styles.sidebarSection}>
                  <h4 className={styles.sidebarTitle}>✨ État</h4>
                  <div className={styles.pillGroup}>
                    {etats.map((e) => (
                      <button key={e} type="button"
                        className={`${styles.filterPill} ${activeEtat === e ? styles.filterPillActive : ""}`}
                        onClick={() => { setActiveEtat(e); setParam("etat", e); }}>{e}</button>
                    ))}
                  </div>
                </div>
                {activeMode === "Louer" && (
                  <div className={styles.sidebarSection}>
                    <h4 className={styles.sidebarTitle}>🗓️ Durée</h4>
                    <div className={styles.pillGroup}>
                      {["Tous", "Courte", "Longue"].map((d) => (
                        <button key={d} type="button"
                          className={`${styles.filterPill} ${activeDuree === d ? styles.filterPillActive : ""}`}
                          onClick={() => { setActiveDuree(d); setParam("duree", d); }}>{d}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.sidebarSection}>
                  <h4 className={styles.sidebarTitle}>⛽ Carburant</h4>
                  <div className={styles.pillGroup}>
                    {fuels.map((f) => (
                      <button key={f} type="button"
                        className={`${styles.filterPill} ${fuelType === f ? styles.filterPillActive : ""}`}
                        onClick={() => setFuelType(f)}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.sidebarSection}>
                  <h4 className={styles.sidebarTitle}>⚙️ Transmission</h4>
                  <div className={styles.pillGroup}>
                    {transmissions.map((t) => (
                      <button key={t} type="button"
                        className={`${styles.filterPill} ${transmission === t ? styles.filterPillActive : ""}`}
                        onClick={() => setTransmission(t)}>{t}</button>
                    ))}
                  </div>
                </div>
                {activeChips.length > 0 && (
                  <button className={styles.resetBtn} onClick={resetFilters}>↺ Réinitialiser les filtres</button>
                )}
              </div>
            </aside>

            <main className={styles.grid}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyIcon}>🔍</div>
                  <h3>Aucun véhicule trouvé</h3>
                  <p>Modifiez vos filtres ou explorez tout le catalogue.</p>
                  <button className={styles.emptyReset} onClick={resetFilters}>Voir tous les véhicules</button>
                </div>
              ) : (
                filtered.map((car) => <VehicleCard key={car._id || car.id} car={car} />)
              )}
            </main>
          </div>
        )}

        {/* ── MODE CHAUFFEUR ── */}
        {isChauffeurMode && (
          <div className={styles.ieSection}>
            {chauffeursFiltered.length === 0 ? (
              <div className={styles.ieEmpty}>
                <span style={{ fontSize: "3rem" }}>🧑‍✈️</span>
                <h3>{searchTerm ? "Aucun résultat pour cette recherche" : "Aucun chauffeur disponible"}</h3>
                <p>{searchTerm ? "Essayez un autre terme." : "Nos partenaires proposeront bientôt des chauffeurs dans votre zone."}</p>
                {searchTerm && (
                  <button className={styles.ieEmptyBtn} onClick={() => setSearchTerm("")}>Effacer la recherche</button>
                )}
              </div>
            ) : (
              <div className={styles.ieGrid}>
                {chauffeursFiltered.map((d) => <DriverCard key={d._id} d={d} fmt={fmt} />)}
              </div>
            )}
          </div>
        )}

        {/* ── MODE IMPORT/EXPORT ── */}
        {isImportMode && (
          <div className={styles.ieSection}>

            {/* Bannière informative */}
            <div className={styles.ieBanner}>
              <div className={styles.ieBannerText}>
                <strong>🌍 Véhicules disponibles à l'import</strong>
                <p>Annonces publiées par nos importateurs certifiés — Chine, Dubaï, Europe & Afrique</p>
              </div>
              <div className={styles.ieBannerActions}>
                <Link to="/import-export/listings" className={styles.ieBannerBtn}>
                  Voir toutes les annonces →
                </Link>
                <Link to="/import-export" className={styles.ieBannerBtnGhost}>
                  En savoir plus
                </Link>
              </div>
            </div>

            {/* Grille annonces IE */}
            {ieLoading ? (
              <div className={styles.ieGrid}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={styles.ieSkeleton} />
                ))}
              </div>
            ) : ieListings.length === 0 ? (
              <div className={styles.ieEmpty}>
                <span style={{ fontSize: "3rem" }}>🌍</span>
                <h3>{ieSearch || ieSource ? "Aucun résultat pour ce filtre" : "Aucune annonce disponible"}</h3>
                <p>{ieSearch || ieSource ? "Essayez un autre filtre." : "Les importateurs partenaires publieront bientôt leurs annonces."}</p>
                {(ieSearch || ieSource) && (
                  <button className={styles.ieEmptyBtn} onClick={() => { setIeSearch(""); setIeSource(""); }}>
                    Effacer les filtres
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={styles.ieGrid}>
                  {ieListings.map((l) => <IECard key={l._id} l={l} />)}
                </div>
                {ieTotal > 24 && (
                  <div className={styles.ieMore}>
                    <Link to="/import-export/listings" className={styles.ieMoreLink}>
                      Voir les {ieTotal} annonces →
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Composant filtres drawer mobile ── */
function DrawerFilters({ maxPrice, setMaxPrice, activeEtat, setActiveEtat, fuelType, setFuelType,
  transmission, setTransmission, fuels, etats, transmissions, fmt, activeMode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 16 }}>
      {activeMode !== "Acheter" && (
        <div>
          <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "0.82rem", color: "#0f1b3f" }}>💰 Prix max / jour — {fmt(maxPrice)}</p>
          <input type="range" min="10000" max="200000" step="5000" value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#ff4d2d" }} />
        </div>
      )}
      {[
        { title: "✨ État",          opts: etats,         val: activeEtat,   set: setActiveEtat },
        { title: "⛽ Carburant",     opts: fuels,         val: fuelType,     set: setFuelType },
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
