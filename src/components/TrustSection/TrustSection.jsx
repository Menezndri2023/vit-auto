import React from "react";
import styles from "./TrustSection.module.css";
import { useI18n } from "../../context/I18nContext";

// Comme WhySection : le tableau ne porte que l'habillage et la clé. Les textes
// sont dans i18n/accueil.js, en cinq langues.
const TRUST_ITEMS = [
  { cle: "t1", icon: "🪪", color: "#6366f1" },
  { cle: "t2", icon: "🔐", color: "#10b981" },
  { cle: "t3", icon: "📄", color: "#f59e0b" },
  { cle: "t4", icon: "🎧", color: "#ff4d2d" },
];

// Les sigles (TLS, RGPD, BCrypt, JWT, ISO) ne se traduisent pas : seule leur
// légende change de langue.
const CERTIFS = [
  { label: "TLS 1.3",   cle: "trust.certEncryption" },
  { label: "RGPD",      cle: "trust.certCompliance" },
  { label: "BCrypt",    cle: "trust.certPasswords" },
  { label: "JWT",       cle: "trust.certAuth" },
  { label: "ISO 27001", cle: "trust.certHosting" },
];

const TrustSection = () => {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      <div className={styles.inner}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <span className={styles.tag}>{t("trust.tag")}</span>
          <h2 className={styles.title}>
            {t("trust.title1")}<br />
            <span className={styles.accent}>{t("trust.title2")}</span>
          </h2>
          <p className={styles.sub}>{t("trust.sub")}</p>
        </div>

        {/* ── Grid ── */}
        <div className={styles.grid}>
          {TRUST_ITEMS.map((item) => (
            <article key={item.cle} className={styles.card}>
              <div className={styles.iconBox} style={{ background: `${item.color}18`, color: item.color }}>
                {item.icon}
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{t(`trust.${item.cle}.title`)}</h3>
                <p className={styles.cardDesc}>{t(`trust.${item.cle}.desc`)}</p>
              </div>
              <div className={styles.cardBar} style={{ background: item.color }} />
            </article>
          ))}
        </div>

        {/* ── Certifications ── */}
        <div className={styles.certifRow}>
          <p className={styles.certifLabel}>{t("trust.certifLabel")}</p>
          <div className={styles.certifs}>
            {CERTIFS.map((c) => (
              <div key={c.label} className={styles.certif}>
                <span className={styles.certifBadge}>{c.label}</span>
                <span className={styles.certifDesc}>{t(c.cle)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
