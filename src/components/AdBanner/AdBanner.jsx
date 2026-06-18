import { useEffect, useState } from "react";
import styles from "./AdBanner.module.css";

/**
 * Affiche une bannière publicitaire depuis le backend ou localStorage (admin preview).
 * position: "featured_section" | "catalogue_top" | "catalogue_mid"
 */
const AdBanner = ({ position = "featured_section" }) => {
  const [ads, setAds] = useState([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    // Essai API, puis fallback localStorage (prévisualisation admin)
    fetch(`/api/ads?position=${position}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setAds(data);
        else {
          // Fallback localStorage pour l'admin
          try {
            const stored = JSON.parse(localStorage.getItem("vit_ads") || "[]");
            setAds(stored.filter((a) => a.active && a.position === position));
          } catch { /* */ }
        }
      })
      .catch(() => {
        try {
          const stored = JSON.parse(localStorage.getItem("vit_ads") || "[]");
          setAds(stored.filter((a) => a.active && a.position === position));
        } catch { /* */ }
      });
  }, [position]);

  // Rotation auto toutes les 6 secondes si plusieurs annonces
  useEffect(() => {
    if (ads.length <= 1) return;
    const t = setInterval(() => setCurrent((c) => (c + 1) % ads.length), 6000);
    return () => clearInterval(t);
  }, [ads.length]);

  if (ads.length === 0) return null;

  const ad = ads[current];

  const handleClick = () => {
    // Track le clic
    fetch(`/api/ads/${ad._id || ad.id}/click`, { method: "POST" }).catch(() => {});
    if (ad.link) window.open(ad.link, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.adLabel}>PUB</div>

      <div
        className={`${styles.banner} ${ad.link ? styles.clickable : ""}`}
        onClick={ad.link ? handleClick : undefined}
        style={ad.image ? { backgroundImage: `url(${ad.image})` } : {}}
      >
        {/* Overlay dégradé pour lisibilité du texte */}
        <div className={styles.overlay} />

        <div className={styles.content}>
          {ad.title && <h3 className={styles.title}>{ad.title}</h3>}
          {ad.description && <p className={styles.description}>{ad.description}</p>}
          {ad.link && ad.linkLabel && (
            <span className={styles.cta}>{ad.linkLabel} →</span>
          )}
        </div>

        {/* Indicateurs de rotation */}
        {ads.length > 1 && (
          <div className={styles.dots}>
            {ads.map((_, i) => (
              <button
                key={i}
                className={`${styles.dot} ${i === current ? styles.dotActive : ""}`}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                aria-label={`Annonce ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdBanner;
