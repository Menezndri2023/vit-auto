import React from "react";
import { useSearchParams } from "react-router-dom";
import VehicleCard from "../components/VehicleCard/VehicleCard";
import { vehicles } from "../data/vehicles";
import styles from "./Catalogue.module.css";

const Catalogue = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterType = searchParams.get("type") || "Tous types";
  const mode = searchParams.get("mode") || "Louer";
  const location = searchParams.get("location") || "";

  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchType = filterType === "Tous types" || vehicle.type === filterType;
    const matchMode = true; // TODO: Implement mode-based filtering
    return matchType && matchMode;
  });

  const setType = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === "Tous types") next.delete("type");
    else next.set("type", value);
    setSearchParams(next);
  };

  return (
    <div className={styles.container}>
      <h1>Catalogue</h1>

      <div className={styles.filters}>
        <div>
          <label>Mode : </label>
          <span>{mode}</span>
        </div>
        <div>
          <label>Localisation : </label>
          <span>{location || "Toutes"}</span>
        </div>
        <div>
          <label>Type :</label>
          <select value={filterType} onChange={(e) => setType(e.target.value)}>
            <option>Tous types</option>
            <option>SUV</option>
            <option>Berline</option>
            <option>Coupé</option>
          </select>
        </div>
      </div>

      {filteredVehicles.length === 0 ? (
        <p>Aucun véhicule trouvé pour ces critères.</p>
      ) : (
        <div className={styles.grid}>
          {filteredVehicles.map((car) => (
            <VehicleCard key={car.id} car={car} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Catalogue;