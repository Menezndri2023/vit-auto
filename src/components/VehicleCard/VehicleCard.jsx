import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "../VehicleCard/VehicleCard.module.css";

const VehicleCard = React.memo(({ car }) => {
  const navigate = useNavigate();

  return (
    <div className={styles.card}>
      <div className={styles.cover}>
        <img src={car.image} alt={car.name} loading="lazy" />
        <div className={styles.badges}>
          <span className={`${styles.badge} ${car.mode === "Acheter" ? styles.sale : styles.location}`}>
            {car.mode}
          </span>
          <span className={`${styles.badge} ${car.available ? styles.available : styles.reserve}`}>
            {car.available ? "Disponible" : "Réservé"}
          </span>
        </div>
      </div>

      <div className={styles.info}>
        <div className={styles.topRow}>
          <h3>{car.name}</h3>
          <p className={styles.km}>{car.distance.toFixed(1)} km</p>
        </div>
        <p className={styles.type}>{car.type}</p>

        <div className={styles.meta}>
          <span>⭐ {car.rating} ({car.reviews})</span>
          <span>🧍 {car.seats} places</span>
          <span>{car.transmission}</span>
          <span>{car.fuel}</span>
        </div>

        <p className={styles.price}>
          {car.mode === "Acheter" ? `${car.buyPrice?.toLocaleString()} €` : `${car.pricePerDay} € / jour`}
        </p>
        {car.buyPrice && <p className={styles.buyPrice}>Achat : ${car.buyPrice.toLocaleString()}</p>}
      </div>

      <div className={styles.actions}>
        <button onClick={() => navigate(`/vehicle/${car.id}`)} className={styles.secondary}>
          Détails
        </button>
        <button onClick={() => navigate(`/booking/${car.id}`)}>
          {car.mode === "Acheter" ? "Réserver un essai" : "Réserver"}
        </button>
      </div>
    </div>
  );
});

export default VehicleCard;