import React from "react";
import { Link } from "react-router-dom";
import styles from "./RouteCTA.module.css";
import { useI18n } from "../../context/I18nContext";

// Ces arguments annonçaient « 3 500+ véhicules » et « 20+ pays », et le
// paragraphe ci-dessous « 50 000+ utilisateurs satisfaits sur 5 continents ».
// Chiffres réels au moment du constat : 138 véhicules publiés, 3 pays,
// 29 comptes. On ne remplace pas un chiffre faux par un chiffre vrai mais
// maigre : on met en avant ce que la plateforme SAIT FAIRE — ce qui reste vrai
// à toute échelle, et ne se démonte pas d'un coup d'œil au catalogue.
// Le décompte réel des véhicules, lui, est affiché sur la page d'accueil
// (HeroSection, GET /api/vehicles/public-stats) où il grandit tout seul.
const HIGHLIGHTS = [
  { icon: "🚗", cle: "routecta.h1" },
  { icon: "🚢", cle: "routecta.h2" },
  { icon: "🛡️", cle: "routecta.h3" },
  { icon: "⚡", cle: "routecta.h4" },
];

const RouteCTA = () => {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      <div className={styles.wrapper}>

        {/* Deco */}
        <div className={styles.decoCircle1} />
        <div className={styles.decoCircle2} />

        <div className={styles.content}>
          <span className={styles.badge}>{t("routecta.badge")}</span>

          <h2 className={styles.title}>
            {t("routecta.title1")}<br />
            <span className={styles.accent}>{t("routecta.title2")}</span>
          </h2>

          <p className={styles.desc}>{t("routecta.desc")}</p>

          {/* Highlights */}
          <div className={styles.highlights}>
            {HIGHLIGHTS.map((h) => (
              <div key={h.cle} className={styles.hl}>
                <span className={styles.hlIcon}>{h.icon}</span>
                <span>{t(h.cle)}</span>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <Link to="/catalogue" className={styles.primaryBtn}>
              {t("routecta.ctaCatalogue")}
            </Link>
            <Link to="/import-export" className={styles.secondaryBtn}>
              {t("routecta.ctaIE")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RouteCTA;
