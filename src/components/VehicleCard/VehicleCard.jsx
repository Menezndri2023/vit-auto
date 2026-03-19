import React from "react";
import styles from "../VehicleCard/VehicleCard.module.css";

const VehicleCard = ({ car }) => {
  return (
    <div className={styles.card}>
      <img src={car.image} alt={car.name} />
      <h3>{car.name}</h3>
      <p>{car.price} FCFA / jour</p>
      <button>Réserver</button>
    </div>
  );
};

export default VehicleCard;