import React from "react";
import styles from "./Testimonials.module.css";

const testimonials = [
  {
    id: 1,
    name: "Sophie Martin",
    role: "Entrepreneur",
    avatar: "👩‍💼",
    rating: 5,
    text: "Prestation exceptionnelle ! J'ai trouvé le véhicule idéal en moins de 5 minutes grâce à votre plateforme intuitive.",
  },
  {
    id: 2,
    name: "Thomas Dubois",
    role: "Commercial",
    avatar: "👨‍💼",
    rating: 5,
    text: "Je loue régulièrement pour mes déplacements professionnels. La qualité du service et des véhicules est remarquable.",
  },
  {
    id: 3,
    name: "Emma Leroy",
    role: "Étudiante",
    avatar: "👩‍🎓",
    rating: 4,
    text: "Prix très compétitifs, notamment pour les petits véhicules. Le site est ludique et l'équipe très réactive.",
  },
  {
    id: 4,
    name: "Marc Fontaine",
    role: "Directeur régional",
    avatar: "👨‍✈️",
    rating: 5,
    text: "La Porsche Cayenne disponible à 2km de chez moi. Incroyable ! Le service client est exceptionnellement professionnel.",
  },
];

const StarRating = ({ rating }) => {
  return (
    <div className={styles.stars}>
      {[...Array(5)].map((_, i) => (
        <span key={i} className={i < rating ? styles.starFilled : styles.starEmpty}>
          ⭐
        </span>
      ))}
    </div>
  );
};

const Testimonials = () => {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <p className={styles.tag}>💬 TÉMOIGNAGES</p>
        <h2 className={styles.title}>Ce que disent nos clients</h2>

        <div className={styles.grid}>
          {testimonials.map((testimonial) => (
            <article key={testimonial.id} className={styles.card}>
              <div className={styles.header}>
                <div className={styles.avatar}>{testimonial.avatar}</div>
                <div className={styles.info}>
                  <h3 className={styles.name}>{testimonial.name}</h3>
                  <p className={styles.role}>{testimonial.role}</p>
                </div>
              </div>

              <StarRating rating={testimonial.rating} />

              <p className={styles.text}>{testimonial.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
