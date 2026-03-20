import { useParams, useNavigate } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";

const VehicleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getVehicleById } = useVehicles();
  const vehicle = getVehicleById(id);

  if (!vehicle) {
    return <div style={{ padding: "40px" }}>Véhicule non trouvé</div>;
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>{vehicle.name}</h1>
      <img src={vehicle.image} alt={vehicle.name} style={{ width: "100%", maxWidth: "480px", height: "auto" }} />
      <p>
        <strong>Prix :</strong> {vehicle.price.toLocaleString()} FCFA
      </p>
      <p>
        <strong>Type :</strong> {vehicle.type}
      </p>
      <p>{vehicle.description}</p>
      <button onClick={() => navigate(`/booking/${vehicle.id}`)}>
        Réserver maintenant
      </button>
    </div>
  );
};

export default VehicleDetails;