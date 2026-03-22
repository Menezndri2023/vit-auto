import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useVehicles } from "../context/VehicleContext";
import { Link } from "react-router-dom";
import styles from "./VendorDashboard.module.css";

const STATUS_CONFIG = {
  approved: { label: "Approuvé", className: styles.statusApproved },
  pending: { label: "En attente", className: styles.statusPending },
  rejected: { label: "Rejeté", className: styles.statusRejected }
};

const VendorDashboard = () => {
  const { user, isAuthenticated } = useAuth();
  const { vehicles } = useVehicles();
  
  const [myVehicles, setMyVehicles] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const userVehicles = vehicles.filter(v => 
      String(v.userId) === String(user?.id || user?._id)
    );
    setMyVehicles(userVehicles);
  }, [vehicles, isAuthenticated, user]);

  const stats = useMemo(() => ({
    total: myVehicles.length,
    approved: myVehicles.filter(v => v.status === 'approved').length,
    pending: myVehicles.filter(v => v.status === 'pending' || !v.status).length,
    rejected: myVehicles.filter(v => v.status === 'rejected').length,
    revenue: myVehicles.reduce((sum, v) => sum + (v.pricePerDay * 7 * 0.85 || 0), 0) // Estimation
  }), [myVehicles]);

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyStats}>
          <h1>🎯 Espace Vendeur</h1>
          <p>Connectez-vous pour gérer vos annonces et suivre vos revenus.</p>
          <Link to="/login" className={`${styles.primaryBtn} ${styles.btnLg}`}>
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const handleDelete = (id) => {
    if (confirm('Supprimer définitivement cette annonce?')) {
      setMyVehicles(prev => prev.filter(v => v.id !== id));
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>🎯 Espace Vendeur</h1>
          <p>Bienvenue {user.firstName || user.name}, gérez vos annonces professionnelles</p>
        </div>
        <Link to="/vendor" className={`${styles.primaryBtn} ${styles.btnLg}`}>
          ➕ Nouvelle annonce
        </Link>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>{stats.total}</span>
          <span className={styles.statLabel}>Annonces totales</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>{stats.approved}</span>
          <span className={styles.statLabel}>Publiées</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>{stats.pending}</span>
          <span className={styles.statLabel}>En attente</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>{stats.rejected}</span>
          <span className={styles.statLabel}>Rejetées</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>€{stats.revenue.toLocaleString()}</span>
          <span className={styles.statLabel}>Revenus estimés/mois</span>
        </div>
      </div>

      <div className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2>Mes véhicules ({myVehicles.length})</h2>
          <div className={styles.filterControls}>
            <select>
              <option>Tous les statuts</option>
              <option>Approuvés</option>
              <option>En attente</option>
              <option>Rejetés</option>
            </select>
          </div>
        </div>

        {myVehicles.length === 0 ? (
          <div className={styles.emptyStats}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚗</div>
            <h3>Aucune annonce publiée</h3>
            <p>Commencez par ajouter votre première annonce professionnelle.</p>
            <Link to="/vendor" className={`${styles.primaryBtn} ${styles.btnLg}`}>
              ➕ Publier une annonce
            </Link>
          </div>
        ) : (
          <div className={styles.vehicleGrid}>
            {myVehicles.map((vehicle) => {
              const status = STATUS_CONFIG[vehicle.status || 'pending'];
              return (
                <div key={vehicle.id || vehicle._id} className={styles.vehicleCard}>
                  <div className={styles.vehicleHeader}>
                    <div className={styles.vehicleImage}>
                      {vehicle.image ? (
                        <img src={vehicle.image} alt={vehicle.name} />
                      ) : (
                        <span style={{ fontSize: '1.8rem' }}>🚗</span>
                      )}
                    </div>
                    <div>
                      <h3>{vehicle.name}</h3>
                      <div className={styles.vehicleStatus}>
                        <span className={status.className}>{status.label}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.vehicleTags}>
                    <span className={`${styles.tag} ${styles.tagMode}`}>{vehicle.mode}</span>
                    <span className={`${styles.tag} ${styles.tagType}`}>{vehicle.type}</span>
                    <span className={`${styles.tag} ${styles.tagFuel}`}>{vehicle.fuel}</span>
                  </div>
                  
                  <p className={styles.vehicleDescription}>
                    {vehicle.description || 'Pas de description disponible'}
                  </p>

                  <div className={styles.cardActions}>
                    <button className={`${styles.actionBtn} ${styles.editBtn}`} title="Modifier">
                      ✏️ Modifier
                    </button>
                    <Link 
                      to={`/vehicle/${vehicle.id}`} 
                      className={`${styles.actionBtn} ${styles.viewBtn}`} 
                      title="Voir l'annonce"
                    >
                      👁️ Voir
                    </Link>
                    <button 
                      className={`${styles.actionBtn} ${styles.deleteBtn}`} 
                      onClick={() => handleDelete(vehicle.id)}
                      title="Supprimer"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorDashboard;

