import React from "react";
import { Link } from "react-router-dom";
import SearchBar from "../SearchBar/SearchBar";
import Stats from "../Stats/Stats";
import styles from "../HeroSection/HeroSection.module.css";

const HeroSection = () => {
  return (
    <div className={styles.hero}>
      <div className={styles.overlay}></div>

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

        <SearchBar />

        <div className={styles.statsWrapper}>
          <Stats />
        </div>

        <Link to="/catalogue" className={styles.ctaBtn}>
          Voir le catalogue complet
        </Link>
      </div>
    </div>
  );
};

export default HeroSection;

