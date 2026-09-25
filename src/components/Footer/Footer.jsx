import React from "react";
import { Link } from "react-router-dom";
import VitAutoLogo from "../Logo/VitAutoLogo";
import styles from "./Footer.module.css";
import { COMPANY } from "../../constants/company";
import useIsMobile from "../../hooks/useIsMobile";
import { useI18n } from "../../context/I18nContext";

// Sur téléphone, les trois colonnes de liens (22 entrées) faisaient trois
// écrans sous CHAQUE page — la connexion, par exemple, en avait plus de pied
// de page que de formulaire. Elles se replient en accordéons ; sur bureau,
// rien ne change. `<details>` natif : pas d'état à gérer, accessible.
const Colonne = ({ titre, mobile, children }) => mobile
  ? <details className={`${styles.col} ${styles.colRepliable}`}><summary><h3>{titre}</h3></summary>{children}</details>
  : <div className={styles.col}><h3>{titre}</h3>{children}</div>;

const Footer = () => {
  const mobile = useIsMobile();
  const { t } = useI18n();
  return (
    <footer className={styles.footer}>
      {/* ── Ligne supérieure : brand + tagline ── */}
      <div className={styles.top}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <VitAutoLogo iconSize={52} variant="white" showText tagline />
          </div>
          <p className={styles.brandTagline}>{t("footer.tagline")}</p>
          <div className={styles.socials}>
            <a href={`https://wa.me/${COMPANY.phoneMA.replace("+", "")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">📱</a>
            <a href={`mailto:${COMPANY.email}`} aria-label="Email">✉️</a>
            <a href={`tel:${COMPANY.phoneMA}`} aria-label={t("footer.ariaPhone")}>📞</a>
          </div>
        </div>

        <div className={styles.cols}>
          {/* Services */}
          <Colonne titre={t("footer.colServices")} mobile={mobile}>
            {/* Colonne restructurée : elle listait « Location courte durée » et
                « Location longue durée » comme deux entrées distinctes menant
                à la MÊME adresse (/catalogue?mode=Louer) — deux libellés, une
                seule destination, ce qui trompe le visiteur sur la richesse du
                menu. Fusionnées. « Pourquoi VIT AUTO ? » est une page de
                présentation, pas un service : déplacée en Navigation.
                Import/Export gagne en revanche sa vitrine d'annonces, qui
                n'était atteignable que depuis sa page d'accueil — c'est le
                point d'entrée que la barre de navigation n'a pas à porter. */}
            <ul>
              <li><Link to="/catalogue?mode=Louer">{t("footer.svcRent")}</Link></li>
              <li><Link to="/catalogue?mode=Acheter">{t("footer.svcSale")}</Link></li>
              <li><Link to="/catalogue?mode=Chauffeur">{t("footer.svcDriver")}</Link></li>
              <li><Link to="/catalogue?mode=Autres">{t("footer.svcLeisure")}</Link></li>
              <li><Link to="/catalogue?mode=Pieces">{t("footer.svcParts")}</Link></li>
              <li><Link to="/import-export">{t("footer.svcIE")}</Link></li>
              <li><Link to="/import-export/listings">{t("footer.svcIEListings")}</Link></li>
            </ul>
          </Colonne>

          {/* Navigation */}
          <Colonne titre={t("footer.colNav")} mobile={mobile}>
            <ul>
              <li><Link to="/">{t("nav.home")}</Link></li>
              <li><Link to="/catalogue">{t("nav.catalogue")}</Link></li>
              <li><Link to="/services">{t("nav.services")}</Link></li>
              <li><Link to="/partenaires">{t("footer.navBecomePartner")}</Link></li>
              <li><Link to="/plans">{t("nav.plans")}</Link></li>
              <li><Link to="/pourquoi">{t("footer.navWhy")}</Link></li>
              <li><Link to="/help">{t("nav.help")}</Link></li>
              <li><Link to="/faq">{t("footer.navFaq")}</Link></li>
            </ul>
          </Colonne>

          {/* Légal */}
          <Colonne titre={t("footer.colLegal")} mobile={mobile}>
            <ul>
              <li><Link to="/cgu">{t("footer.legalCgu")}</Link></li>
              <li><Link to="/cgv">{t("footer.legalCgv")}</Link></li>
              <li><Link to="/conditions-partenaires">{t("footer.legalPartners")}</Link></li>
              <li><Link to="/privacy">{t("footer.legalPrivacy")}</Link></li>
              <li><Link to="/cookies">{t("footer.legalCookies")}</Link></li>
              <li><Link to="/politiques">{t("footer.legalTrust")}</Link></li>
              <li><Link to="/mentions-legales">{t("footer.legalMentions")}</Link></li>
            </ul>
            <h3 className={styles.colSubTitle}>{t("footer.contact")}</h3>
            <ul>
              <li>📍 {COMPANY.street}, {COMPANY.city}</li>
              <li>
                <a href={`tel:${COMPANY.phoneMA}`}>📞 {COMPANY.phoneMADisplay}</a>
              </li>
              <li>
                <a href={`mailto:${COMPANY.email}`}>✉️ {COMPANY.email}</a>
              </li>
              <li className={styles.hours}>🕐 {t("footer.hours")}</li>
            </ul>
          </Colonne>
        </div>
      </div>

      {/* ── Barre du bas ── */}
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} VIT AUTO. {t("footer.rights")}</span>
        {/* Abrégés volontaires : cette barre doit tenir sur une ligne, les
            intitulés complets sont dans la colonne « Légal » ci-dessus. */}
        <div className={styles.bottomLinks}>
          <Link to="/cgu">{t("footer.shortCgu")}</Link>
          <Link to="/cgv">{t("footer.shortCgv")}</Link>
          <Link to="/privacy">{t("footer.shortPrivacy")}</Link>
          <Link to="/cookies">{t("footer.shortCookies")}</Link>
          <Link to="/mentions-legales">{t("footer.shortMentions")}</Link>
          <Link to="/conditions-partenaires">{t("footer.shortPartners")}</Link>
          <Link to="/faq">{t("footer.navFaq")}</Link>
        </div>
        <span className={styles.madeWith}>🌍 {t("footer.worldwide")}</span>
      </div>
    </footer>
  );
};

export default Footer;
