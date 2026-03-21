import { useParams, useNavigate } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";
import styles from "./VehicleDetails.module.css";

const VehicleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getVehicleById } = useVehicles();
  const vehicle = getVehicleById(id);

  if (!vehicle) {
    return <div className={styles.page}>Véhicule non trouvé</div>;
  }

  const priceLabel = vehicle.mode === "Acheter" ? vehicle.buyPrice : vehicle.pricePerDay;
  const priceType = vehicle.mode === "Acheter" ? "Prix d'achat" : "Prix / jour";

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{vehicle.name}</h1>

      <div className={styles.content}>
        <div className={styles.imageWrapper}>
          <img src={vehicle.image} alt={vehicle.name} />
        </div>

        <div className={styles.details}>
          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <span>{priceType}</span>
              <span>{priceLabel ? `${priceLabel.toLocaleString()} €` : "N/A"}</span>
            </div>
            <div className={styles.metaItem}>
              <span>Type</span>
              <span>{vehicle.type}</span>
            </div>
            <div className={styles.metaItem}>
              <span>Mode</span>
              <span>{vehicle.mode}</span>
            </div>
            <div className={styles.metaItem}>
              <span>Statut</span>
              <span>{vehicle.available ? "Disponible" : "Non disponible"}</span>
            </div>
          </div>

          <p className={styles.description}>{vehicle.description}</p>

          <button
            className={styles.actionBtn}
            onClick={() => navigate(`/booking/${vehicle.id}`)}
          >
            {vehicle.mode === "Acheter" ? "Demander un essai" : "Réserver"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetails;