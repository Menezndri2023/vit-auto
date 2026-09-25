import { Link } from "react-router-dom";
import styles from "./Services.module.css";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";

// Les libellés sont des clés (i18n/services.js) : la page est publique,
// indexée, et servie en cinq langues. Seuls l'icône, la couleur et le lien
// restent ici — ils ne se traduisent pas.
const SERVICES = [
  { cle: "shortRent",    icon: "🚗",   color: "#6366f1", bg: "rgba(99,102,241,.10)",  link: "/catalogue?mode=Louer&duree=Courte" },
  { cle: "longRent",     icon: "📅",   color: "#10b981", bg: "rgba(16,185,129,.10)",  link: "/catalogue?mode=Louer&duree=Longue" },
  { cle: "delivery",     icon: "🚚",   color: "#f59e0b", bg: "rgba(245,158,11,.10)",  link: "/catalogue", highlight: true },
  { cle: "sale",         icon: "💰",   color: "#ff4d2d", bg: "rgba(255,77,45,.10)",   link: "/catalogue?mode=Acheter" },
  { cle: "driver",       icon: "👨‍✈️", color: "#0f1b3f", bg: "rgba(15,27,63,.08)",    link: "/catalogue?mode=Chauffeur" },
  { cle: "leasing",      icon: "🏦",   color: "#6366f1", bg: "rgba(99,102,241,.10)",  link: "/catalogue?mode=Acheter" },
  { cle: "corporate",    icon: "🏢",   color: "#0ea5e9", bg: "rgba(14,165,233,.10)",  link: "/help" },
  { cle: "contract",     icon: "📄",   color: "#10b981", bg: "rgba(16,185,129,.10)",  link: "/dashboard" },
  { cle: "ie",           icon: "🌍",   color: "#ff4d2d", bg: "rgba(255,77,45,.10)",   link: "/import-export", highlight: true },
  // Les onze services suivants partagent le même appel à l'action : une seule
  // clé (`svc.ctaRequest`) au lieu de onze copies à traduire.
  { cle: "insurance",    icon: "🔒",   color: "#0891b2", bg: "rgba(8,145,178,.10)",   link: "/insurance-request",       cta: "svc.ctaRequest" },
  { cle: "transport",    icon: "🚢",   color: "#0ea5e9", bg: "rgba(14,165,233,.10)",  link: "/services/transport",      cta: "svc.ctaRequest" },
  { cle: "transit",      icon: "🛃",   color: "#6366f1", bg: "rgba(99,102,241,.10)",  link: "/services/transit",        cta: "svc.ctaRequest" },
  { cle: "customs",      icon: "🏛️",  color: "#f59e0b", bg: "rgba(245,158,11,.10)",  link: "/services/douanes",        cta: "svc.ctaRequest" },
  { cle: "registration", icon: "🪪",   color: "#10b981", bg: "rgba(16,185,129,.10)",  link: "/services/immatriculation", cta: "svc.ctaRequest" },
  { cle: "warranty",     icon: "🛡️",  color: "#0891b2", bg: "rgba(8,145,178,.10)",   link: "/services/garantie",       cta: "svc.ctaRequest" },
  { cle: "financing",    icon: "🏦",   color: "#ff4d2d", bg: "rgba(255,77,45,.10)",   link: "/services/financement",    cta: "svc.ctaRequest" },
  { cle: "fx",           icon: "💱",   color: "#0f1b3f", bg: "rgba(15,27,63,.08)",    link: "/services/change_devises", cta: "svc.ctaRequest" },
  { cle: "inspection",   icon: "🔍",   color: "#0ea5e9", bg: "rgba(14,165,233,.10)",  link: "/services/inspection",     cta: "svc.ctaRequest" },
  { cle: "escrow",       icon: "🔒",   color: "#0891b2", bg: "rgba(8,145,178,.10)",   link: "/services/sequestre",      cta: "svc.ctaRequest" },
];

// Les quatre étapes réutilisent les intitulés de la section « Pourquoi » de
// l'accueil (why.s1.label…) : même parcours, mêmes mots.
const STEPS = [
  { num: "01", icon: "🔍", titre: "why.s1.label", desc: "svc.step1.desc" },
  { num: "02", icon: "📋", titre: "why.s2.label", desc: "svc.step2.desc" },
  { num: "03", icon: "🚚", titre: "why.s3.label", desc: "svc.step3.desc" },
  { num: "04", icon: "🏆", titre: "why.s4.label", desc: "svc.step4.desc" },
];

