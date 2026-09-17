import { useMemo, useState, useEffect, useCallback } from "react"; // useCallback pour vehicleToSlide
import { useNavigate, Link } from "react-router-dom";
import { useSpotlight } from "../../hooks/useSpotlight";
import { useCurrency } from "../../context/CurrencyContext";
import { useI18n } from "../../context/I18nContext";
import { IMPORT_ORIGINS } from "../../constants/importOrigins";
// Les pastilles pointaient vers une vue filtrée du catalogue — une URL que les
// moteurs ne peuvent pas distinguer de la page principale. Elles mènent
// désormais à la page indexable du corridor.
import { slugifyCity } from "../../constants/citySlug";
import SearchBar from "../SearchBar/SearchBar";
import styles from "./HeroSection.module.css";

// Chiffres affichés sous la barre de recherche. Ils étaient écrits en dur —
// « 3 500+ véhicules », « 20+ pays », « 4.9/5 de note moyenne » — alors que la
// plateforme comptait 138 véhicules publiés, 3 pays et aucun avis. Un écart de
// cet ordre ne se rattrape pas : un partenaire qui recoupe une seule valeur
// cesse de croire toutes les autres, y compris les vraies.
//
// Ils viennent désormais de GET /api/vehicles/public-stats et grandissent
// d'eux-mêmes. La note moyenne n'apparaît que lorsqu'il existe réellement des
// avis ; sinon la case cède la place à une information vraie et stable.
// La tuile n'énumère plus « Japon · Europe · Dubaï » : trois origines sur les
// quinze réellement ouvertes, dont la Chine — première origine du stock. La
// bande de pays affichée juste en dessous les porte toutes
// (constants/importOrigins.js).
const STAT_IMPORT = { icon: "🚢", value: "Import", label: "Depuis 15 pays" };

function buildStats(stats, t) {
  if (!stats) return [STAT_IMPORT];
  const items = [];
  if (stats.vehicles > 0) {
    items.push({ icon: "🚗", value: stats.vehicles.toLocaleString("fr-FR"), label: t("home.statVehicles") });
  }
  if (stats.countries > 0) {
    items.push({ icon: "🌍", value: String(stats.countries), label: t(stats.countries > 1 ? "home.statCountries" : "home.statCountry") });
  }
  // Seuil volontaire : une moyenne calculée sur deux avis n'est pas une note,
  // c'est un hasard — et l'afficher comme telle serait le même travers que les
  // chiffres inventés qu'on retire ici.
  if (stats.rating && stats.reviewCount >= 5) {
    items.push({ icon: "⭐", value: `${stats.rating.toLocaleString("fr-FR")}/5`, label: t("home.statRating", { n: stats.reviewCount }) });
  }
  items.push(STAT_IMPORT);
  return items;
}

// Slides par défaut — données Afrique de l'Ouest, montants en USD (source de
// vérité de la plateforme, voir server/scripts/migrate-vehicle-booking-to-usd.mjs)
// convertis dans la devise du visiteur au rendu, comme les vrais véhicules
// (voir vehicleToSlide ci-dessous) — jamais un libellé figé en FCFA/EUR.
const DEFAULT_SLIDES = [
  {
    img:      "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:     "Toyota Land Cruiser V8 2024",
    type:     "SUV Premium",
    city:     "Abidjan",
    fuel:     "Diesel",
    partner:  "VIT AUTO Côte d'Ivoire",
    priceUSD: 125,
    isSale:   false,
  },
  {
    img:      "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:     "Mercedes-Benz Classe E 2023",
    type:     "Berline Executive",
    city:     "Abidjan",
    fuel:     "Diesel",
    partner:  "VIT AUTO Premium",
    priceUSD: 92,
    isSale:   false,
  },
  {
    img:      "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:     "BMW X5 2022 — Import Allemagne",
    type:     "SUV Import",
    city:     "Abidjan · Livraison 45j",
    fuel:     "Essence",
    partner:  "VIT AUTO Import/Export",
    priceUSD: 20000,
    isSale:   true,
  },
  {
    img:      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:     "Hyundai Tucson 2023",
    type:     "SUV — Vente / Leasing",
    city:     "Abidjan",
    fuel:     "Hybride",
    partner:  "VIT AUTO Vente",
    priceUSD: 28000,
    isSale:   true,
  },
];

