import { useNavigate } from "react-router-dom";
import styles from "./Services.module.css";

const services = [
  {
    icon: "🚗",
    title: "Location courte durée",
    desc: "Louez un véhicule pour quelques heures ou quelques jours. Idéal pour les déplacements ponctuels, les voyages ou les week-ends.",
    cta: "Explorer le catalogue",
    link: "/catalogue",
  },
  {
    icon: "📅",
    title: "Location longue durée",
    desc: "Profitez d'un véhicule pendant plusieurs semaines ou mois à tarif dégressif. Une solution flexible sans engagement d'achat.",
    cta: "Voir les offres",
    link: "/catalogue",
  },
  {
    icon: "🔄",
    title: "Abonnement mensuel",
    desc: "Un abonnement tout-inclus : assurance, entretien et assistance routière compris. Changez de véhicule selon vos envies.",
    cta: "Découvrir l'abonnement",
    link: "/catalogue",
  },
  {
    icon: "🏢",
    title: "Location entreprise",
    desc: "Des solutions sur-mesure pour les flottes d'entreprises. Tarifs négociés, facturation centralisée et véhicules premium.",
    cta: "Nous contacter",
    link: "/help",
  },
  {
    icon: "✈️",
    title: "Livraison à l'aéroport",
    desc: "Récupérez votre voiture directement à l'aéroport ou à votre hôtel. Simplicité et confort à votre arrivée.",
    cta: "Réserver maintenant",
    link: "/catalogue",
  },
  {
    icon: "🛡️",
    title: "Assistance 24h/24",
    desc: "Notre équipe est disponible à toute heure pour vous aider en cas de panne, d'accident ou de toute autre urgence.",
    cta: "Centre d'aide",
    link: "/help",
  },
];

const steps = [
  { step: "01", title: "Choisissez votre véhicule", desc: "Parcourez notre catalogue et filtrez selon vos critères." },
  { step: "02", title: "Réservez en ligne",          desc: "Sélectionnez vos dates et confirmez votre réservation en quelques clics." },
  { step: "03", title: "Récupérez votre voiture",    desc: "Présentez-vous au point de retrait avec votre confirmation." },
  { step: "04", title: "Profitez du trajet",          desc: "Roulez l'esprit tranquille, tout est inclus." },
];

const Services = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.heroBadge}>Nos services</span>
          <h1>La mobilité, réinventée pour vous</h1>
          <p>
            VIT AUTO vous propose une gamme complète de services de location adaptés
            à chaque besoin — particuliers, professionnels ou voyageurs.
          </p>
          <div className={styles.heroBtns}>
            <button className={styles.primaryBtn} onClick={() => navigate("/catalogue")}>
              Voir le catalogue
            </button>
            <button className={styles.secondaryBtn} onClick={() => navigate("/register")}>
              Créer un compte
            </button>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className={styles.servicesSection}>
        <div className={styles.sectionHeader}>
          <h2>Ce que nous proposons</h2>
          <p>Des solutions de location flexibles, transparentes et sans mauvaise surprise.</p>
        </div>
        <div className={styles.grid}>
          {services.map((s) => (
            <div key={s.title} className={styles.card}>
              <div className={styles.cardIcon}>{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <button className={styles.cardBtn} onClick={() => navigate(s.link)}>
                {s.cta} →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <div className={styles.sectionHeader}>
          <h2>Comment ça fonctionne ?</h2>
          <p>Réserver un véhicule n'a jamais été aussi simple.</p>
        </div>
        <div className={styles.steps}>
          {steps.map((s) => (
            <div key={s.step} className={styles.stepCard}>
              <div className={styles.stepNumber}>{s.step}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className={styles.ctaBanner}>
        <h2>Prêt à prendre la route ?</h2>
        <p>Inscrivez-vous gratuitement et profitez de nos offres dès aujourd'hui.</p>
        <div className={styles.ctaBtns}>
          <button className={styles.primaryBtn} onClick={() => navigate("/register")}>
            S'inscrire gratuitement
          </button>
          <button className={styles.ghostBtn} onClick={() => navigate("/catalogue")}>
            Parcourir le catalogue
          </button>
        </div>
      </section>
    </div>
  );
};

export default Services;
