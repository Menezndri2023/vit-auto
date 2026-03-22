import React from "react";
import { Link } from "react-router-dom";
import styles from "../VendorCallout/VendorCallout.module.css";

const VendorCallout = () => {
  return (
    <section className={styles.vendor}>
      <div>
        <h2>🚗 Publiez votre véhicule en quelques minutes</h2>
        <p>
          Permettez à d'autres propriétaires de proposer leurs voitures en location/vente.
          Gestion des annonces, vérification et paiement s'effectuent en un seul endroit.
        </p>
      </div>
      <Link to="/vendor" className={styles.btn}>
        Devenir partenaire
      </Link>
    </section>
  );
};

export default VendorCallout;
