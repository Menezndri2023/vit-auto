import React from "react";
import styles from "../Stats/Stats.module.css";

const Stats = () => {
  return (
    <div className={styles.stats}>
      <div>
        <h2>3 500+</h2>
        <p>Véhicules</p>
      </div>
      <div>
        <h2>20+</h2>
        <p>Pays couverts</p>
      </div>
      <div>
        <h2>4.9/5</h2>
        <p>Avis clients</p>
      </div>
      <div>
        <h2>Import</h2>
        <p>Chine · Dubaï · EU</p>
      </div>
    </div>
  );
};

export default Stats;