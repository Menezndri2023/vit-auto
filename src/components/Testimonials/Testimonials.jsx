import React from "react";
import styles from "./Testimonials.module.css";

const TESTIMONIALS = [
  {
    id:     1,
    name:   "Konan Yao Blaise",
    role:   "Chef d'entreprise — Abidjan",
    flag:   "🇨🇮",
    rating: 5,
    text:   "J'ai importé un BYD Han depuis la Chine via VIT AUTO. Inspection sur place, transport maritime, dédouanement géré de A à Z. Livraison à Abidjan en 35 jours. Exceptionnel.",
  },
  {
    id:     2,
    name:   "Fatima Zahra Benali",
    role:   "Directrice commerciale — Casablanca",
    flag:   "🇲🇦",
    rating: 5,
    text:   "Plateforme professionnelle et fiable. J'ai acheté un véhicule depuis Dubaï via le service Import Assist Gold. Tout a été géré : inspection, transport, douanes. Parfait.",
  },
  {
    id:     3,
    name:   "Mamadou Diallo",
    role:   "Importateur — Dakar",
    flag:   "🇸🇳",
    rating: 5,
    text:   "Partenaire importateur depuis 8 mois. J'importe des véhicules d'Allemagne et de Chine que je revends au Sénégal. VIT AUTO est ma passerelle — simple, rapide, international.",
  },
  {
    id:     4,
    name:   "Ahmed Al-Rashidi",
    role:   "Négociant automobile — Dubaï",
    flag:   "🇦🇪",
    rating: 5,
    text:   "We export premium SUVs and pick-ups to West Africa through VIT AUTO. The platform handles everything — buyers, paperwork, logistics. Revenue doubled in 6 months.",
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
        <span className={styles.tag}>💬 TÉMOIGNAGES CLIENTS</span>
        <h2 className={styles.title}>Ils font confiance à VIT AUTO</h2>
        <p className={styles.sub}>
          Clients, importateurs et partenaires satisfaits sur 20+ pays — Afrique, Europe, Moyen-Orient et Asie.
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
