import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../SearchBar/SearchBar.module.css";

const SearchBar = () => {
  const [mode, setMode] = useState("Louer");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("Tous types");
  const [focus, setFocus] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSearch = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (location.trim()) params.set("location", location.trim());
    if (type !== "Tous types") params.set("type", type);
    
    // Simulate API call
    setTimeout(() => {
      navigate(`/catalogue?${params.toString()}`);
      setLoading(false);
    }, 300);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const resetFilters = () => {
    setMode("Louer");
    setLocation("");
    setType("Tous types");
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        {/* MODE SECTION */}
        <div className={styles.field}>
          <label>Mode</label>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.toggleBtn} ${mode === "Louer" ? styles.active : ""}`}
              onClick={() => setMode("Louer")}
              type="button"
              title="Louer un véhicule"
            >
              <span className={styles.icon}>🚗</span>
              <span>Louer</span>
            </button>
            <button
              className={`${styles.toggleBtn} ${mode === "Acheter" ? styles.active : ""}`}
              onClick={() => setMode("Acheter")}
              type="button"
              title="Acheter un véhicule"
            >
              <span className={styles.icon}>💳</span>
              <span>Acheter</span>
            </button>
          </div>
        </div>

        {/* LOCATION SECTION */}
        <div className={`${styles.field} ${styles.inputField}`}>
          <label>Localisation</label>
          <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>📍</span>
            <input
              type="text"
              placeholder="Entrez une ville..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onFocus={() => setFocus("location")}
              onBlur={() => setFocus(null)}
              onKeyPress={handleKeyPress}
            />
            {location && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setLocation("")}
                title="Effacer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* TYPE SECTION */}
        <div className={`${styles.field} ${styles.selectField}`}>
          <label>Type de véhicule</label>
          <div className={styles.selectWrapper}>
            <span className={styles.selectIcon}>🔧</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              onFocus={() => setFocus("type")}
              onBlur={() => setFocus(null)}
            >
              <option>Tous types</option>
              <option>SUV</option>
              <option>Berline</option>
              <option>Coupé</option>
            </select>
          </div>
        </div>

        {/* SEARCH BUTTON */}
        <button
          className={`${styles.btn} ${loading ? styles.loading : ""}`}
          onClick={handleSearch}
          disabled={loading}
          type="submit"
        >
          {loading ? (
            <>
              <span className={styles.spinner}></span>
              <span>Recherche...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Rechercher</span>
            </>
          )}
        </button>

        {/* RESET BUTTON */}
        <button
          className={styles.resetBtn}
          onClick={resetFilters}
          type="button"
          title="Réinitialiser les filtres"
        >
          ↻
        </button>
      </div>

      {/* ACTIVE FILTERS DISPLAY */}
      {(location || type !== "Tous types") && (
        <div className={styles.activeFilters}>
          <p>Filtres actifs :</p>
          {location && <span className={styles.filterTag}>📍 {location}</span>}
          {type !== "Tous types" && <span className={styles.filterTag}>🔧 {type}</span>}
          {mode === "Acheter" && <span className={styles.filterTag}>💳 Achat</span>}
        </div>
      )}
    </div>
  );
};

export default SearchBar;