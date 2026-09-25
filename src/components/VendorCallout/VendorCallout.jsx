import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../context/I18nContext";
import styles from "./VendorCallout.module.css";

// "Commission 0% les 30 premiers jours" retiré — aucune exemption de ce type
// n'existe dans le calcul réel des commissions (server/controllers/
// bookingController.js COMMISSION_RATES, toujours appliqué dès la première
// réservation). Remplacé par un fait vérifiable : la publication d'annonce
// elle-même est gratuite, quel que soit le statut du partenaire.
// Les chiffres restent en dur (ils ne se traduisent pas) ; leurs légendes
// passent par t().
const STATS = [
  { value: "20+", cle: "Countries" },
  { value: "0 %", cle: "Fees" },
  { value: "24h", cle: "Validation" },
];

const VendorCallout = () => {
  const { user } = useAuth();
  const { t } = useI18n();
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
              {t(isPartner ? "vendor.tagPartner" : "vendor.tagVisitor")}
            </span>
            <h2 className={styles.title}>
              {t(isPartner ? "vendor.titlePartner" : "vendor.titleVisitor")}
            </h2>
            <p className={styles.desc}>
              {t(isPartner ? "vendor.descPartner" : "vendor.descVisitor")}
            </p>

            <Link
              to={isPartner ? "/vendor" : "/register"}
              className={styles.cta}
            >
              {t(isPartner ? "vendor.ctaPartner" : "vendor.ctaVisitor")}
            </Link>
          </div>

          {/* Right : stats */}
          {!isPartner && (
            <div className={styles.right}>
              {STATS.map((s) => (
                <div key={s.cle} className={styles.stat}>
                  <span className={styles.statVal}>{s.value}</span>
                  <span className={styles.statLabel}>{t(`vendor.stat${s.cle}`)}</span>
                  <span className={styles.statSub}>{t(`vendor.stat${s.cle}Sub`)}</span>
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
