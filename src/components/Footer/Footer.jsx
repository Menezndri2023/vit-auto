import React from "react";
import { Link } from "react-router-dom";
import styles from "../Footer/Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.linkGrid}>
        <div className={styles.col}>
          <h3>Services</h3>
          <ul>
            <li>Location court durée</li>
            <li>Location longue durée</li>
            <li>Vente de véhicules</li>
            <li>Véhicules électriques</li>
            <li>Offres entreprises</li>
          </ul>
        </div>

        <div className={styles.col}>
          <h3>Navigation</h3>
          <ul>
            <li><Link to="/">Accueil</Link></li>
            <li><Link to="/catalogue">Catalogue</Link></li>
            <li><Link to="/dashboard">Tableau de bord</Link></li>
            <li><Link to="/profile">Mon profil</Link></li>
            <li><Link to="/booking/1">Réservation</Link></li>
          </ul>
        </div>

        <div className={styles.col}>
          <h3>Contact</h3>
          <p>15 Avenue des Champs-Élysées, 75008 Paris</p>
          <p>+33 1 23 45 67 89</p>
          <p>contact@autodrive.fr</p>
          <p>Lun–Sam : 8h–20h</p>
        </div>
      </div>

      <div className={styles.bottom}>© 2026 AutoDrive. Tous droits réservés.</div>
    </footer>
  );
};

export default Footer;