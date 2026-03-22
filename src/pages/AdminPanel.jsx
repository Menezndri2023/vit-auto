import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import styles from "./Catalogue.module.css";

const AdminPanel = () => {
  const { user, isAuthenticated } = useAuth();
  const { vehicles, approveVehicle, rejectVehicle } = useVehicles();
  const [pendingVehicles, setPendingVehicles] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") return;
    setPendingVehicles(vehicles.filter((v) => v.status === "pending"));
  }, [vehicles, isAuthenticated, user]);

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  const handleStatus = async (id, status) => {
    if (status === "approved") await approveVehicle(id);
    if (status === "rejected") await rejectVehicle(id);
    setPendingVehicles((prev) => prev.filter((v) => (v._id || v.id) !== id));
  };

  return (
    <div className={styles.page}>
      <div className={styles.topHeader}>
        <h1>Admin validation</h1>
        <p>Approuvez ou refusez les annonces soumises par les vendeurs.</p>
      </div>

      {pendingVehicles.length === 0 ? (
        <div className={styles.empty}>Aucune annonce en attente.</div>
      ) : (
        pendingVehicles.map((vehicle) => (
          <article key={vehicle._id || vehicle.id} className={styles.filterSection}>
            <h3>{vehicle.name}</h3>
            <p>{vehicle.description}</p>
            <div style={{ marginTop: "8px" }}>
              <button onClick={() => handleStatus(vehicle._id || vehicle.id, "approved")} className={styles.primaryBtn}>Valider</button>
              <button onClick={() => handleStatus(vehicle._id || vehicle.id, "rejected")} className={styles.secondaryBtn} style={{ marginLeft: "8px" }}>Refuser</button>
            </div>
          </article>
        ))
      )}
    </div>
  );
};

export default AdminPanel;
