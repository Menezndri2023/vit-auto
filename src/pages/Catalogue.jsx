import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { useVehicles } from "../context/VehicleContext";
import styles from "./Catalogue.module.css";

const catalogueMode = ["Tout", "Louer", "Acheter", "Chauffeur"];
const types = ["Tous", "SUV", "Berline", "Sportif", "Citadine", "Viano"];
const fuels = ["Tous", "Essence", "Diesel", "Hybride", "Électrique"];
const transmissions = ["Tous", "Automatique", "Manuelle"];

const Catalogue = () => {
  const { vehicles } = useVehicles();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeMode, setActiveMode] = useState(() => {
    const mode = searchParams.get("mode") || "Louer";
    return catalogueMode.includes(mode) ? mode : "Louer";
  });

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("location") || "");
  const [activeType, setActiveType] = useState(() => searchParams.get("type") || "Tous");
  const [fuelType, setFuelType] = useState("Tous");
  const [transmission, setTransmission] = useState("Tous");
  const [maxPrice, setMaxPrice] = useState(200000);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const modeMatch = activeMode === "Tout" || vehicle.mode === activeMode;
      const typeMatch = activeType === "Tous" || vehicle.type === activeType;
      const fuelMatch = fuelType === "Tous" || vehicle.fuel === fuelType;
      const transmissionMatch = transmission === "Tous" || vehicle.transmission === transmission;
      const priceMatch = activeMode === "Acheter" || vehicle.pricePerDay <= maxPrice;
      const textMatch =
        vehicle.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vehicle.description.toLowerCase().includes(searchTerm.toLowerCase());

      return modeMatch && typeMatch && fuelMatch && transmissionMatch && priceMatch && textMatch;
    });
  }, [activeMode, activeType, fuelType, transmission, maxPrice, searchTerm]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "Tous" || value === "Tout") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const resetFilters = () => {
    setActiveType("Tous");
    setFuelType("Tous");
    setTransmission("Tous");
    setMaxPrice(250);
    setSearchTerm("");
    setActiveMode("Tout");
    setSearchParams(new URLSearchParams());
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
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </header>

      <nav className={styles.tabs}>
        {catalogueMode.map((option) => (
          <button
            key={option}
            className={activeMode === option ? styles.activeTab : ""}
            onClick={() => {
              setActiveMode(option);
              setParam("mode", option === "Tout" ? "" : option);
            }}
            type="button"
          >
            {option}
          </button>
        ))}
      </nav>

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
            <div className={styles.empty}>Aucun véhicule trouvé pour ces critères.</div>
          ) : (
            filteredVehicles.map((car) => <VehicleCard key={car.id} car={car} />)
          )}
        </main>
      </div>
    </div>
  );
};

export default Catalogue;