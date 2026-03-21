import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVehicles } from "../context/VehicleContext";
import styles from "./Dashboard.module.css";

const Dashboard = () => {
  const { bookings, removeBooking } = useVehicles();
  const [bookingFilter, setBookingFilter] = useState("Tous");

  const filteredBookings = useMemo(() => {
    if (bookingFilter === "Tous") return bookings;
    if (bookingFilter === "Réservations") return bookings.filter((b) => b.type !== "essai");
    if (bookingFilter === "Essais") return bookings.filter((b) => b.type === "essai");
    return bookings;
  }, [bookings, bookingFilter]);

  const activeBookings = filteredBookings.filter((booking) => {
    if (booking.type === "essai") return true;
    if (!booking.startDate || !booking.endDate) return false;
    const endDate = new Date(booking.endDate);
    return !Number.isNaN(endDate.getTime()) && endDate >= new Date();
  });

  const pastBookings = filteredBookings.filter((booking) => {
    if (booking.type === "essai") return false;
    const endDate = new Date(booking.endDate);
    return !Number.isNaN(endDate.getTime()) && endDate < new Date();
  });

  const totalSpent = bookings.reduce((sum, booking) => sum + (booking.total || 0), 0);

  if (bookings.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <h1>Tableau de bord</h1>
          <p>Vous n'avez encore aucune réservation.</p>
          <Link to="/catalogue" className={styles.primaryBtn}>
            Découvrir les véhicules
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Mes réservations</h1>
        <div className={styles.filterBar}>
          {['Tous', 'Réservations', 'Essais'].map((label) => (
            <button
              key={label}
              type="button"
              className={`${styles.filterBtn} ${bookingFilter === label ? styles.activeFilter : ''}`}
              onClick={() => setBookingFilter(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{filteredBookings.length}</span>
            <span className={styles.statLabel}>Vues après filtre</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>{activeBookings.length}</span>
            <span className={styles.statLabel}>En cours</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNumber}>€{totalSpent.toFixed(2)}</span>
            <span className={styles.statLabel}>Dépensé</span>
          </div>
        </div>
      </header>

      {activeBookings.length > 0 && (
        <section className={styles.section}>
          <h2>Réservations en cours</h2>
          <div className={styles.bookingsGrid}>
            {activeBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onRemove={removeBooking} />
            ))}
          </div>
        </section>
      )}

      {pastBookings.length > 0 && (
        <section className={styles.section}>
          <h2>Historique</h2>
          <div className={styles.bookingsGrid}>
            {pastBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onRemove={removeBooking} isPast />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const BookingCard = ({ booking, onRemove, isPast = false }) => {
  const startDate = new Date(booking.startDate);
  const endDate = new Date(booking.endDate);
  const isActive = booking.type === "essai" ? true : endDate >= new Date();

  const selectedOptions = Object.entries(booking.selectedOptions || {})
    .filter(([, active]) => active)
    .map(([opt]) => opt)
    .join(", ");

  return (
    <div className={`${styles.bookingCard} ${isPast ? styles.past : ""}`}>
      <div className={styles.bookingHeader}>
        <div className={styles.vehicleInfo}>
          <h3>{booking.vehicleName}</h3>
          <p className={styles.vehicleType}>{booking.vehicleType} • {booking.vehicleMode}</p>
        </div>
        <div className={styles.bookingStatus}>
          <span className={`${styles.status} ${isActive ? styles.active : styles.completed}`}>
            {isActive ? "En cours" : "Terminée"}
          </span>
        </div>
      </div>

      <div className={styles.bookingDetails}>
          {booking.type === "essai" ? (
            <>
              <div className={styles.detailRow}>
                <span className={styles.label}>RDV :</span>
                <span>{booking.preferredDate} à {booking.preferredTime}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.label}>Message :</span>
                <span>{booking.notes || '—'}</span>
              </div>
            </>
          ) : (
            <>
              <div className={styles.detailRow}>
                <span className={styles.label}>Période :</span>
                <span>{startDate.toLocaleDateString()} → {endDate.toLocaleDateString()}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.label}>Durée :</span>
                <span>{booking.days} jours</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.label}>Prix :</span>
                <span>€{booking.pricePerDay}/jour</span>
              </div>
              {selectedOptions && (
                <div className={styles.detailRow}>
                  <span className={styles.label}>Options :</span>
                  <span>{selectedOptions}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.label}>Total :</span>
                <span className={styles.totalPrice}>€{booking.total?.toFixed(2) || "0.00"}</span>
              </div>
            </>
          )}
      </div>

      <div className={styles.bookingActions}>
        <Link
          to={booking.vehicleId ? `/vehicle/${booking.vehicleId}` : "/catalogue"}
          className={styles.secondaryBtn}
        >
          {booking.vehicleId ? "Voir le véhicule" : "Voir le catalogue"}
        </Link>
        {!isPast && (
          <button
            onClick={() => onRemove(booking.id)}
            className={styles.dangerBtn}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
