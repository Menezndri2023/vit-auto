import { useMemo, useState, useEffect, useCallback } from "react"; // useCallback pour vehicleToSlide
import { useNavigate, Link } from "react-router-dom";
import { useVehicles } from "../../context/VehicleContext";
import { useCurrency } from "../../context/CurrencyContext";
import SearchBar from "../SearchBar/SearchBar";
import styles from "./HeroSection.module.css";

const STATS = [
  { icon: "🚗", value: "1 200+", label: "Véhicules disponibles" },
  { icon: "🚚", value: "48h",    label: "Livraison garantie" },
  { icon: "⭐", value: "4.9/5",  label: "Note moyenne" },
  { icon: "📍", value: "50+",    label: "Villes couvertes" },
];

// Slides par défaut si aucun véhicule en base
// Images WebP pour réduire le poids de 30-50%
const DEFAULT_SLIDES = [
  {
    img:     "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:    "Range Rover Sport 2024",
    type:    "SUV Premium",
    city:    "Abidjan",
    fuel:    "Hybride",
    partner: "VIT AUTO Premium",
    price:   "1 400 DH / jour",
  },
  {
    img:     "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:    "Porsche Cayenne 2023",
    type:    "SUV Sport",
    city:    "Casablanca",
    fuel:    "Essence",
    partner: "VIT AUTO Maroc",
    price:   "1 800 MAD / jour",
  },
  {
    img:     "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:    "BMW Série 5 2023",
    type:    "Berline Executive",
    city:    "Dakar",
    fuel:    "Diesel",
    partner: "VIT AUTO Sénégal",
    price:   "1 050 DH / jour",
  },
  {
    img:     "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&q=80&auto=format&fit=crop&fm=webp",
    name:    "Mercedes Viano 2023",
    type:    "Monospace VIP",
    city:    "Bamako",
    fuel:    "Diesel",
    partner: "VIT AUTO Mali",
    price:   "1 150 DH / jour",
  },
];

export default function HeroSection() {
  const { vehicles } = useVehicles();
  const { fmt }      = useCurrency();
  const navigate     = useNavigate();

  const [current, setCurrent] = useState(0);
  const [fading, setFading]   = useState(false);

  // Lire les IDs admin depuis localStorage (multi-spotlight)
  const adminIds = useMemo(() => {
    try {
      const raw = localStorage.getItem("vit_hero_spotlights");
      if (raw) return JSON.parse(raw);
      const legacy = localStorage.getItem("vit_hero_spotlight");
      return legacy ? [legacy] : [];
    } catch { return []; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vehicleToSlide = useCallback((v) => {
    const isSale = v.listingType === "vente" || v.mode === "Acheter";
    const rawPrice = isSale ? (v.buyPrice || v.priceForSale) : v.pricePerDay;
    return {
      img:     v.images?.[0] || v.image || DEFAULT_SLIDES[0].img,
      name:    v.title  || v.name  || "Véhicule VIT AUTO",
      type:    v.vehicleType || v.type || "Véhicule",
      city:    v.ville  || v.city  || "",
      fuel:    v.fuel   || v.carburant || "",
      partner: v.ownerName || v.partnerName || v.contactNom || "Partenaire VIT AUTO",
      price:   rawPrice ? `${fmt(rawPrice)}${isSale ? "" : " / jour"}` : "Sur demande",
      vid:     v._id    || v.id,
      ownerId: v.ownerId || null,
    };
  }, [fmt]);

  // Construire les slides : admin > featured > all > défauts
  const slides = useMemo(() => {
    if (vehicles.length === 0) return DEFAULT_SLIDES;

    // 1. Slides sélectionnées par l'admin (dans l'ordre choisi)
    if (adminIds.length > 0) {
      const adminSlides = adminIds
        .map((id) => vehicles.find((v) => (v._id || v.id)?.toString() === id))
        .filter(Boolean)
        .map(vehicleToSlide);
      if (adminSlides.length > 0) return adminSlides;
    }

    // 2. Fallback : véhicules featured
    const pool = vehicles.filter((v) => v.available || v.featured).slice(0, 5);
    if (pool.length > 0) return pool.map(vehicleToSlide);

    // 3. Fallback absolu
    return DEFAULT_SLIDES;
  }, [vehicles, adminIds, vehicleToSlide]);

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

  // Auto-défilement 5 secondes
  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(goNext, 5000);
    return () => clearInterval(t);
  }, [goNext, total]);

  const slide = slides[current];

  return (
    <section className={styles.hero}>
      {/* ─── COLONNE GAUCHE ─── */}
      <div className={styles.left}>
        <span className={styles.intlBadge}>🌍 Plateforme internationale • 14 pays</span>

        <h1 className={styles.title}>
          Location & vente de<br />
          <span className={styles.titleAccent}>véhicules premium</span>
        </h1>

        <p className={styles.subtitle}>
          Trouvez le véhicule idéal près de chez vous. Livraison GPS à domicile,
          paiement sécurisé, contrat digital immédiat.
        </p>

        <div className={styles.ctas}>
          <Link to="/catalogue" className={styles.ctaPrimary}>
            Voir les véhicules
          </Link>
          <Link to="/register" className={styles.ctaSecondary}>
            Devenir partenaire →
          </Link>
        </div>

        {/* Mini-stats sous les CTA */}
        <div className={styles.trustPills}>
          <span>✅ Identité vérifiée</span>
          <span>🛡️ Paiement sécurisé</span>
          <span>📄 Contrat digital</span>
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
          <span className={styles.spotBadge}>🟢 Sélection du moment</span>

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

      {/* ─── STATS ─── */}
      <div className={styles.statsRow}>
        {STATS.map((s) => (
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
