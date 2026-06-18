import React from "react";
import styles from "./Testimonials.module.css";

const TESTIMONIALS = [
  {
    id:     1,
    name:   "Konan Yao Blaise",
    role:   "Chef d'entreprise — Abidjan",
    flag:   "🇨🇮",
    rating: 5,
    text:   "Incroyable rapidité ! J'ai réservé un SUV Toyota Fortuner depuis mon téléphone, livré le soir même à Cocody. Le partenaire était ponctuel et le véhicule impeccable.",
  },
  {
    id:     2,
    name:   "Fatima Zahra Benali",
    role:   "Directrice commerciale — Casablanca",
    flag:   "🇲🇦",
    rating: 5,
    text:   "Plateforme professionnelle et fiable. J'utilise VIT AUTO pour tous mes déplacements entre Casablanca et Rabat. Contrat digital, caution restituée en 24h. Excellent !",
  },
  {
    id:     3,
    name:   "Mamadou Diallo",
    role:   "Entrepreneur — Dakar",
    flag:   "🇸🇳",
    rating: 5,
    text:   "En tant que partenaire, j'ai publié mes 3 véhicules en moins d'une heure. Les réservations arrivent directement, les paiements sont automatiques. Je recommande vivement.",
  },
  {
    id:     4,
    name:   "Aïssatou Traoré",
    role:   "Responsable logistique — Bamako",
    flag:   "🇲🇱",
    rating: 5,
    text:   "La livraison GPS est bluffante — le partenaire a trouvé mon adresse sans aucun problème. Le calcul des frais était transparent depuis le début. Service 5 étoiles.",
  },
];

const Stars = ({ n }) => (
  <div className={styles.stars}>
    {[...Array(5)].map((_, i) => (
      <span key={i} className={i < n ? styles.starOn : styles.starOff}>★</span>
    ))}
  </div>
);

const Testimonials = () => (
  <section className={styles.section}>
    <div className={styles.container}>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.tag}>💬 TÉMOIGNAGES</span>
        <h2 className={styles.title}>Ils font confiance à VIT AUTO</h2>
        <p className={styles.sub}>
          Des milliers de clients et partenaires satisfaits à travers 14 pays en Afrique et en Europe.
        </p>
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {TESTIMONIALS.map((t) => (
          <article key={t.id} className={styles.card}>
            {/* Guillemet déco */}
            <span className={styles.quote}>"</span>

            <Stars n={t.rating} />

            <p className={styles.text}>{t.text}</p>

            <div className={styles.footer}>
              <div className={styles.avatarCircle}>
                {t.name.charAt(0)}{t.name.split(" ")[1]?.charAt(0)}
              </div>
              <div>
                <span className={styles.name}>{t.flag} {t.name}</span>
                <span className={styles.role}>{t.role}</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Note globale */}
      <div className={styles.globalRating}>
        <div className={styles.ratingStars}>★★★★★</div>
        <div className={styles.ratingText}>
          <strong>4,9 / 5</strong> — Basé sur 2 400+ avis vérifiés
        </div>
      </div>
    </div>
  </section>
);

export default Testimonials;
