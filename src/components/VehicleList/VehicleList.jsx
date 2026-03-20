import React from "react";
import VehicleCard from "../VehicleCard/VehicleCard";
import { vehicles } from "../../data/vehicles";
import styles from "../VehicleList/VehicleList.module.css";

const VehicleList = () => {
  return (
    <div className={styles.container}>
      <h2>Véhicules disponibles</h2>
      <div className={styles.grid}>
        {vehicles.map((car) => (
          <VehicleCard key={car.id} car={car} />
        ))}
      </div>
    </div>
  );
};

export default VehicleList;