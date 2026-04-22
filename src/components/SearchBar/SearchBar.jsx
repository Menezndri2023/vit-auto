import { useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "../../context/LocationContext";
import ModeToggle from "./ModeToggle";
import styles from "./SearchBar.module.css";

const SearchBar = memo(() => {
  const [mode, setMode]         = useState("Louer");
  const [location, setLocation] = useState("");
  const [type, setType]         = useState("Tous");
  const [loading, setLoading]   = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const navigate = useNavigate();

  // Contexte géolocalisation global
  const { position, address: detectedAddress, refreshLocation } = useLocation();

  const goToCatalogue = useCallback((selectedMode) => {
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    if (location.trim()) params.set("location", location.trim());
    if (type !== "Tous") params.set("type", type);
    navigate(`/catalogue?${params.toString()}`);
  }, [location, type, navigate]);

  const handleSearch = useCallback(() => {
    setLoading(true);
    goToCatalogue(mode);
    setTimeout(() => setLoading(false), 300);
  }, [mode, goToCatalogue]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === "Enter") handleSearch();
  }, [handleSearch]);

  // Bouton GPS : rempli le champ avec la position détectée
  const handleUseGPS = useCallback(async () => {
    setGeoLoading(true);
    if (position) {
      // Position déjà disponible
      setLocation(detectedAddress || `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`);
      setGeoLoading(false);
    } else {
      // Déclenche la détection
      await refreshLocation();
      // Le context se met à jour, on attend un tick
      setTimeout(() => {
        setLocation(detectedAddress || "Position détectée");
        setGeoLoading(false);
      }, 1200);
    }
  }, [position, detectedAddress, refreshLocation]);

  const resetFilters = useCallback(() => {
    setMode("Louer");
    setLocation("");
    setType("Tous");
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        {/* MODE */}
        <ModeToggle mode={mode} setMode={setMode} goToCatalogue={goToCatalogue} />

        {/* LOCALISATION */}
        <div className={`${styles.field} ${styles.locationField}`}>
          <label>Localisation</label>
          <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>📍</span>
            <input
              type="text"
              placeholder="Entrez une ville..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            {/* Bouton GPS */}
            <button
              type="button"
              className={styles.gpsBtn}
              onClick={handleUseGPS}
              disabled={geoLoading}
              title="Utiliser ma position GPS"
            >
              {geoLoading ? "⏳" : "🎯"}
            </button>
            {location && (
              <button type="button" className={styles.clearBtn} onClick={() => setLocation("")} aria-label="Effacer">✕</button>
            )}
          </div>
        </div>

        {/* TYPE */}
        <div className={`${styles.field} ${styles.typeField}`}>
          <label>Type de véhicule</label>
          <div className={styles.selectWrapper}>
            <span className={styles.selectIcon}>🔧</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option>Tous types</option>
              <option>SUV</option>
              <option>Berline</option>
              <option>Sportif</option>
              <option>Citadine</option>
            </select>
          </div>
        </div>

        {/* SEARCH */}
        <button
          className={`${styles.btn} ${loading ? styles.loading : ""}`}
          onClick={handleSearch}
          disabled={loading}
          type="button"
        >
          {loading ? <span className={styles.spinner} /> : <><span>🔍</span><span>Chercher</span></>}
        </button>

        {/* RESET */}
        <button className={styles.resetBtn} onClick={resetFilters} type="button" title="Réinitialiser">↻</button>
      </div>

      {/* Indicateur position détectée */}
      {position && (
        <p className={styles.geoHint}>
          📍 Position détectée — <strong>{detectedAddress?.split(",")[0]}</strong>
          <button type="button" className={styles.geoUseBtn} onClick={() => setLocation(detectedAddress)}>
            Utiliser
          </button>
        </p>
      )}
    </div>
  );
});

export default SearchBar;
