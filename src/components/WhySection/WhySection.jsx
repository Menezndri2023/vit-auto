import React from "react";
import { MapPinned, Navigation, ShieldCheck, Ship, Zap, BadgeCheck } from "lucide-react";
import styles from "./WhySection.module.css";
import { useI18n } from "../../context/I18nContext";

// Les libellés ne vivent plus dans ce tableau : il ne porte que la clé de
// traduction et l'habillage. Le texte lui-même est dans i18n/accueil.js, en
// cinq langues — sans quoi /en/, /ar/… afficheraient une section française et
// la page mentirait à son propre `hreflang`.
// Icônes vectorielles d'une seule couleur, celle de la marque (2026-11-02) :
// six émojis sur six couleurs différentes donnaient un effet « arc-en-ciel ».
const FEATURES = [
  { cle: "f1", Icone: MapPinned },
  { cle: "f2", Icone: Navigation },
  { cle: "f3", Icone: ShieldCheck },
  { cle: "f4", Icone: Ship },
  // La carte « Réservation en 2 minutes » promettait « contrat signé
  // immédiatement, confirmation par SMS ». Deux affirmations que la plateforme
  // ne tient pas : le SMS est désactivé en dur depuis l'incident Twilio de
  // 2026-07 (server/utils/smsConfigured.js, SMS_ENABLED = false), et aucune
  // annonce publiée n'a la réservation instantanée activée — toute demande
  // passe par l'acceptation du partenaire. Le texte traduit dit désormais ce
  // qui se passe réellement.
  { cle: "f5", Icone: Zap },
  { cle: "f6", Icone: BadgeCheck },
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
        {FEATURES.map((f) => { const { cle, Icone } = f; return (
          <article key={cle} className={styles.card}>
            <div className={styles.iconWrap}>
              <Icone size={22} strokeWidth={2} aria-hidden="true" />
            </div>
            <h3 className={styles.cardTitle}>{t(`why.${cle}.title`)}</h3>
            <p className={styles.cardDesc}>{t(`why.${cle}.desc`)}</p>
            <div className={styles.cardAccent} />
          </article>
        ); })}
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
