import { Link } from "react-router-dom";
import styles from "./Services.module.css";

const SERVICES = [
  {
    icon:  "🚗",
    color: "#6366f1",
    bg:    "rgba(99,102,241,.10)",
    title: "Location courte durée",
    desc:  "Louez un véhicule à la journée pour vos déplacements ponctuels. Disponible en Côte d'Ivoire, Maroc, Sénégal, France et 10 autres pays.",
    cta:   "Explorer le catalogue",
    link:  "/catalogue?mode=Louer",
  },
  {
    icon:  "📅",
    color: "#10b981",
    bg:    "rgba(16,185,129,.10)",
    title: "Location longue durée",
    desc:  "Tarif mensuel dégressif sans engagement d'achat. Idéal pour les expatriés, les missions professionnelles et les étudiants.",
    cta:   "Voir les offres",
    link:  "/catalogue?mode=Louer",
  },
  {
    icon:  "🚚",
    color: "#f59e0b",
    bg:    "rgba(245,158,11,.10)",
    title: "Livraison GPS à domicile",
    desc:  "Votre véhicule livré à votre adresse exacte grâce au calcul GPS Haversine. Frais transparents : 15 DH de base + 3 DH/km.",
    cta:   "Réserver avec livraison",
    link:  "/catalogue",
    highlight: true,
  },
  {
    icon:  "💰",
    color: "#ff4d2d",
    bg:    "rgba(255,77,45,.10)",
    title: "Vente de véhicules",
    desc:  "Achetez ou vendez votre véhicule en toute sécurité. Contrat digital, vérification d'identité, paiement sécurisé. Neuf ou occasion.",
    cta:   "Voir les véhicules à vendre",
    link:  "/catalogue?mode=Acheter",
  },
  {
    icon:  "👨‍✈️",
    color: "#0f1b3f",
    bg:    "rgba(15,27,63,.08)",
    title: "Service chauffeur privé",
    desc:  "Réservez un chauffeur professionnel vérifié pour vos transferts aéroport, mariages, événements ou trajets quotidiens.",
    cta:   "Trouver un chauffeur",
    link:  "/catalogue?mode=Chauffeur",
  },
  {
    icon:  "🏦",
    color: "#6366f1",
    bg:    "rgba(99,102,241,.10)",
    title: "Leasing & Mensualités",
    desc:  "Accédez à la propriété sans payer comptant. Apport réduit + mensualités adaptées. Contrat électronique à valeur légale.",
    cta:   "Voir les offres leasing",
    link:  "/catalogue?mode=Acheter",
  },
  {
    icon:  "🏢",
    color: "#0ea5e9",
    bg:    "rgba(14,165,233,.10)",
    title: "Solutions entreprise",
    desc:  "Flottes multi-véhicules, tarifs négociés, facturation centralisée. Pack Corporate disponible pour les agences et sociétés de transport.",
    cta:   "Contactez-nous",
    link:  "/help",
  },
  {
    icon:  "📄",
    color: "#10b981",
    bg:    "rgba(16,185,129,.10)",
    title: "Contrat digital automatique",
    desc:  "Chaque réservation génère un contrat électronique sécurisé, signable en ligne. Valeur juridique reconnue en Afrique et Europe.",
    cta:   "Mon tableau de bord",
    link:  "/dashboard",
  },
  {
    icon:  "🌍",
    color: "#ff4d2d",
    bg:    "rgba(255,77,45,.10)",
    title: "Import / Export International",
    desc:  "Achetez depuis la Chine, Dubaï, l'Europe ou l'Afrique. VIT AUTO gère la recherche, l'inspection, le transport et le dédouanement.",
    cta:   "Découvrir le service",
    link:  "/import-export",
    highlight: true,
  },
  {
    icon:  "🔒",
    color: "#0891b2",
    bg:    "rgba(8,145,178,.10)",
    title: "Assurance Automobile",
    desc:  "Demande d'assurance auto, location ou import/export en quelques clics. Notre équipe étudie votre dossier et vous propose une prime adaptée.",
    cta:   "Faire une demande",
    link:  "/insurance-request",
  },
];

const STEPS = [
  { num: "01", icon: "🔍", title: "Recherchez",   desc: "Filtrez par ville, type, état (neuf/occasion) et budget depuis la barre de recherche." },
  { num: "02", icon: "📋", title: "Réservez",     desc: "3 étapes : informations, vérification d'identité, paiement sécurisé." },
  { num: "03", icon: "🚚", title: "Recevez",      desc: "Livraison GPS à domicile par le partenaire ou retrait en agence, à votre choix." },
  { num: "04", icon: "🏆", title: "Profitez",     desc: "Contrat digital signé, support 7j/7, véhicule assuré et vérifié." },
];

