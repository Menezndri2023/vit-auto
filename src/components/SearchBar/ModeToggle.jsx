import React, { memo } from "react";
import styles from "../SearchBar/SearchBar.module.css";

const ModeToggle = memo(({ mode, setMode, goToCatalogue }) => {
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
      </div>
    </div>
  );
});

export default ModeToggle;