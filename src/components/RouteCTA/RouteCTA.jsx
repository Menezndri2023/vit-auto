import React from "react";
import { Link } from "react-router-dom";
import styles from "./RouteCTA.module.css";

// Ces arguments annonçaient « 3 500+ véhicules » et « 20+ pays », et le
// paragraphe ci-dessous « 50 000+ utilisateurs satisfaits sur 5 continents ».
// Chiffres réels au moment du constat : 138 véhicules publiés, 3 pays,
// 29 comptes. On ne remplace pas un chiffre faux par un chiffre vrai mais
// maigre : on met en avant ce que la plateforme SAIT FAIRE — ce qui reste vrai
// à toute échelle, et ne se démonte pas d'un coup d'œil au catalogue.
// Le décompte réel des véhicules, lui, est affiché sur la page d'accueil
// (HeroSection, GET /api/vehicles/public-stats) où il grandit tout seul.
const HIGHLIGHTS = [
  { icon: "🚗", text: "Location & achat" },
  { icon: "🚢", text: "Import Chine · Dubaï · Europe" },
  { icon: "🛡️", text: "Paiement séquestré" },
  { icon: "⚡", text: "Livraison GPS" },
];

const RouteCTA = () => (
  <section className={styles.section}>
    <div className={styles.wrapper}>

      {/* Deco */}
      <div className={styles.decoCircle1} />
      <div className={styles.decoCircle2} />

      <div className={styles.content}>
        <span className={styles.badge}>🌍 MARCHÉ AUTOMOBILE MONDIAL</span>

        <h2 className={styles.title}>
          Votre véhicule, depuis n'importe<br />
          <span className={styles.accent}>quel pays du monde</span>
        </h2>

        <p className={styles.desc}>
          Location, achat, import depuis la Chine, Dubaï ou l'Europe — inspection,
          transport, dédouanement et livraison gérés de bout en bout, avec paiement
          séquestré jusqu'à la remise du véhicule.
        </p>

        {/* Highlights */}
        <div className={styles.highlights}>
          {HIGHLIGHTS.map((h) => (
            <div key={h.text} className={styles.hl}>
              <span className={styles.hlIcon}>{h.icon}</span>
              <span>{h.text}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <Link to="/catalogue" className={styles.primaryBtn}>
            Explorer le catalogue
          </Link>
          <Link to="/import-export" className={styles.secondaryBtn}>
            Import / Export →
          </Link>
        </div>
      </div>
    </div>
  </section>
);

export default RouteCTA;
