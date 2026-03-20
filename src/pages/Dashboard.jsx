import React from "react";
import { Link } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";

const Dashboard = () => {
  const { bookings, removeBooking } = useVehicles();

  if (bookings.length === 0) {
    return (
      <div style={{ padding: "40px" }}>
        <h1>Tableau de bord</h1>
        <p>Vous n'avez encore aucune réservation.</p>
        <Link to="/catalogue">Voir les véhicules</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Mes réservations</h1>
      <div style={{ display: "grid", gap: "16px", marginTop: "24px" }}>
        {bookings.map((booking) => (
          <div
            key={booking.id}
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap"
            }}
          >
            <div style={{ flex: 1, minWidth: "240px" }}>
              <h2 style={{ margin: "0 0 8px" }}>{booking.vehicleName}</h2>
              <p style={{ margin: 0 }}>
                Période : {booking.startDate} → {booking.endDate}
              </p>
              <p style={{ margin: "8px 0 0" }}>
                Contact : {booking.name} • {booking.email} • {booking.phone}
              </p>
              <Link to={`/vehicle/${booking.vehicleId}`}>Voir le véhicule</Link>
            </div>

            <button
              style={{
                background: "#ff4d2d",
                border: "none",
                color: "white",
                padding: "10px 16px",
                borderRadius: "10px",
                cursor: "pointer"
              }}
              onClick={() => removeBooking(booking.id)}
            >
              Annuler
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
