import { useNavigate } from "react-router-dom";
import styles from "../VehicleCard/VehicleCard.module.css";

const VehicleCard = ({ car }) => {
  const navigate = useNavigate();

  return (
    <div className={styles.card}>
      <img src={car.image} alt={car.name} />

      <div className={styles.info}>
        <h3>{car.name}</h3>
        <p className={styles.type}>{car.type}</p>
        <p className={styles.price}>{car.price.toLocaleString()} FCFA</p>
      </div>

      <div className={styles.actions}>
        <button onClick={() => navigate(`/vehicle/${car.id}`)}>Voir détails</button>
        <button onClick={() => navigate(`/booking/${car.id}`)}>Réserver</button>
      </div>
    </div>
  );
};

export default VehicleCard;