import React from "react";
import styles from "../HeroSection/HeroSection.module.css";

const HeroSection = () => {
  return (
    <div className={styles.hero}>
      <div className={styles.overlay}></div>

      <nav className={styles.navbar}>
        <div className={styles.logo}>🚘</div>

        <ul className={styles.navLinks}>
          <li className={styles.active}>Accueil</li>
          <li>Catalogue</li>
          <li>Tableau de bord</li>
          <li>Profil</li>
        </ul>

        <div className={styles.navRight}>
          <span className={styles.location}>📍 Paris, France</span>
          <button className={styles.ctaBtn}>Trouver un véhicule</button>
        </div>
      </nav>

      <div className={styles.heroContent}>
        <p className={styles.tag}>📍 Véhicules disponibles près de vous</p>

        <h1>
          Conduisez l'extraordinaire,
          <br />
          <span>où que vous soyez</span>
        </h1>

        <p className={styles.subtitle}>
          Location et vente de véhicules premium géolocalisés.
        </p>
      </div>
    </div>
  );
};

export default HeroSection;