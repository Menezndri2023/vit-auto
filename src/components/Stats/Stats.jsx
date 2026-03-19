import React from "react";
import styles from "../Stats/Stats.module.css";

const Stats = () => {
  return (
    <div className={styles.stats}>
      <div>
        <h2>1200+</h2>
        <p>Véhicules</p>
      </div>
      <div>
        <h2>48h</h2>
        <p>Livraison</p>
      </div>
      <div>
        <h2>4.9/5</h2>
        <p>Avis clients</p>
      </div>
      <div>
        <h2>50+</h2>
        <p>Villes</p>
      </div>
    </div>
  );
};

export default Stats;