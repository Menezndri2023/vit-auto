import React, { memo } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../SearchBar/SearchBar.module.css";

const ModeToggle = memo(({ mode, setMode, goToCatalogue }) => {
  const navigate = useNavigate();

  return (
    <div className={styles.field}>
      <label>Mode</label>
      <div className={styles.modeToggle}>
        <button
          className={`${styles.toggleBtn} ${mode === "Louer" ? styles.active : ""}`}
          onClick={() => { setMode("Louer"); goToCatalogue("Louer"); }}
          type="button"
          title="Louer un véhicule"
        >
          <span className={styles.icon}>🚗</span>
          <span>Louer</span>
        </button>

        <button
          className={`${styles.toggleBtn} ${mode === "Acheter" ? styles.active : ""}`}
          onClick={() => { setMode("Acheter"); goToCatalogue("Acheter"); }}
          type="button"
          title="Acheter un véhicule"
        >
          <span className={styles.icon}>💳</span>
          <span>Acheter</span>
        </button>

        <button
          className={`${styles.toggleBtn} ${mode === "Chauffeur" ? styles.active : ""}`}
          onClick={() => { setMode("Chauffeur"); goToCatalogue("Chauffeur"); }}
          type="button"
          title="Réserver un chauffeur"
        >
          <span className={styles.icon}>👨‍✈️</span>
          <span>Chauffeur</span>
        </button>

        <button
          className={`${styles.toggleBtn} ${mode === "Import" ? styles.active : ""}`}
          onClick={() => { setMode("Import"); navigate("/catalogue?mode=Import"); }}
          type="button"
          title="Véhicules import/export internationaux"
        >
          <span className={styles.icon}>🌍</span>
          <span>Import/Export</span>
        </button>
      </div>
    </div>
  );
});

export default ModeToggle;