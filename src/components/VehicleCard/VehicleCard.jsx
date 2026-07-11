import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../context/CurrencyContext";
import styles from "./VehicleCard.module.css";

const VehicleCard = React.memo(({ car, compact }) => {
  const navigate  = useNavigate();
  const { fmt }   = useCurrency();
  const imgs = (() => {
    const arr = [];
    if (Array.isArray(car.images) && car.images.length > 0) arr.push(...car.images);
    else if (car.image) arr.push(car.image);
    return arr.length > 0 ? arr : null;
  })();

  const [imgIdx, setImgIdx] = useState(0);
  const [fading, setFading] = useState(false);

  // Rotation automatique des images toutes les 3s (si plusieurs)
  useEffect(() => {
    if (!imgs || imgs.length <= 1) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setImgIdx((i) => (i + 1) % imgs.length);
        setFading(false);
      }, 250);
    }, 3000);
    return () => clearInterval(t);
  }, [imgs?.length]);

  const goImg = useCallback((e, dir) => {
    e.stopPropagation();
    if (!imgs || imgs.length <= 1) return;
    setFading(true);
    setTimeout(() => {
      setImgIdx((i) => (i + dir + imgs.length) % imgs.length);
      setFading(false);
    }, 200);
  }, [imgs]);

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <div className={styles.cover}>
        {imgs ? (
          <>
            <img
              src={imgs[imgIdx]}
              alt={car.title || car.name}
              loading="lazy"
              className={fading ? styles.imgFading : ""}
            />
            {/* Navigation images si plusieurs */}
            {imgs.length > 1 && (
              <>
                <button type="button" aria-label="Photo précédente" className={`${styles.imgArrow} ${styles.imgPrev}`} onClick={(e) => goImg(e, -1)}>‹</button>
                <button type="button" aria-label="Photo suivante" className={`${styles.imgArrow} ${styles.imgNext}`} onClick={(e) => goImg(e, 1)}>›</button>
                <div className={styles.imgDots}>
                  {imgs.map((_, i) => (
                    <span
                      key={i}
                      className={`${styles.imgDot} ${i === imgIdx ? styles.imgDotActive : ""}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className={styles.coverPlaceholder}>🚗</div>
        )}

        <div className={styles.badges}>
          <span className={`${styles.badge} ${(car.mode === "Acheter" || car.listingType === "vente") ? styles.sale : styles.location}`}>
            {(car.mode === "Acheter" || car.listingType === "vente") ? "Vente" : "Location"}
          </span>
          <span className={`${styles.badge} ${car.available ? styles.available : styles.reserve}`}>
            {car.available ? "Disponible" : "Réservé"}
          </span>
        </div>
      </div>

      <div className={styles.info}>
        <div className={styles.topRow}>
          <h3>{car.title || car.name}</h3>
          {car.distance != null && (
            <span className={styles.km}>{Number(car.distance).toFixed(1)} km</span>
          )}
        </div>
        <p className={styles.type}>{car.vehicleType || car.type}</p>

        {/* Annonceur — badge cliquable premium */}
        {(car.ownerName || car.contactNom || car.partnerName) && (
          <div className={styles.publisherRow}>
            <button
              type="button"
              className={`${styles.publisherChip} ${car.ownerId ? styles.publisherChipLink : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (car.ownerId) navigate(`/partner/${car.ownerId}`);
              }}
              title={car.ownerId ? "Voir le profil du partenaire" : "Annonceur"}
            >
              <span className={styles.publisherAvt}>
                {(car.ownerName || car.contactNom || "P").charAt(0).toUpperCase()}
              </span>
              <span className={styles.publisherName}>
                {car.ownerName || car.contactNom || car.partnerName}
              </span>
              {car.ownerId && <span className={styles.publisherArrow}>›</span>}
            </button>
            {/* Badge certification VIT AUTO */}
            {car.certificationBadge && car.certificationBadge !== "none" && (
              <span
                className={styles.certBadge}
                style={{
                  background:
                    car.certificationBadge === "premium"   ? "linear-gradient(135deg,#7c3aed,#a855f7)" :
                    car.certificationBadge === "fondateur" ? "linear-gradient(135deg,#d97706,#f59e0b)" :
                    "linear-gradient(135deg,#059669,#10b981)",
                }}
                title="Partenaire certifié par VIT AUTO"
              >
                {car.certificationBadge === "premium" ? "⭐" : car.certificationBadge === "fondateur" ? "🏆" : "🟢"} Vérifié
              </span>
            )}
          </div>
        )}

        <div className={styles.meta}>
          {car.rating    != null && <span>⭐ {car.rating} ({car.reviews || 0})</span>}
          {(car.nombrePlaces || car.seats) != null && <span>🧍 {car.nombrePlaces || car.seats} pl.</span>}
          {(car.transmission) && <span>⚙️ {car.transmission}</span>}
          {(car.fuel || car.carburant) && <span>⛽ {car.fuel || car.carburant}</span>}
        </div>

        <div className={styles.priceBlock}>
          <p className={styles.price}>
            {(car.mode === "Acheter" || car.listingType === "vente")
              ? fmt(car.buyPrice || car.priceForSale || 0)
              : `${fmt(car.pricePerDay || 0)} / jour`}
          </p>
          {(car.ville || car.city) && (
            <p className={styles.ville}>📍 {car.ville || car.city}</p>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={() => navigate(`/vehicle/${car._id || car.id}`)}
          className={styles.secondary}
        >
          Détails
        </button>
        <button onClick={() => navigate(`/booking/${car._id || car.id}`)}>
          {(car.mode === "Acheter" || car.listingType === "vente") ? "Essai gratuit" : "Réserver"}
        </button>
      </div>
    </div>
  );
});

export default VehicleCard;
