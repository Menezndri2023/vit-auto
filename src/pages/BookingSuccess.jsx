import React from "react";
import { Link, useLocation } from "react-router-dom";

const BookingSuccess = () => {
  const location = useLocation();
  const booking = location.state?.booking;

  if (!booking) {
    return (
      <div style={{ padding: "40px" }}>
        <h1>Confirmation introuvable</h1>
        <p>Aucune réservation trouvée.</p>
        <Link to="/">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Réservation confirmée !</h1>
      <p>Merci, {booking.name}.</p>
      <p>Nous avons bien enregistré votre réservation pour le véhicule #{booking.vehicleId}.</p>
      <p>
        Période : {booking.startDate} → {booking.endDate}
      </p>
      <Link to="/catalogue">Voir d'autres véhicules</Link>
    </div>
  );
};

export default BookingSuccess;
