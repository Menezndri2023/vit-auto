import React from "react";
import styles from "../SearchBar/SearchBar.module.css";

const SearchBar = () => {
  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        <div>
          <label>Mode</label>
          <div className={styles.toggle}>
            <button className={styles.active}>Louer</button>
            <button>Acheter</button>
          </div>
        </div>

        <div>
          <label>Localisation</label>
          <input type="text" placeholder="Abidjan" />
        </div>

        <div>
          <label>Type</label>
          <select>
            <option>Tous types</option>
            <option>SUV</option>
            <option>Berline</option>
          </select>
        </div>

        <button className={styles.btn}>Rechercher</button>
      </div>
    </div>
  );
};

export default SearchBar;