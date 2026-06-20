import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./VendorCallout.module.css";

const STATS = [
  { value: "20+",   label: "Pays couverts",          sub: "Afrique · Europe · Asie" },
  { value: "0 %",   label: "Commission",             sub: "les 30 premiers jours" },
  { value: "24h",   label: "Validation",             sub: "annonce en ligne" },
];

const VendorCallout = () => {
  const { user } = useAuth();
  const isPartner = user?.role === "partenaire" || user?.role === "admin";

  return (
    <section className={styles.section}>
      <div className={styles.inner}>

        {/* Deco bulles */}
        <div className={styles.bubble1} />
        <div className={styles.bubble2} />

        <div className={styles.content}>
          {/* Left */}
          <div className={styles.left}>
            <span className={styles.tag}>
              {isPartner ? "🚀 ESPACE PARTENAIRE" : "🤝 DEVENEZ PARTENAIRE"}
            </span>
            <h2 className={styles.title}>
              {isPartner
                ? "Publiez votre prochain véhicule"
                : "Vendez ou importez à l'international"}
            </h2>
            <p className={styles.desc}>
              {isPartner
                ? "Ajoutez une annonce en quelques minutes — location, vente, chauffeur ou import/export. Visibilité dans 20+ pays, paiements automatisés."
                : "Rejoignez des centaines de partenaires sur 20+ pays — Afrique, Europe, Chine, Dubaï. Publication gratuite, clients vérifiés, revenus automatiques."}
            </p>

            <Link
              to={isPartner ? "/vendor" : "/register"}
              className={styles.cta}
            >
              {isPartner ? "Publier une annonce →" : "Commencer gratuitement →"}
            </Link>
          </div>

          {/* Right : stats */}
          {!isPartner && (
            <div className={styles.right}>
              {STATS.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <span className={styles.statVal}>{s.value}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                  <span className={styles.statSub}>{s.sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default VendorCallout;
