import { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useVehicles } from "../../context/VehicleContext";
import { useCurrency } from "../../context/CurrencyContext";
import SearchBar from "../SearchBar/SearchBar";
import styles from "./HeroSection.module.css";

const STATS = [
  { icon: "🚗", value: "1200+", label: "Véhicules" },
  { icon: "🚚", value: "48h",   label: "Livraison garantie" },
  { icon: "⭐", value: "4.9/5", label: "Avis clients" },
  { icon: "📍", value: "50+",   label: "Villes couvertes" },
];

const DEFAULT_CAR =
  "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&q=85&auto=format&fit=crop";

function SpotlightCard({ vehicle, fmt, navigate }) {
  if (!vehicle) {
    return (
      <div className={styles.spotCard}>
        <img src={DEFAULT_CAR} alt="Véhicule VIT AUTO" className={styles.spotImg} />
        <span className={styles.spotBadge}>🟢 Sélection du moment</span>
      </div>
    );
  }

  const img     = vehicle.images?.[0] || vehicle.image || DEFAULT_CAR;
  const name    = vehicle.title || vehicle.name || "Véhicule sélectionné";
  const isSale  = vehicle.listingType === "vente" || vehicle.mode === "Acheter";
  const price   = isSale ? vehicle.buyPrice || vehicle.priceForSale : vehicle.pricePerDay;
  const city    = vehicle.ville || vehicle.city || "";
  const type    = vehicle.vehicleType || vehicle.type || "";
  const fuel    = vehicle.fuel || vehicle.carburant || "";
  const partner = vehicle.partnerName || vehicle.ownerName || "Partenaire VIT AUTO";
  const vid     = vehicle._id || vehicle.id;

  return (
    <div className={styles.spotCard}>
      <img src={img} alt={name} className={styles.spotImg} />
      <span className={styles.spotBadge}>🟢 Sélection du moment</span>

      {/* Overlay hover */}
      <div className={styles.spotOverlay}>
        <p className={styles.spotPublisher}>
          <span className={styles.spotAvatar}>🏢</span>
          Publié par <strong>{partner}</strong>
        </p>
        <h3 className={styles.spotName}>{name}</h3>
        <div className={styles.spotTags}>
          {type && <span>{type}</span>}
          {city && <span>📍 {city}</span>}
          {fuel && <span>{fuel}</span>}
        </div>
        <div className={styles.spotFooter}>
          <span className={styles.spotPrice}>
            {price ? `${fmt(price)}${isSale ? "" : " / jour"}` : "Sur demande"}
          </span>
          {vid && (
            <button
              type="button"
              className={styles.spotCta}
              onClick={() => navigate(`/vehicle/${vid}`)}
            >
              Voir l'annonce →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HeroSection() {
  const { vehicles } = useVehicles();
  const { fmt }      = useCurrency();
  const navigate     = useNavigate();

  const spotlight = useMemo(() => {
    const id = localStorage.getItem("vit_hero_spotlight");
    if (id && vehicles.length) {
      const found = vehicles.find((v) => (v._id || v.id)?.toString() === id);
      if (found) return found;
    }
    return vehicles.find((v) => v.featured) || vehicles[0] || null;
  }, [vehicles]);

  return (
    <section className={styles.hero}>
      {/* ─── Gauche ─── */}
      <div className={styles.left}>
        <span className={styles.intlBadge}>🌍 Plateforme internationale</span>

        <h1 className={styles.title}>
          Conduisez l'extraordinaire,<br />
          <span className={styles.titleAccent}>où que vous soyez</span>
        </h1>

        <p className={styles.subtitle}>
          La plateforme premium pour louer, acheter ou réserver un chauffeur.
          Des véhicules d'exception, un service irréprochable.
        </p>

        <div className={styles.ctas}>
          <Link to="/catalogue" className={styles.ctaPrimary}>
            Découvrir nos offres
          </Link>
          <Link to="/partner" className={styles.ctaSecondary}>
            Devenir partenaire →
          </Link>
        </div>
      </div>

      {/* ─── Droite (SpotlightCard) ─── */}
      <div className={styles.right}>
        <SpotlightCard vehicle={spotlight} fmt={fmt} navigate={navigate} />
      </div>

      {/* ─── Barre de recherche ─── */}
      <div className={styles.searchRow}>
        <SearchBar />
      </div>

      {/* ─── Stats ─── */}
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
