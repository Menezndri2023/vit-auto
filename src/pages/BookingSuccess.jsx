import React from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./Booking.module.css";

const BookingSuccess = () => {
  const location = useLocation();
  const booking = location.state?.booking;

  if (!booking) {
    return (
      <div className={styles.page}>
        <h1>Confirmation introuvable</h1>
        <p>Aucune réservation trouvée.</p>
        <Link to="/">Retour à l'accueil</Link>
      </div>
    );
  }

  const selectedOptions = Object.entries(booking.selectedOptions || {})
    .filter(([, active]) => active)
    .map(([opt]) => opt)
    .join(", ");

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1>{booking.type === 'essai' ? 'Demande d’essai enregistrée !' : 'Réservation confirmée !'}</h1>
        <p>Merci, {booking.firstName} {booking.lastName}.</p>
        <p>{booking.type === 'essai' ? 'Votre demande de RDV a bien été envoyée.' : 'Votre réservation a bien été enregistrée pour :'}</p>

        <div className={styles.section}>
          <h3>Récapitulatif de la commande</h3>
          <div className={styles.summaryItem}>
            <span>Véhicule</span>
            <strong>{booking.vehicleName}</strong>
          </div>
          {booking.type === 'essai' ? (
            <>
              <div className={styles.summaryItem}>
                <span>Date RDV</span>
                <strong>{booking.preferredDate} à {booking.preferredTime}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Message</span>
                <strong>{booking.notes || 'Aucun'}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Statut</span>
                <strong>{booking.status || 'À confirmer'}</strong>
              </div>
            </>
          ) : (
            <>
              <div className={styles.summaryItem}>
                <span>Période</span>
                <strong>{booking.startDate} → {booking.endDate} ({booking.days} jours)</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Prix journalier</span>
                <strong>€{booking.pricePerDay?.toFixed(2) || '0.00'}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Options</span>
                <strong>{selectedOptions || 'Aucune'}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Total payé</span>
                <strong>€{booking.total?.toFixed(2) || '0.00'}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Paiement</span>
                <strong>{booking.paidWith === 'card' ? 'Carte bancaire' : booking.paidWith}</strong>
              </div>
            </>
          )}
        </div>

        <p>Un email de confirmation a été envoyé à {booking.email}.</p>

        <Link to="/catalogue" className={styles.primaryBtn} style={{ width: "max-content" }}>
          Voir d'autres véhicules
        </Link>
      </div>
    </div>
  );
};

export default BookingSuccess;
