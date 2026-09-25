import React from "react";
import styles from "./WhySection.module.css";
import { useI18n } from "../../context/I18nContext";

// Les libellés ne vivent plus dans ce tableau : il ne porte que la clé de
// traduction et l'habillage. Le texte lui-même est dans i18n/accueil.js, en
// cinq langues — sans quoi /en/, /ar/… afficheraient une section française et
// la page mentirait à son propre `hreflang`.
const FEATURES = [
  { cle: "f1", icon: "🌍", color: "#ff4d2d", bg: "rgba(255,77,45,0.10)" },
  { cle: "f2", icon: "🛰️", color: "#6366f1", bg: "rgba(99,102,241,0.10)" },
  { cle: "f3", icon: "🛡️", color: "#10b981", bg: "rgba(16,185,129,0.10)" },
  { cle: "f4", icon: "🚢", color: "#0ea5e9", bg: "rgba(14,165,233,0.10)" },
  // La carte « Réservation en 2 minutes » promettait « contrat signé
  // immédiatement, confirmation par SMS ». Deux affirmations que la plateforme
  // ne tient pas : le SMS est désactivé en dur depuis l'incident Twilio de
  // 2026-07 (server/utils/smsConfigured.js, SMS_ENABLED = false), et aucune
  // annonce publiée n'a la réservation instantanée activée — toute demande
  // passe par l'acceptation du partenaire. Le texte traduit dit désormais ce
  // qui se passe réellement.
  { cle: "f5", icon: "⚡", color: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
  { cle: "f6", icon: "🤝", color: "#8b5cf6", bg: "rgba(139,92,246,0.10)" },
];

const STEPS = [
  { num: "01", cle: "s1" },
  { num: "02", cle: "s2" },
  { num: "03", cle: "s3" },
  { num: "04", cle: "s4" },
];

const WhySection = () => {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.tag}>{t("why.tag")}</span>
        <h2 className={styles.title}>
          {t("why.title1")}<br />
          <span className={styles.accent}>{t("why.title2")}</span>
        </h2>
        <p className={styles.sub}>{t("why.sub")}</p>
      </div>

      {/* ── Feature cards ── */}
      <div className={styles.grid}>
        {FEATURES.map((f) => (
          <article key={f.cle} className={styles.card}>
            <div className={styles.iconWrap} style={{ background: f.bg }}>
              <span style={{ color: f.color }}>{f.icon}</span>
            </div>
            <h3 className={styles.cardTitle}>{t(`why.${f.cle}.title`)}</h3>
            <p className={styles.cardDesc}>{t(`why.${f.cle}.desc`)}</p>
            <div className={styles.cardAccent} style={{ background: f.color }} />
          </article>
        ))}
      </div>

      {/* ── Comment ça marche ── */}
      <div className={styles.steps}>
        <h3 className={styles.stepsTitle}>{t("why.stepsTitle")}</h3>
        <div className={styles.stepsGrid}>
          {STEPS.map((s, i) => (
            <div key={s.num} className={styles.step}>
              <div className={styles.stepNum}>{s.num}</div>
              {i < STEPS.length - 1 && <div className={styles.stepLine} />}
              <strong className={styles.stepLabel}>{t(`why.${s.cle}.label`)}</strong>
              <p className={styles.stepDesc}>{t(`why.${s.cle}.desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhySection;