const COUNTRIES = [
  { flag: "🇨🇳", name: "Chine",         city: "Shanghai"    },
  { flag: "🇦🇪", name: "Émirats",       city: "Dubaï"       },
  { flag: "🇩🇪", name: "Allemagne",     city: "Munich"      },
  { flag: "🇫🇷", name: "France",        city: "Paris"       },
  { flag: "🇲🇦", name: "Maroc",         city: "Casablanca"  },
  { flag: "🇩🇿", name: "Algérie",       city: "Alger"       },
  { flag: "🇨🇮", name: "Côte d'Ivoire", city: "Abidjan"     },
  { flag: "🇸🇳", name: "Sénégal",       city: "Dakar"       },
  { flag: "🇬🇭", name: "Ghana",         city: "Accra"       },
  { flag: "🇳🇬", name: "Nigeria",       city: "Lagos"       },
  { flag: "🇧🇯", name: "Bénin",         city: "Cotonou"     },
  { flag: "🇹🇬", name: "Togo",          city: "Lomé"        },
];

const Services = () => (
  <div className={styles.page}>

    {/* ── HERO ── */}
    <section className={styles.hero}>
      <div className={styles.heroBubble1} />
      <div className={styles.heroBubble2} />
      <div className={styles.heroContent}>
        <span className={styles.heroBadge}>🌍 NOS SERVICES — 20+ PAYS</span>
        <h1>La passerelle automobile<br />entre tous les continents</h1>
        <p>
          Location, vente, import depuis la Chine ou Dubaï, livraison GPS, chauffeur privé —
          VIT AUTO couvre l'intégralité de vos besoins automobile à l'échelle mondiale.
        </p>
        <div className={styles.heroBtns}>
          <Link className={styles.primaryBtn} to="/catalogue">Voir le catalogue</Link>
          <Link className={styles.secondaryBtn} to="/import-export">Import / Export →</Link>
        </div>
      </div>
    </section>

    {/* ── PAYS COUVERTS ── */}
    <section className={styles.countriesSection}>
      <div className={styles.countriesInner}>
        <p className={styles.countriesLabel}>Présents dans 20+ pays :</p>
        <div className={styles.countriesGrid}>
          {COUNTRIES.map((c) => (
            <div key={c.name} className={styles.country}>
              <span className={styles.countryFlag}>{c.flag}</span>
              <span className={styles.countryName}>{c.name}</span>
              <span className={styles.countryCity}>{c.city}</span>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── SERVICES GRID ── */}
    <section className={styles.servicesSection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTag}>🚀 NOS OFFRES</span>
        <h2>Des services mondiaux, une seule plateforme</h2>
        <p>Location, vente, import depuis l'Asie ou le Moyen-Orient, chauffeur privé — tout en un, partout dans le monde.</p>
      </div>
      <div className={styles.grid}>
        {SERVICES.map((s) => (
          <div
            key={s.title}
            className={`${styles.card} ${s.highlight ? styles.cardHighlight : ""}`}
          >
            <div className={styles.cardIconWrap} style={{ background: s.bg }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <h3 className={styles.cardTitle}>{s.title}</h3>
            <p className={styles.cardDesc}>{s.desc}</p>
            <Link to={s.link} className={styles.cardBtn} style={{ color: s.color, borderColor: s.color + "33" }}>
              {s.cta} →
            </Link>
          </div>
        ))}
      </div>
    </section>

    {/* ── COMMENT ÇA MARCHE ── */}
    <section className={styles.howSection}>
      <div className={styles.howInner}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTag}>⚡ PROCESSUS</span>
          <h2>Comment ça fonctionne ?</h2>
          <p>Réservez un véhicule ou publiez une annonce en quelques minutes.</p>
        </div>
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s.num} className={styles.stepCard}>
              <div className={styles.stepNum}>{s.num}</div>
              {i < STEPS.length - 1 && <div className={styles.stepConnector} />}
              <div className={styles.stepIcon}>{s.icon}</div>
              <h4 className={styles.stepTitle}>{s.title}</h4>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ── CTA FINAL ── */}
    <section className={styles.ctaBanner}>
      <div className={styles.ctaBannerInner}>
        <div className={styles.ctaBubble} />
        <span className={styles.ctaTag}>🌍 MARCHÉ AUTOMOBILE MONDIAL</span>
        <h2>Votre véhicule, depuis n'importe où dans le monde</h2>
        <p>Location locale, achat, import depuis la Chine ou Dubaï — 50 000+ utilisateurs satisfaits sur 5 continents.</p>
        <div className={styles.ctaBtns}>
          <Link className={styles.primaryBtn} to="/catalogue">Explorer le catalogue</Link>
          <Link className={styles.ghostBtn}   to="/import-export">Import / Export →</Link>
        </div>
      </div>
    </section>
  </div>
);

export default Services;
