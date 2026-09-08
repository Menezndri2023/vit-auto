import React from "react";
import { Link } from "react-router-dom";
import VitAutoLogo from "../Logo/VitAutoLogo";
import styles from "./Footer.module.css";
import { COMPANY } from "../../constants/company";

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
            <a href={`https://wa.me/${COMPANY.phoneMA.replace("+", "")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">📱</a>
            <a href={`mailto:${COMPANY.email}`} aria-label="Email">✉️</a>
            <a href={`tel:${COMPANY.phoneMA}`} aria-label="Téléphone">📞</a>
          </div>
        </div>

        <div className={styles.cols}>
          {/* Services */}
          <div className={styles.col}>
            {/* Colonne restructurée : elle listait « Location courte durée » et
                « Location longue durée » comme deux entrées distinctes menant
                à la MÊME adresse (/catalogue?mode=Louer) — deux libellés, une
                seule destination, ce qui trompe le visiteur sur la richesse du
                menu. Fusionnées. « Pourquoi VIT AUTO ? » est une page de
                présentation, pas un service : déplacée en Navigation.
                Import/Export gagne en revanche sa vitrine d'annonces, qui
                n'était atteignable que depuis sa page d'accueil — c'est le
                point d'entrée que la barre de navigation n'a pas à porter. */}
            <h3>Services</h3>
            <ul>
              <li><Link to="/catalogue?mode=Louer">Location de véhicules</Link></li>
              <li><Link to="/catalogue?mode=Acheter">Vente de véhicules</Link></li>
              <li><Link to="/catalogue?mode=Chauffeur">Service chauffeur</Link></li>
              <li><Link to="/catalogue?mode=Autres">Activités &amp; loisirs</Link></li>
              <li><Link to="/import-export">Import / Export international</Link></li>
              <li><Link to="/import-export/listings">Annonces Import / Export</Link></li>
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
              <li><Link to="/pourquoi">Pourquoi VIT AUTO ?</Link></li>
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
            </ul>
            <h3 className={styles.colSubTitle}>Contact</h3>
            <ul>
              <li>📍 {COMPANY.street}, {COMPANY.city}</li>
              <li>
                <a href={`tel:${COMPANY.phoneMA}`}>📞 {COMPANY.phoneMADisplay}</a>
              </li>
              <li>
                <a href={`mailto:${COMPANY.email}`}>✉️ {COMPANY.email}</a>
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
