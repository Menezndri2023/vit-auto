import { useEffect, useState } from "react";
import styles from "./AdBanner.module.css";

// Bannière publicitaire — consomme l'API Ad déjà existante côté backend
// (server/models/Ad.js, controllers/adsController.js) mais jusqu'ici jamais
// affichée nulle part sur le site public. Rendu discret : si aucune annonce
// active pour cette position, le composant ne rend rien (jamais d'espace vide).
export default function AdBanner({ position = "featured_section" }) {
  const [ad, setAd] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads?position=${encodeURIComponent(position)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((ads) => { if (!cancelled) setAd(Array.isArray(ads) && ads.length ? ads[0] : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [position]);

  if (!ad) return null;

  const handleClick = () => {
    fetch(`/api/ads/${ad._id}/click`, { method: "POST" }).catch(() => {});
  };

  return (
    <section className={styles.wrap}>
      <a
        href={ad.link || "#"}
        onClick={handleClick}
        target={ad.link ? "_blank" : undefined}
        rel={ad.link ? "noopener noreferrer" : undefined}
        className={styles.card}
      >
        {ad.image && <img src={ad.image} alt={ad.title} className={styles.image} />}
        <div className={styles.body}>
          <h3 className={styles.title}>{ad.title}</h3>
          {ad.description && <p className={styles.desc}>{ad.description}</p>}
          <span className={styles.cta}>{ad.linkLabel || "En savoir plus"} →</span>
        </div>
      </a>
    </section>
  );
}
