import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../SearchBar/SearchBar.module.css";

const SearchBar = () => {
  const [mode, setMode] = useState("Louer");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("Tous types");
  const navigate = useNavigate();

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (location.trim()) params.set("location", location.trim());
    if (type !== "Tous types") params.set("type", type);
    navigate(`/catalogue?${params.toString()}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        <div>
          <label>Mode</label>
          <div className={styles.toggle}>
            <button
              className={mode === "Louer" ? styles.active : ""}
              onClick={() => setMode("Louer")}
              type="button"
            >
              Louer
            </button>
            <button
              className={mode === "Acheter" ? styles.active : ""}
              onClick={() => setMode("Acheter")}
              type="button"
            >
              Acheter
            </button>
          </div>
        </div>

        <div>
          <label>Localisation</label>
          <input
            type="text"
            placeholder="Abidjan"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>Tous types</option>
            <option>SUV</option>
            <option>Berline</option>
            <option>Coupé</option>
          </select>
        </div>

        <button className={styles.btn} onClick={handleSearch}>
          Rechercher
        </button>
      </div>
    </div>
  );
};

export default SearchBar;