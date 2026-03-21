import React from "react";
import { Link } from "react-router-dom";
import styles from "./RouteCTA.module.css";

const RouteCTA = () => {
  return (
    <section className={styles.section}>
      <div className={styles.wrapper}>
        <div className={styles.content}>
          <h2>Prêt à prendre la route ?</h2>
          <p>Rejoignez 50 000+ conducteurs satisfaits. Réservez votre véhicule dès maintenant et partez en toute sérénité.</p>
          <div className={styles.actions}>
            <Link to="/catalogue" className={styles.primaryBtn}>
              Explorer le catalogue
            </Link>
            <Link to="/dashboard" className={styles.secondaryBtn}>
              Mon tableau de bord
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RouteCTA;
