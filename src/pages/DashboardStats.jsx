import React, { useEffect, useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import styles from "./Catalogue.module.css";

const DashboardStats = () => {
  const { user, isAuthenticated } = useAuth();
  const { vehicles, bookings } = useVehicles();
  const [stats, setStats] = useState({
    totalVehicles: 0,
    approvedVehicles: 0,
    pendingVehicles: 0,
    totalBookings: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    if (!isAuthenticated) return;

    if (user?.role === "admin") {
      setStats({
        totalVehicles: vehicles.length,
        approvedVehicles: vehicles.filter((v) => v.status === "approved").length,
        pendingVehicles: vehicles.filter((v) => v.status === "pending").length,
        totalBookings: bookings.length,
        totalRevenue: bookings.reduce((sum, b) => sum + (b.total || 0), 0),
      });
    } else {
      const myVehicles = vehicles.filter((v) => String(v.userId) === String(user?._id || user?.id));
      const myBookings = bookings.filter((b) => String(b.userId) === String(user?._id || user?.id));
      setStats({
        totalVehicles: myVehicles.length,
        approvedVehicles: myVehicles.filter((v) => v.status === "approved").length,
        pendingVehicles: myVehicles.filter((v) => v.status === "pending").length,
        totalBookings: myBookings.length,
        totalRevenue: myBookings.reduce((sum, b) => sum + (b.total || 0), 0),
      });
    }
  }, [vehicles, bookings, isAuthenticated, user]);

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Connectez-vous pour voir les statistiques.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topHeader}>
        <h1>📊 Tableau de statistiques</h1>
        <p>{user?.role === "admin" ? "Statistiques globales de la plateforme" : "Vos statistiques personnelles"}</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.statCard}>
          <h3>Total Véhicules</h3>
          <p className={styles.statNumber}>{stats.totalVehicles}</p>
        </div>
        <div className={styles.statCard}>
          <h3>Approuvés</h3>
          <p className={styles.statNumber} style={{ color: "#28a745" }}>{stats.approvedVehicles}</p>
        </div>
        <div className={styles.statCard}>
          <h3>En attente</h3>
          <p className={styles.statNumber} style={{ color: "#ffc107" }}>{stats.pendingVehicles}</p>
        </div>
        <div className={styles.statCard}>
          <h3>Réservations</h3>
          <p className={styles.statNumber}>{stats.totalBookings}</p>
        </div>
        <div className={styles.statCard}>
          <h3>Revenu total</h3>
          <p className={styles.statNumber} style={{ color: "#ff4d2d" }}>€{stats.totalRevenue.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats;