export default function HeroSection() {
  // Carrousel composé par le MOTEUR de mise en avant (emplacement « hero »,
  // 2026-09-17) : sélection admin du pays en tête, puis boosts, abonnements,
  // mérite — filtré strictement au pays du visiteur, 2 par partenaire dès 5
  // partenaires, international sans partenaire dans le pays. Un seul chemin,
  // le même que les autres vitrines (voir server/services/spotlightEngine.js).
  const { items: heroItems, repliMondial: heroInternational } = useSpotlight("hero");
  const { fmt, fmtPinned, formatLiteral } = useCurrency();
  const { t } = useI18n();
  const navigate     = useNavigate();

  const [current, setCurrent] = useState(0);
  const [fading, setFading]   = useState(false);

  // Chiffres réels de la plateforme — voir buildStats() plus haut.
  const [publicStats, setPublicStats] = useState(null);
  useEffect(() => {
    let annule = false;
    fetch("/api/vehicles/public-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!annule && d) setPublicStats(d); })
      .catch(() => { /* la rangée se limite alors à l'offre Import */ });
    return () => { annule = true; };
  }, []);

  // Contenu piloté par l'admin (titre/sous-titre/carrousel) — bug réel
  // corrigé (audit) : auparavant stocké en localStorage du navigateur admin
  // uniquement (aucun visiteur réel ne le voyait jamais), et le titre/sous-
  // titre n'étaient de toute façon lus nulle part dans ce composant (JSX
  // figé). Voir server/models/SiteContent.js + MarketingSection (AdminPanel.jsx).
  const [heroContent, setHeroContent] = useState({ heroTitle: "", heroSubtitle: "", heroSpotlights: [], heroSpotlightsByCountry: [] });
  useEffect(() => {
    fetch("/api/site-content/hero")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setHeroContent(d); })
      .catch(() => {});
  }, []);

  const defaultSlides = useMemo(() => DEFAULT_SLIDES.map((s) => ({
    ...s,
    price: `${fmt(s.priceUSD)}${s.isSale ? "" : " / jour"}`,
  })), [fmt]);

  // Un élément de vitrine → une diapositive. Le prix suit la devise épinglée
  // de l'annonce (montant saisi si la devise correspond), sinon celle du visiteur.
  const itemToSlide = useCallback((it) => {
    const isSale = it.type === "vente";
    let price = "Sur demande";
    if (it.prix != null) {
      if (it.deviseAffichage && it.deviseSaisie === it.deviseAffichage && it.prixSaisi != null) price = formatLiteral(it.prixSaisi, it.deviseAffichage);
      else if (it.deviseAffichage) price = fmtPinned(it.prix, it.deviseAffichage);
      else price = fmt(it.prix);
      if (!isSale) price += " / jour";
    }
    return {
      img:     it.image || DEFAULT_SLIDES[0].img,
      name:    it.titre || "Véhicule VIT AUTO",
      type:    it.categorie || it.type || "Véhicule",
      city:    it.ville || "",
      fuel:    it.carburant || "",
      partner: it.partenaire || "Partenaire VIT AUTO",
      price,
      vid:     it.id,
      ownerId: null,
    };
  }, [fmt, fmtPinned, formatLiteral]);

  // Construire les slides : sélection admin (ordre choisi) > featured > défauts
  // — JAMAIS de repli sur des annonces non validées par un admin (bug réel
  // corrigé, audit).
  const slides = useMemo(() => {
    if (heroItems.length > 0) return heroItems.map(itemToSlide);
    // Vitrine vide (rien de publiable, ou chargement) : diapositives
    // génériques, jamais des annonces non validées.
    return defaultSlides;
  }, [heroItems, itemToSlide, defaultSlides]);

  const total = slides.length;

  const goTo = useCallback((idx) => {
    setFading(true);
    setTimeout(() => {
      setCurrent(idx);
      setFading(false);
    }, 350);
  }, []);

  const goNext = useCallback(() => {
    goTo((current + 1) % total);
  }, [current, total, goTo]);

  // Auto-défilement 25 secondes
  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(goNext, 25000);
    return () => clearInterval(t);
  }, [goNext, total]);

  const slide = slides[current];

  return (
    <section className={styles.hero}>
      {/* ─── COLONNE GAUCHE ─── */}
      <div className={styles.left}>
        <span className={styles.intlBadge}>🌍 Plateforme automobile internationale • 20+ pays</span>

        <h1 className={styles.title}>
          {heroContent.heroTitle
            ? heroContent.heroTitle
            : <>Achetez, louez, importez<br /><span className={styles.titleAccent}>depuis n'importe où</span></>}
        </h1>

        <p className={styles.subtitle}>
          {heroContent.heroSubtitle || "Afrique, Europe, Chine, Dubaï — VIT AUTO connecte acheteurs et vendeurs à travers le monde. Livraison GPS, contrat digital, paiement sécurisé."}
        </p>

        <div className={styles.ctas}>
          <Link to="/catalogue" className={styles.ctaPrimary}>
            Explorer le catalogue
          </Link>
          <Link to="/import-export" className={styles.ctaSecondary}>
            Import / Export →
          </Link>
        </div>

        {/* Mini-stats sous les CTA */}
        <div className={styles.trustPills}>
          <span>✅ Identité vérifiée</span>
          <span>🛡️ Paiement sécurisé</span>
          <span>🚢 Import clé en main</span>
        </div>
      </div>

      {/* ─── COLONNE DROITE (Carousel) ─── */}
      <div className={styles.right}>
        <div className={`${styles.spotCard} ${fading ? styles.spotFading : ""}`}>

          {/* Image — LCP : priorité haute sur la première slide */}
          <img
            src={slide.img}
            alt={slide.name}
            className={styles.spotImg}
            width="600"
            height="400"
            loading={current === 0 ? "eager" : "lazy"}
            fetchPriority={current === 0 ? "high" : "auto"}
            decoding={current === 0 ? "sync" : "async"}
            onError={(e) => { e.target.src = DEFAULT_SLIDES[0].img; }}
          />

          {/* Gradient overlay permanent */}
          <div className={styles.spotGradient} />

          {/* Badge */}
          <span className={styles.spotBadge}>{heroInternational ? "🌍 Sélection internationale" : "🟢 Sélection du moment"}</span>

          {/* Infos toujours visibles */}
          <div className={styles.spotOverlay}>
            <p className={styles.spotPublisher}>
              <span>🏢</span> Publié par <strong>{slide.partner}</strong>
            </p>
            <h3 className={styles.spotName}>{slide.name}</h3>
            <div className={styles.spotTags}>
              {slide.type && <span>{slide.type}</span>}
              {slide.city && <span>📍 {slide.city}</span>}
              {slide.fuel && <span>{slide.fuel}</span>}
            </div>
            <div className={styles.spotFooter}>
              <span className={styles.spotPrice}>{slide.price}</span>
              {slide.vid && (
                <button
                  type="button"
                  className={styles.spotCta}
                  onClick={() => navigate(`/vehicle/${slide.vid}`)}
                >
                  Voir l'annonce →
                </button>
              )}
            </div>
          </div>

          {/* Dots */}
          {total > 1 && (
            <div className={styles.spotDots}>
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.spotDot} ${i === current ? styles.spotDotActive : ""}`}
                  onClick={() => goTo(i)}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Boutons prev/next */}
          {total > 1 && (
            <>
              <button
                type="button"
                className={`${styles.carouselArrow} ${styles.carouselPrev}`}
                onClick={() => goTo((current - 1 + total) % total)}
                aria-label="Précédent"
              >‹</button>
              <button
                type="button"
                className={`${styles.carouselArrow} ${styles.carouselNext}`}
                onClick={goNext}
                aria-label="Suivant"
              >›</button>
            </>
          )}
        </div>
      </div>

      {/* ─── SEARCHBAR ─── */}
      <div className={styles.searchRow}>
        <SearchBar />
      </div>

      {/* ─── PAYS D'ORIGINE À L'IMPORT ───────────────────────────────────────
          Placée juste sous la recherche, là où un visiteur se demande « d'où
          pouvez-vous m'importer un véhicule ? ». La réponse tenait auparavant
          dans un libellé de trois mots, qui omettait la Chine — d'où provient
          l'essentiel du catalogue Import/Export. Chaque pays mène au catalogue
          filtré sur cette origine. */}
      <div className={styles.originsRow}>
        <span className={styles.originsLabel}>🚢 Import depuis :</span>
        <div className={styles.originsScroll}>
          {IMPORT_ORIGINS.map((o) => (
            <Link
              key={o.code}
              to={`/import-voiture/${slugifyCity(o.name)}`}
              className={styles.originChip}
              title={`Véhicules à importer depuis : ${o.name}`}
            >
              <span aria-hidden="true">{o.flag}</span>
              <span>{o.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── STATS ─── */}
      <div className={styles.statsRow}>
        {buildStats(publicStats, t).map((s) => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statIcon}>{s.icon}</span>
            <div>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
