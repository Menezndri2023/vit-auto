import React from "react";
import styles from "./WhySection.module.css";

const FEATURES = [
  {
    icon:  "🌍",
    color: "#ff4d2d",
    bg:    "rgba(255,77,45,0.10)",
    title: "Plateforme mondiale",
    desc:  "Chine, Dubaï, Europe, Afrique, Maghreb — VIT AUTO opère sur les 5 grands marchés automobiles internationaux. Achetez ou importez depuis n'importe quel pays.",
  },
  {
    icon:  "🛰️",
    color: "#6366f1",
    bg:    "rgba(99,102,241,0.10)",
    title: "Livraison GPS précise",
    desc:  "Votre véhicule livré à domicile grâce au calcul GPS en temps réel. Frais transparents dès la réservation — distance réelle, zéro surprise.",
  },
  {
    icon:  "🛡️",
    color: "#10b981",
    bg:    "rgba(16,185,129,0.10)",
    title: "Paiement 100 % sécurisé",
    desc:  "Orange Money, Wave, Carte bancaire, CMI… Toutes les transactions sont chiffrées TLS 1.3. Vos données bancaires ne transitent jamais sur nos serveurs.",
  },
  {
    icon:  "🚢",
    color: "#0ea5e9",
    bg:    "rgba(14,165,233,0.10)",
    title: "Import clé en main",
    desc:  "Commandez depuis la Chine, Dubaï ou l'Europe. Inspection, transport maritime, dédouanement et livraison pris en charge par VIT AUTO de A à Z.",
  },
  {
    icon:  "⚡",
    color: "#f59e0b",
    bg:    "rgba(245,158,11,0.10)",
    title: "Réservation en 2 minutes",
    desc:  "Réservez en ligne 24h/24, 7j/7. Contrat digital signé immédiatement, confirmation par SMS. Aucun paperasse, aucun déplacement nécessaire.",
  },
  {
    icon:  "🤝",
    color: "#8b5cf6",
    bg:    "rgba(139,92,246,0.10)",
    title: "Partenaires vérifiés",
    desc:  "Chaque partenaire est contrôlé — identité, documents du véhicule, assurance. Vous louez et achetez en toute confiance, sur 5 continents.",
  },
];

const STEPS = [
  { num: "01", label: "Recherchez",    desc: "Filtrez par ville, type, état et budget" },
  { num: "02", label: "Réservez",      desc: "Complétez en 3 étapes, payez sécurisé" },
  { num: "03", label: "Recevez",       desc: "Livraison GPS à domicile ou retrait agence" },
  { num: "04", label: "Profitez",      desc: "Contrat digital, support 7j/7" },
];

const WhySection = () => (
  <section className={styles.section}>
    {/* ── Header ── */}
    <div className={styles.header}>
      <span className={styles.tag}>⭐ POURQUOI VIT AUTO</span>
      <h2 className={styles.title}>
        La passerelle automobile<br />
        <span className={styles.accent}>entre tous les continents</span>
      </h2>
      <p className={styles.sub}>
        De Shanghai à Abidjan, de Dubaï à Casablanca — la plateforme internationale
        pour louer, acheter, importer ou exporter un véhicule d'exception.
      </p>
    </div>

    {/* ── Feature cards ── */}
    <div className={styles.grid}>
      {FEATURES.map((f) => (
        <article key={f.title} className={styles.card}>
          <div className={styles.iconWrap} style={{ background: f.bg }}>
            <span style={{ color: f.color }}>{f.icon}</span>
          </div>
          <h3 className={styles.cardTitle}>{f.title}</h3>
          <p className={styles.cardDesc}>{f.desc}</p>
          <div className={styles.cardAccent} style={{ background: f.color }} />
        </article>
      ))}
    </div>

    {/* ── Comment ça marche ── */}
    <div className={styles.steps}>
      <h3 className={styles.stepsTitle}>Comment ça marche ?</h3>
      <div className={styles.stepsGrid}>
        {STEPS.map((s, i) => (
          <div key={s.num} className={styles.step}>
            <div className={styles.stepNum}>{s.num}</div>
            {i < STEPS.length - 1 && <div className={styles.stepLine} />}
            <strong className={styles.stepLabel}>{s.label}</strong>
            <p className={styles.stepDesc}>{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default WhySection;
