import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { useVehicles } from "../context/VehicleContext";
import styles from "./Catalogue.module.css";
import { useToast } from "../context/ToastContext";

const catalogueMode = ["Tout", "Louer", "Acheter", "Chauffeur"];
const types = ["Tous", "SUV", "Berline", "Viano", "Monospace", "Citadine", "4x4", "Sportif", "Pick-up", "Cabriolet", "Utilitaire", "Minibus"];
const etats = ["Tous", "Neuf", "Occasion"];
const fuels = ["Tous", "Essence", "Diesel", "Hybride", "Électrique", "GPL"];
const transmissions = ["Tous", "Automatique", "Manuelle"];

const Catalogue = () => {
  const { vehicles, refreshVehicles } = useVehicles();
  const { success: toastSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1); // eslint-disable-line no-unused-vars

  const [activeMode, setActiveMode] = useState(() => {
    const mode = searchParams.get("mode") || "Tout";
    return catalogueMode.includes(mode) ? mode : "Tout";
  });

  const [searchTerm,   setSearchTerm]   = useState(() => searchParams.get("location") || "");
  const [activeType,   setActiveType]   = useState(() => searchParams.get("type") || "Tous");
  const [activeEtat,   setActiveEtat]   = useState(() => searchParams.get("etat") || "Tous");
  const [fuelType,     setFuelType]     = useState("Tous");
  const [transmission, setTransmission] = useState("Tous");
  const [maxPrice,     setMaxPrice]     = useState(200000);

  const activeFiltersCount = [
    fuelType !== "Tous",
    transmission !== "Tous",
    maxPrice < 200000,
    activeType !== "Tous",
    activeEtat !== "Tous",
    searchTerm !== "",
  ].filter(Boolean).length;

  const filteredVehicles = vehicles.filter((vehicle) => {
    const modeMatch = activeMode === "Tout" || vehicle.mode === activeMode;
    const typeMatch = activeType === "Tous"
      || (vehicle.vehicleType || vehicle.type) === activeType;
    const etatMatch = activeEtat === "Tous"
      || (vehicle.etat || "").toLowerCase().includes(activeEtat.toLowerCase())
      || (activeEtat === "Neuf" && vehicle.etat === "Neuf")
      || (activeEtat === "Occasion" && vehicle.etat && vehicle.etat !== "Neuf");
    const fuelMatch = fuelType === "Tous"
      || (vehicle.fuel || vehicle.carburant) === fuelType;
    const transmissionMatch = transmission === "Tous" || vehicle.transmission === transmission;
    const priceMatch = activeMode === "Acheter" || (vehicle.pricePerDay || 0) <= maxPrice;
    const name = (vehicle.title || vehicle.name || "").toLowerCase();
    const desc = (vehicle.description || "").toLowerCase();
    const city = (vehicle.ville || vehicle.city || "").toLowerCase();
    const textMatch = name.includes(searchTerm.toLowerCase())
      || desc.includes(searchTerm.toLowerCase())
      || city.includes(searchTerm.toLowerCase());
    return modeMatch && typeMatch && etatMatch && fuelMatch && transmissionMatch && priceMatch && textMatch;
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "Tous" || value === "Tout") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const resetFilters = () => {
    setActiveType("Tous");
    setActiveEtat("Tous");
    setFuelType("Tous");
    setTransmission("Tous");
    setMaxPrice(200000);
    setSearchTerm("");
    setActiveMode("Tout");
    setSearchParams(new URLSearchParams());
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshVehicles();
    setRefreshing(false);
    toastSuccess("Catalogue actualisé");
  };

  return (
    <div className={styles.page}>
      <header className={styles.topHeader}>
        <div>
          <h1>Catalogue de véhicules</h1>
          <p>{filteredVehicles.length} véhicules disponibles près de vous</p>
        </div>

        <div className={styles.topControls}>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un modèle ou une ville"
          />
          <select value={activeType} onChange={(e) => setActiveType(e.target.value)}>
            {types.map((type) => (
              <option value={type} key={type}>{type}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: refreshing ? "#e2e8f0" : "#0f1b3f",
              color: refreshing ? "#64748b" : "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.55rem 1rem",
              cursor: refreshing ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              transition: "background 0.2s",
              whiteSpace: "nowrap",
            }}
            title="Actualiser le catalogue"
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
            {refreshing ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </header>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <nav className={styles.tabs}>
        {catalogueMode.map((option) => (
          <button
            key={option}
            className={activeMode === option ? styles.activeTab : ""}
            onClick={() => {
              setActiveMode(option);
              setParam("mode", option === "Tout" ? "" : option);
              setPage(1);
            }}
            type="button"
          >
            {option}
          </button>
        ))}
      </nav>

      {/* Bouton filtres mobile */}
      <button
        type="button"
        className={styles.filterToggleBtn}
        onClick={() => setFilterOpen(true)}
      >
        ⚙️ Filtres
        {activeFiltersCount > 0 && (
          <span className={styles.filterBadge}>{activeFiltersCount}</span>
        )}
      </button>

      {/* Overlay + Drawer mobile */}
      {filterOpen && (
        <>
          <div
            className={`${styles.filterOverlay} ${styles.open ? styles.open : ""}`}
            style={{ display: "block" }}
            onClick={() => setFilterOpen(false)}
          />
          <div className={styles.filterDrawer}>
            <div className={styles.drawerHandle} />
            <div className={styles.drawerHeader}>
              <h3>Filtres</h3>
              <button className={styles.drawerCloseBtn} onClick={() => setFilterOpen(false)}>✕</button>
            </div>
            <div className={styles.filterSection}>
              <h4>Prix max / jour</h4>
              <div className={styles.filterItem}>
                <label>{Number(maxPrice).toLocaleString("fr-FR")} FCFA</label>
                <input type="range" min="10000" max="200000" step="5000"
                  value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
              </div>
            </div>
            <div className={styles.filterSection}>
              <h4>Carburant</h4>
              <div className={styles.filterItem}>
                <div className={styles.checkboxGroup}>
                  {fuels.map((fuel) => (
                    <label key={fuel}>
                      <input type="radio" name="fuel-drawer" value={fuel}
                        checked={fuelType === fuel}
                        onChange={() => { setFuelType(fuel); setParam("fuel", fuel); }} />
                      <span>{fuel}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.filterSection}>
              <h4>Transmission</h4>
              <div className={styles.filterItem}>
                <div className={styles.checkboxGroup}>
                  {transmissions.map((t) => (
                    <label key={t}>
                      <input type="radio" name="transmission-drawer" value={t}
                        checked={transmission === t}
                        onChange={() => { setTransmission(t); setParam("transmission", t); }} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button className={styles.resetBtn} onClick={() => { resetFilters(); setFilterOpen(false); }} type="button">
              Réinitialiser les filtres
            </button>
          </div>
        </>
      )}

      <div className={styles.contentGrid}>
        <aside className={styles.sidebar}>
          <div className={styles.filterBlock}>
            <h3>Filtres</h3>

            <div className={styles.filterSection}>
              <h4>Prix max / jour</h4>
              <div className={styles.filterItem}>
                <label>{Number(maxPrice).toLocaleString("fr-FR")} FCFA</label>
                <input
                  type="range"
                  min="10000"
                  max="200000"
                  step="5000"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                />
              </div>
            </div>

            <div className={styles.filterSection}>
              <h4>État</h4>
              <div className={styles.filterItem}>
                <div className={styles.checkboxGroup}>
                  {etats.map((e) => (
                    <label key={e}>
                      <input type="radio" name="etat" value={e}
                        checked={activeEtat === e}
                        onChange={() => { setActiveEtat(e); setParam("etat", e); }} />
                      {e}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.filterSection}>
              <h4>Carburants</h4>
              <div className={styles.filterItem}>
                <div className={styles.checkboxGroup}>
                  {fuels.map((fuel) => (
                    <label key={fuel}>
                      <input
                        type="radio"
                        name="fuel"
                        value={fuel}
                        checked={fuelType === fuel}
                        onChange={() => {
                          setFuelType(fuel);
                          setParam("fuel", fuel);
                        }}
                      />
                      {fuel}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.filterSection}>
              <h4>Transmission</h4>
              <div className={styles.filterItem}>
                <div className={styles.checkboxGroup}>
                  {transmissions.map((t) => (
                    <label key={t}>
                      <input
                        type="radio"
                        name="transmission"
                        value={t}
                        checked={transmission === t}
                        onChange={() => {
                          setTransmission(t);
                          setParam("transmission", t);
                        }}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button className={styles.resetBtn} onClick={resetFilters} type="button">
              Réinitialiser les filtres
            </button>
          </div>
        </aside>

        <main className={styles.grid}>
          {filteredVehicles.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>🚗</span>
              <p>Aucun véhicule trouvé</p>
              <span>Essayez de modifier vos filtres ou votre recherche</span>
            </div>
          ) : (
            filteredVehicles.map((car) => <VehicleCard key={car._id || car.id} car={car} />)
          )}
        </main>
      </div>
    </div>
  );
};

export default Catalogue;
