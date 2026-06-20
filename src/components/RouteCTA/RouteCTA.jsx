import React from "react";
import { Link } from "react-router-dom";
import styles from "./RouteCTA.module.css";

const HIGHLIGHTS = [
  { icon: "🚗", text: "3 500+ véhicules" },
  { icon: "🌍", text: "20+ pays" },
  { icon: "🚢", text: "Import Chine · Dubaï" },
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
          Rejoignez 50 000+ utilisateurs satisfaits sur 5 continents. Location, achat,
          import depuis la Chine ou Dubaï — VIT AUTO gère tout de A à Z.
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
