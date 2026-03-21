import React from "react";
import { Link } from "react-router-dom";
import VehicleCard from "../VehicleCard/VehicleCard";
import { vehicles } from "../../data/vehicles";
import styles from "../VehicleList/VehicleList.module.css";

const featured = vehicles.filter((car) => car.available).slice(0, 3);

const VehicleList = () => {
  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div>
          <span className={styles.tag}>🔒 SÉLECTION DU MOMENT</span>
          <h2>Véhicules en vedette</h2>
        </div>
        <Link to="/catalogue" className={styles.ctaLink}>
          Voir tout le catalogue →
        </Link>
      </div>

      <div className={styles.grid}>
        {featured.map((car) => (
          <VehicleCard key={car.id} car={car} />
        ))}
      </div>
    </section>
  );
};

export default VehicleList;