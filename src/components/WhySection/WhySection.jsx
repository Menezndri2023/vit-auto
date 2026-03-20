import React from "react";
import styles from "./WhySection.module.css";

const cards = [
  {
    title: "Géolocalisation précise",
    description: "Trouvez le véhicule le plus proche de vous en temps réel grâce à notre technologie GPS avancée.",
    icon: "📍",
  },
  {
    title: "Paiement 100% sécurisé",
    description: "Toutes vos transactions sont chiffrées et protégées par les dernières normes de sécurité bancaire.",
    icon: "🛡️",
  },
  {
    title: "Réservation en 2 minutes",
    description: "Notre processus simplifié vous permet de réserver votre véhicule en un temps record, 24h/24.",
    icon: "⏱️",
  },
  {
    title: "Prime d'assistance",
    description: "Notre équipe dédiée est disponible 7j/7 pour vous accompagner tout au long de votre location.",
    icon: "🎧",
  },
];

const WhySection = () => {
  return (
    <section className={styles.section}>
      <div className={styles.content}>
        <p className={styles.subtitle}>⭐ POURQUOI AUTODRIVE</p>
        <h2 className={styles.title}>L'expérience automobile réinventée</h2>
        <div className={styles.cards}>
          {cards.map((item) => (
            <article key={item.title} className={styles.card}>
              <div className={styles.icon}>{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhySection;
