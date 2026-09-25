import { useState, memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "../../context/LocationContext";
import ModeToggle from "./ModeToggle";
import styles from "./SearchBar.module.css";
import { useI18n } from "../../context/I18nContext";

// La VALEUR reste française : c'est elle qui part dans l'URL du catalogue et
// que le serveur compare. Seul l'AFFICHAGE est traduit (clé bodyType.*), sans
// quoi un visiteur anglophone filtrerait sur « Saloon » et ne trouverait rien.
const TOUS_MODELES = "Tous modèles";
const MODELES = [
  TOUS_MODELES, "SUV", "Berline", "Viano", "Monospace",
  "Citadine", "4x4", "Sportif", "Pick-up", "Cabriolet",
  "Utilitaire", "Minibus",
];

const SearchBar = memo(() => {
  const { t } = useI18n();
  const [mode, setMode]         = useState("Louer");
  const [location, setLocation] = useState("");
  const [etat, setEtat]         = useState("Tous");   // Tous | Neuf | Occasion
  const [modele, setModele]     = useState(TOUS_MODELES);
  const [loading, setLoading]   = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const navigate = useNavigate();

  const { position, address: detectedAddress, refreshLocation } = useLocation();

  const goToCatalogue = useCallback((selectedMode) => {
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    if (location.trim()) params.set("location", location.trim());
    if (etat !== "Tous") params.set("etat", etat);
    if (modele !== TOUS_MODELES) params.set("type", modele);
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
        setLocation(detectedAddress || t("search.located"));
        setGeoLoading(false);
      }, 1200);
    }
  }, [position, detectedAddress, refreshLocation, t]);

  const resetFilters = useCallback(() => {
    setMode("Louer");
    setLocation("");
    setEtat("Tous");
    setModele(TOUS_MODELES);
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
          <label>{t("search.condition")}</label>
          <div className={styles.etatToggle}>
            {["Tous", "Neuf", "Occasion"].map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.etatBtn} ${etat === v ? styles.etatActive : ""}`}
                onClick={() => setEtat(v)}
              >
                {v === "Tous" ? t("search.all") : v === "Neuf" ? t("search.new") : t("search.used")}
              </button>
            ))}
          </div>
        </div>

        {/* MODÈLE */}
        <div className={`${styles.field} ${styles.typeField}`}>
          <label>{t("search.model")}</label>
          <div className={styles.selectWrapper}>
            <span className={styles.selectIcon}>🚙</span>
            <select value={modele} onChange={(e) => setModele(e.target.value)}>
              {MODELES.map((m) => <option key={m} value={m}>{m === TOUS_MODELES ? t("search.allModels") : t(`bodyType.${m}`)}</option>)}
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
          {loading ? <span className={styles.spinner} /> : <><span>🔍</span><span>{t("search.go")}</span></>}
        </button>

        {/* RESET */}
        <button className={styles.resetBtn} onClick={resetFilters} type="button" title={t("search.reset")}>↻</button>
      </div>

      {position && (
        <p className={styles.geoHint}>
          {t("search.locatedLabel")} <strong>{detectedAddress?.split(",")[0]}</strong>
          <button type="button" className={styles.geoUseBtn} onClick={() => setLocation(detectedAddress)}>
            {t("search.use")}
          </button>
        </p>
      )}
    </div>
  );
});

export default SearchBar;
