import React from "react";
import { Link } from "react-router-dom";
import styles from "./RouteCTA.module.css";

const HIGHLIGHTS = [
  { icon: "🚗", text: "1 200+ véhicules" },
  { icon: "📍", text: "50+ villes" },
  { icon: "🌍", text: "14 pays" },
  { icon: "⚡", text: "Livraison GPS" },
];

const RouteCTA = () => (
  <section className={styles.section}>
    <div className={styles.wrapper}>

      {/* Deco */}
      <div className={styles.decoCircle1} />
      <div className={styles.decoCircle2} />

      <div className={styles.content}>
        <span className={styles.badge}>🚀 PRÊT À PARTIR ?</span>

        <h2 className={styles.title}>
          Le véhicule idéal vous attend,<br />
          <span className={styles.accent}>livré où vous êtes</span>
        </h2>

        <p className={styles.desc}>
          Rejoignez 50 000+ utilisateurs satisfaits à travers l'Afrique et l'Europe.
          Réservez en 2 minutes, payez sécurisé, recevez à domicile.
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
          <Link to="/register" className={styles.secondaryBtn}>
            Publier mon véhicule →
          </Link>
        </div>
      </div>
    </div>
  </section>
);

export default RouteCTA;
