import React from "react";
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      {/* ── Ligne supérieure : brand + tagline ── */}
      <div className={styles.top}>
        <div className={styles.brand}>
          <span className={styles.brandLogo}>🚗 VIT AUTO</span>
          <p className={styles.brandTagline}>
            La plateforme premium de location, vente et livraison de véhicules
            à travers l'Afrique, le Maghreb et l'Europe.
          </p>
          <div className={styles.socials}>
            <a href="https://wa.me/2120607742672" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">📱</a>
            <a href="mailto:contact@vit-auto.com" aria-label="Email">✉️</a>
            <a href="tel:+2120607742672" aria-label="Téléphone">📞</a>
          </div>
        </div>

        <div className={styles.cols}>
          {/* Services */}
          <div className={styles.col}>
            <h3>Services</h3>
            <ul>
              <li><Link to="/catalogue?mode=Louer">Location courte durée</Link></li>
              <li><Link to="/catalogue?mode=Louer">Location longue durée</Link></li>
              <li><Link to="/catalogue?mode=Acheter">Vente de véhicules</Link></li>
              <li><Link to="/catalogue?mode=Chauffeur">Service chauffeur</Link></li>
              <li><Link to="/register?role=partenaire">Devenir partenaire</Link></li>
            </ul>
          </div>

          {/* Navigation */}
          <div className={styles.col}>
            <h3>Navigation</h3>
            <ul>
              <li><Link to="/">Accueil</Link></li>
              <li><Link to="/catalogue">Catalogue</Link></li>
              <li><Link to="/services">Services</Link></li>
              <li><Link to="/dashboard">Tableau de bord</Link></li>
              <li><Link to="/profile">Mon profil</Link></li>
              <li><Link to="/help">Centre d'aide</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
            </ul>
          </div>

          {/* Légal */}
          <div className={styles.col}>
            <h3>Légal & Confiance</h3>
            <ul>
              <li><Link to="/cgu">Conditions d'utilisation</Link></li>
              <li><Link to="/privacy">Politique de confidentialité</Link></li>
              <li><Link to="/faq">Questions fréquentes</Link></li>
            </ul>
            <h3 className={styles.colSubTitle}>Contact</h3>
            <ul>
              <li>📍 Route 1029, Hay Sidi Maârouf, Casablanca</li>
              <li>
                <a href="tel:+2120607742672">📞 +212 06 07 74 26 72</a>
              </li>
              <li>
                <a href="mailto:contact@vit-auto.com">✉️ contact@vit-auto.com</a>
              </li>
              <li className={styles.hours}>🕐 Lun–Sam : 8h – 20h</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Barre du bas ── */}
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} VIT AUTO. Tous droits réservés.</span>
        <div className={styles.bottomLinks}>
          <Link to="/cgu">CGU</Link>
          <Link to="/privacy">Confidentialité</Link>
          <Link to="/faq">FAQ</Link>
        </div>
        <span className={styles.madeWith}>Plateforme internationale 🌍</span>
      </div>
    </footer>
  );
};

export default Footer;
