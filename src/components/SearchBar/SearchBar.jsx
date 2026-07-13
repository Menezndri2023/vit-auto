import { useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "../../context/LocationContext";
import ModeToggle from "./ModeToggle";
import styles from "./SearchBar.module.css";

const MODELES = [
  "Tous modèles", "SUV", "Berline", "Viano", "Monospace",
  "Citadine", "4x4", "Sportif", "Pick-up", "Cabriolet",
  "Utilitaire", "Minibus",
];

const SearchBar = memo(() => {
  const [mode, setMode]         = useState("Louer");
  const [location, setLocation] = useState("");
  const [etat, setEtat]         = useState("Tous");   // Tous | Neuf | Occasion
  const [modele, setModele]     = useState("Tous modèles");
  const [loading, setLoading]   = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const navigate = useNavigate();

  const { position, address: detectedAddress, refreshLocation } = useLocation();

  const goToCatalogue = useCallback((selectedMode) => {
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    if (location.trim()) params.set("location", location.trim());
    if (etat !== "Tous") params.set("etat", etat);
    if (modele !== "Tous modèles") params.set("type", modele);
    navigate(`/catalogue?${params.toString()}`);
  }, [location, etat, modele, navigate]);

  const handleSearch = useCallback(() => {
    setLoading(true);
    goToCatalogue(mode);
    setTimeout(() => setLoading(false), 300);
  }, [mode, goToCatalogue]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === "Enter") handleSearch();
  }, [handleSearch]);

  const handleUseGPS = useCallback(async () => {
    setGeoLoading(true);
    if (position) {
      setLocation(detectedAddress || `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`);
      setGeoLoading(false);
    } else {
      await refreshLocation();
      setTimeout(() => {
        setLocation(detectedAddress || "Position détectée");
        setGeoLoading(false);
      }, 1200);
    }
  }, [position, detectedAddress, refreshLocation]);

  const resetFilters = useCallback(() => {
    setMode("Louer");
    setLocation("");
    setEtat("Tous");
    setModele("Tous modèles");
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        {/* MODE TABS */}
        <ModeToggle mode={mode} setMode={setMode} goToCatalogue={goToCatalogue} />

        {/* LOCALISATION */}
        <div className={`${styles.field} ${styles.locationField}`}>
          <label>Localisation</label>
          <div className={styles.inputWrapper}>
            <span className={styles.inputIcon}>📍</span>
            <input
              type="text"
              placeholder="Ville, quartier..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyPress={handleKeyPress}
            />
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

        {/* ÉTAT : Neuf / Occasion */}
        <div className={`${styles.field} ${styles.etatField}`}>
          <label>État</label>
          <div className={styles.etatToggle}>
            {["Tous", "Neuf", "Occasion"].map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.etatBtn} ${etat === v ? styles.etatActive : ""}`}
                onClick={() => setEtat(v)}
              >
                {v === "Tous" ? "Tous" : v === "Neuf" ? "🆕 Neuf" : "🔄 Occasion"}
              </button>
            ))}
          </div>
        </div>

        {/* MODÈLE */}
        <div className={`${styles.field} ${styles.typeField}`}>
          <label>Modèle</label>
          <div className={styles.selectWrapper}>
            <span className={styles.selectIcon}>🚙</span>
            <select value={modele} onChange={(e) => setModele(e.target.value)}>
              {MODELES.map((m) => <option key={m} value={m}>{m}</option>)}
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
