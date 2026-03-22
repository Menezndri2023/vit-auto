import React from "react";
import styles from "../TrustSection/TrustSection.module.css";

const TrustSection = () => {
  return (
    <section className={styles.trust}>
      <h2>🛡️ Sécurité & confiance</h2>
      <div className={styles.grid}>
        <article>
          <h3>Vérification des utilisateurs</h3>
          <p>Identité vérifiée par pièce d'identité et réel numéro de téléphone.</p>
        </article>
        <article>
          <h3>Caution sécurisée</h3>
          <p>Caution gérée automatiquement via Stripe ou paiement local sécurisé.</p>
        </article>
        <article>
          <h3>Contrat digital</h3>
          <p>Contrat électronique signé à chaque réservation pour vous protéger.</p>
        </article>
        <article>
          <h3>Support 24/7</h3>
          <p>Assistance client réactive pour chaque incident.</p>
        </article>
      </div>
    </section>
  );
};

export default TrustSection;