// Drapeau et clés — le nom du pays comme celui de la ville se traduisent
// (« Allemagne » / « Germany » / « ألمانيا » / « 德国 »).
const COUNTRIES = [
  { flag: "🇨🇳", pays: "country.cn", ville: "city.shanghai"   },
  { flag: "🇦🇪", pays: "country.ae", ville: "city.dubai"      },
  { flag: "🇩🇪", pays: "country.de", ville: "city.munich"     },
  { flag: "🇫🇷", pays: "country.fr", ville: "city.paris"      },
  { flag: "🇲🇦", pays: "country.ma", ville: "city.casablanca" },
  { flag: "🇩🇿", pays: "country.dz", ville: "city.alger"      },
  { flag: "🇨🇮", pays: "country.ci", ville: "city.abidjan"    },
  { flag: "🇸🇳", pays: "country.sn", ville: "city.dakar"      },
  { flag: "🇬🇭", pays: "country.gh", ville: "city.accra"      },
  { flag: "🇳🇬", pays: "country.ng", ville: "city.lagos"      },
  { flag: "🇧🇯", pays: "country.bj", ville: "city.cotonou"    },
  { flag: "🇹🇬", pays: "country.tg", ville: "city.lome"       },
];

const Services = () => {
  const { t } = useI18n();
  // Métadonnées propres à cette page — voir hooks/useDocumentMeta.js. Le
  // composant avait un corps implicite (`=> (`), qui ne peut pas contenir
  // d'appel de hook : converti en corps explicite.
  useDocumentMeta({
    title:       t("svc.metaTitle"),
    description: t("svc.metaDesc"),
    traduite:    true,
  });

  return (
  <div className={styles.page}>

    {/* ── HERO ── */}
    <section className={styles.hero}>
      <div className={styles.heroBubble1} />
      <div className={styles.heroBubble2} />
      <div className={styles.heroContent}>
        <span className={styles.heroBadge}>{t("svc.heroBadge")}</span>
        <h1>{t("svc.heroTitle1")}<br />{t("svc.heroTitle2")}</h1>
        <p>{t("svc.heroDesc")}</p>
        <div className={styles.heroBtns}>
          <Link className={styles.primaryBtn} to="/catalogue">{t("svc.seeCatalogue")}</Link>
          <Link className={styles.secondaryBtn} to="/import-export">{t("routecta.ctaIE")}</Link>
        </div>
      </div>
    </section>

    {/* ── PAYS COUVERTS ── */}
    <section className={styles.countriesSection}>
      <div className={styles.countriesInner}>
        <p className={styles.countriesLabel}>{t("svc.countriesLabel")}</p>
        <div className={styles.countriesGrid}>
          {COUNTRIES.map((c) => (
            <div key={c.pays} className={styles.country}>
              <span className={styles.countryFlag}>{c.flag}</span>
              <span className={styles.countryName}>{t(c.pays)}</span>
              <span className={styles.countryCity}>{t(c.ville)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── SERVICES GRID ── */}
    <section className={styles.servicesSection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTag}>{t("svc.sectionTag")}</span>
        <h2>{t("svc.sectionTitle")}</h2>
        <p>{t("svc.sectionDesc")}</p>
      </div>
      <div className={styles.grid}>
        {SERVICES.map((s) => (
          <div
            key={s.cle}
            className={`${styles.card} ${s.highlight ? styles.cardHighlight : ""}`}
          >
            <div className={styles.cardIconWrap} style={{ background: s.bg }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <h3 className={styles.cardTitle}>{t(`svc.${s.cle}.title`)}</h3>
            <p className={styles.cardDesc}>{t(`svc.${s.cle}.desc`)}</p>
            <Link to={s.link} className={styles.cardBtn} style={{ color: s.color, borderColor: s.color + "33" }}>
              {t(s.cta || `svc.${s.cle}.cta`)} →
            </Link>
          </div>
        ))}
      </div>
    </section>

    {/* ── COMMENT ÇA MARCHE ── */}
    <section className={styles.howSection}>
      <div className={styles.howInner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>{t("svc.howTag")}</span>
          <h2>{t("svc.howTitle")}</h2>
          <p>{t("svc.howDesc")}</p>
        </div>
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s.num} className={styles.stepCard}>
              <div className={styles.stepNum}>{s.num}</div>
              {i < STEPS.length - 1 && <div className={styles.stepConnector} />}
              <div className={styles.stepIcon}>{s.icon}</div>
              <h4 className={styles.stepTitle}>{t(s.titre)}</h4>
              <p className={styles.stepDesc}>{t(s.desc)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA FINAL ── */}
    <section className={styles.ctaBanner}>
      <div className={styles.ctaBannerInner}>
        <div className={styles.ctaBubble} />
        <span className={styles.ctaTag}>{t("routecta.badge")}</span>
        <h2>{t("svc.ctaTitle")}</h2>
        <p>{t("svc.ctaDesc")}</p>
        <div className={styles.ctaBtns}>
          <Link className={styles.primaryBtn} to="/catalogue">{t("routecta.ctaCatalogue")}</Link>
          <Link className={styles.ghostBtn}   to="/import-export">{t("routecta.ctaIE")}</Link>
        </div>
      </div>
    </section>
  </div>
  );
};

export default Services;
