import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./VendorCallout.module.css";

const STATS = [
  { value: "20",    label: "Partenaires fondateurs", sub: "avantages exclusifs" },
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
                : "Monétisez votre véhicule dès aujourd'hui"}
            </h2>
            <p className={styles.desc}>
              {isPartner
                ? "Ajoutez une annonce en quelques minutes — location, vente ou chauffeur. Gestion complète depuis votre espace partenaire."
                : "Rejoignez des centaines de partenaires en Côte d'Ivoire, au Maroc, au Sénégal et en France. Publication gratuite, paiements automatisés, clients vérifiés."}
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
