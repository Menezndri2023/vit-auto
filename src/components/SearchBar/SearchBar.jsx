import React, { useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ModeToggle from "./ModeToggle";
import styles from "../SearchBar/SearchBar.module.css";

const SearchBar = memo(() => {
  const [mode, setMode] = useState("Louer");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("Tous");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const goToCatalogue = useCallback((selectedMode) => {
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    if (location.trim()) params.set("location", location.trim());
    if (type !== "Tous") params.set("type", type);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    navigate(`/catalogue?${params.toString()}`);
  }, [location, type, startDate, endDate, navigate]);

  const handleSearch = useCallback(() => {
    setLoading(true);
    goToCatalogue(mode);
    setTimeout(() => {
      setLoading(false);
    }, 300);
  }, [mode, goToCatalogue]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  }, [handleSearch]);

  const resetFilters = useCallback(() => {
    setMode("Louer");
    setLocation("");
    setType("Tous");
    setStartDate("");
    setEndDate("");
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        {/* MODE SECTION */}
        <ModeToggle mode={mode} setMode={setMode} goToCatalogue={goToCatalogue} />

        {/* LOCATION FIELD */}
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
            {location && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setLocation("")}
                aria-label="Effacer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* TYPE FIELD */}
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

        {/* SEARCH BUTTON */}
        <button
          className={`${styles.btn} ${loading ? styles.loading : ""}`}
          onClick={handleSearch}
          disabled={loading}
          type="button"
          aria-label="Chercher les véhicules"
        >
          {loading ? (
            <>
              <span className={styles.spinner}></span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Chercheur</span>
            </>
          )}
        </button>

        {/* RESET BUTTON */}
        <button
          className={styles.resetBtn}
          onClick={resetFilters}
          type="button"
          title="Réinitialiser les filtres"
          aria-label="Réinitialiser les filtres"
        >
          ↻
        </button>
      </div>
    </div>
  );
});

export default SearchBar;