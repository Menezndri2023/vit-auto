import React, { useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import styles from "./Profile.module.css";

const Profile = () => {
  const { user, isAuthenticated } = useAuth();
  const { bookings } = useVehicles();

  if (!isAuthenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h1>Accès au profil</h1>
          <p>Veuillez vous connecter pour voir et modifier votre profil.</p>
          <Link to="/login" className={styles.primaryBtn}>Connexion</Link>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState("personal");
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || "Jean",
    lastName: user?.lastName || "Dupont",
    email: user?.email || "jean.dupont@email.com",
    phone: user?.phone || "+225 01 02 03 04 05",
    address: "Abidjan, Côte d'Ivoire",
    licenseNumber: "CI-123456789",
    licenseExpiry: "2025-12-31"
  });

  const [notifications, setNotifications] = useState({
    emailReminders: true,
    smsReminders: false,
    promotionalEmails: true,
    bookingConfirmations: true
  });

  const handleProfileChange = (field, value) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (field, value) => {
    setNotifications(prev => ({ ...prev, [field]: value }));
  };

  const totalBookings = bookings.length;
  const totalSpent = bookings.reduce((sum, booking) => sum + (booking.total || 0), 0);
  const favoriteType = bookings.length > 0 ?
    bookings.reduce((acc, booking) => {
      acc[booking.vehicleType] = (acc[booking.vehicleType] || 0) + 1;
      return acc;
    }, {}) : {};

  const mostBookedType = Object.keys(favoriteType).reduce((a, b) =>
    favoriteType[a] > favoriteType[b] ? a : b, "Aucun"
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Mon profil</h1>
        <div className={styles.userStats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{totalBookings}</span>
            <span className={styles.statLabel}>Réservations</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>€{totalSpent.toFixed(2)}</span>
            <span className={styles.statLabel}>Dépensé</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{mostBookedType}</span>
            <span className={styles.statLabel}>Type préféré</span>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <nav className={styles.tabs}>
          <button
            className={activeTab === "personal" ? styles.activeTab : ""}
            onClick={() => setActiveTab("personal")}
          >
            Informations personnelles
          </button>
          <button
            className={activeTab === "notifications" ? styles.activeTab : ""}
            onClick={() => setActiveTab("notifications")}
          >
            Notifications
          </button>
          <button
            className={activeTab === "security" ? styles.activeTab : ""}
            onClick={() => setActiveTab("security")}
          >
            Sécurité
          </button>
        </nav>

        <div className={styles.tabContent}>
          {activeTab === "personal" && (
            <div className={styles.section}>
              <h2>Informations personnelles</h2>
              <form className={styles.form}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Prénom</label>
                    <input
                      type="text"
                      value={profileData.firstName}
                      onChange={(e) => handleProfileChange("firstName", e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Nom</label>
                    <input
                      type="text"
                      value={profileData.lastName}
                      onChange={(e) => handleProfileChange("lastName", e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => handleProfileChange("email", e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label>Téléphone</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => handleProfileChange("phone", e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <label>Adresse</label>
                  <input
                    type="text"
                    value={profileData.address}
                    onChange={(e) => handleProfileChange("address", e.target.value)}
                  />
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Numéro de permis</label>
                    <input
                      type="text"
                      value={profileData.licenseNumber}
                      onChange={(e) => handleProfileChange("licenseNumber", e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Expiration du permis</label>
                    <input
                      type="date"
                      value={profileData.licenseExpiry}
                      onChange={(e) => handleProfileChange("licenseExpiry", e.target.value)}
                    />
                  </div>
                </div>

                <button type="submit" className={styles.primaryBtn}>
                  Sauvegarder les modifications
                </button>
              </form>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className={styles.section}>
              <h2>Préférences de notifications</h2>
              <div className={styles.notifications}>
                <div className={styles.notificationItem}>
                  <div>
                    <h3>Rappels par email</h3>
                    <p>Recevoir des rappels avant vos réservations</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={notifications.emailReminders}
                      onChange={(e) => handleNotificationChange("emailReminders", e.target.checked)}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.notificationItem}>
                  <div>
                    <h3>Rappels par SMS</h3>
                    <p>Recevoir des rappels par message texte</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={notifications.smsReminders}
                      onChange={(e) => handleNotificationChange("smsReminders", e.target.checked)}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.notificationItem}>
                  <div>
                    <h3>Emails promotionnels</h3>
                    <p>Recevoir des offres spéciales et promotions</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={notifications.promotionalEmails}
                      onChange={(e) => handleNotificationChange("promotionalEmails", e.target.checked)}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>

                <div className={styles.notificationItem}>
                  <div>
                    <h3>Confirmations de réservation</h3>
                    <p>Recevoir des confirmations après chaque réservation</p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={notifications.bookingConfirmations}
                      onChange={(e) => handleNotificationChange("bookingConfirmations", e.target.checked)}
                    />
                    <span className={styles.slider}></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className={styles.section}>
              <h2>Sécurité du compte</h2>
              <div className={styles.securityActions}>
                <div className={styles.securityItem}>
                  <h3>Changer le mot de passe</h3>
                  <p>Dernière modification : il y a 3 mois</p>
                  <button className={styles.secondaryBtn}>Modifier</button>
                </div>

                <div className={styles.securityItem}>
                  <h3>Authentification à deux facteurs</h3>
                  <p>Renforcez la sécurité de votre compte</p>
                  <button className={styles.secondaryBtn}>Activer</button>
                </div>

                <div className={styles.securityItem}>
                  <h3>Historique des connexions</h3>
                  <p>Voir les dernières activités sur votre compte</p>
                  <button className={styles.secondaryBtn}>Consulter</button>
                </div>

                <div className={styles.securityItem}>
                  <h3>Supprimer le compte</h3>
                  <p>Action irréversible - toutes vos données seront supprimées</p>
                  <button className={styles.dangerBtn}>Supprimer</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
