import React from "react";
import { useNavigate } from "react-router-dom";
import styles from "../VehicleCard/VehicleCard.module.css";

const fmt = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";

const VehicleCard = React.memo(({ car }) => {
  const navigate = useNavigate();

  return (
    <div className={styles.card}>
      <div className={styles.cover}>
        <img src={car.image} alt={car.name} loading="lazy" />
        <div className={styles.badges}>
          <span className={`${styles.badge} ${car.mode === "Acheter" ? styles.sale : styles.location}`}>
            {car.mode === "Acheter" ? "Vente" : "Location"}
          </span>
          <span className={`${styles.badge} ${car.available ? styles.available : styles.reserve}`}>
            {car.available ? "Disponible" : "Réservé"}
          </span>
        </div>
      </div>

      <div className={styles.info}>
        <div className={styles.topRow}>
          <h3>{car.name}</h3>
          {car.distance != null && (
            <span className={styles.km}>{Number(car.distance).toFixed(1)} km</span>
          )}
        </div>
        <p className={styles.type}>{car.type}</p>

        <div className={styles.meta}>
          {car.rating != null && <span>⭐ {car.rating} ({car.reviews})</span>}
          {car.seats  != null && <span>🧍 {car.seats} places</span>}
          {car.transmission && <span>⚙️ {car.transmission}</span>}
          {car.fuel        && <span>⛽ {car.fuel}</span>}
        </div>

        <div className={styles.priceBlock}>
          <p className={styles.price}>
            {car.mode === "Acheter"
              ? fmt(car.buyPrice)
              : `${fmt(car.pricePerDay)} / jour`}
          </p>
          {car.mode !== "Acheter" && car.buyPrice && (
            <p className={styles.buyPrice}>Achat : {fmt(car.buyPrice)}</p>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={() => navigate(`/vehicle/${car._id || car.id}`)}
          className={styles.secondary}
        >
          Détails
        </button>
        <button onClick={() => navigate(`/booking/${car._id || car.id}`)}>
          {car.mode === "Acheter" ? "Essai gratuit" : "Réserver"}
        </button>
      </div>
    </div>
  );
});

export default VehicleCard;
