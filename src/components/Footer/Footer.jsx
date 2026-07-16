import React from "react";
import { Link } from "react-router-dom";
import VitAutoLogo from "../Logo/VitAutoLogo";
import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      {/* ── Ligne supérieure : brand + tagline ── */}
      <div className={styles.top}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <VitAutoLogo iconSize={52} variant="white" showText tagline />
          </div>
          <p className={styles.brandTagline}>
            La passerelle automobile internationale — location, vente, import et export
            entre l'Afrique, l'Europe, la Chine et le Moyen-Orient.
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
              <li><Link to="/import-export">Import / Export International</Link></li>
              <li><Link to="/pourquoi">Pourquoi VIT AUTO ?</Link></li>
            </ul>
          </div>

          {/* Navigation */}
          <div className={styles.col}>
            <h3>Navigation</h3>
            <ul>
              <li><Link to="/">Accueil</Link></li>
              <li><Link to="/catalogue">Catalogue</Link></li>
              <li><Link to="/services">Services</Link></li>
              <li><Link to="/partenaires">Devenir partenaire</Link></li>
              <li><Link to="/plans">Tarifs</Link></li>
              <li><Link to="/help">Centre d'aide</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
            </ul>
          </div>

          {/* Légal */}
          <div className={styles.col}>
            <h3>Légal & Confiance</h3>
            <ul>
              <li><Link to="/cgu">Conditions d'utilisation</Link></li>
              <li><Link to="/cgv">Conditions de vente</Link></li>
              <li><Link to="/conditions-partenaires">Conditions partenaires</Link></li>
              <li><Link to="/privacy">Politique de confidentialité</Link></li>
              <li><Link to="/cookies">Politique Cookies</Link></li>
              <li><Link to="/politiques">Confiance & Conformité</Link></li>
              <li><Link to="/mentions-legales">Mentions légales</Link></li>
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
              <li className={styles.hours}>🕐 Ouvert 7j/7 · 24h/24</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Barre du bas ── */}
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} VIT AUTO. Tous droits réservés.</span>
        <div className={styles.bottomLinks}>
          <Link to="/cgu">CGU</Link>
          <Link to="/cgv">CGV</Link>
          <Link to="/privacy">Confidentialité</Link>
          <Link to="/cookies">Cookies</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
          <Link to="/conditions-partenaires">Partenaires</Link>
          <Link to="/faq">FAQ</Link>
        </div>
        <span className={styles.madeWith}>🌍 Plateforme automobile mondiale</span>
      </div>
    </footer>
  );
};

export default Footer;
