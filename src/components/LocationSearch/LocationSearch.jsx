import React, { useState } from "react";
import styles from "./LocationSearch.module.css";

const LocationSearch = () => {
  const [locationEnabled, setLocationEnabled] = useState(false);

  const features = [
    {
      icon: "🎯",
      title: "Détection automatique de votre position",
    },
    {
      icon: "📏",
      title: "Calcul de distance en temps réel",
    },
    {
      icon: "🔍",
      title: "Filtres avancés par zone géographique",
    },
  ];

  const handleLocationClick = () => {
    setLocationEnabled(true);
    // Trigger geolocation API
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Latitude:", position.coords.latitude);
          console.log("Longitude:", position.coords.longitude);
        },
        (error) => {
          console.error("Erreur de géolocalisation:", error);
          alert("Impossible d'accéder à votre position.");
        }
      );
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        {/* LEFT SIDE */}
        <div className={styles.content}>
          <p className={styles.tag}>🗺️ RECHERCHE PAR POSITION</p>
          <h2 className={styles.title}>
            Trouvez le véhicule <br /> le plus proche de vous
          </h2>

          <p className={styles.description}>
            Notre technologie de géolocalisation vous permet de voir en temps
            réel tous les véhicules disponibles dans un rayon de votre choix.
            Filtrez par distance, catégorie ou disponibilité pour trouver
            exactement ce qu'il vous faut.
          </p>

          {/* FEATURES */}
          <ul className={styles.features}>
            {features.map((feature, idx) => (
              <li key={idx} className={styles.featureItem}>
                <span className={styles.featureIcon}>{feature.icon}</span>
                <span className={styles.featureTitle}>{feature.title}</span>
              </li>
            ))}
          </ul>

          {/* BUTTON */}
          <button
            className={`${styles.btn} ${locationEnabled ? styles.active : ""}`}
            onClick={handleLocationClick}
          >
            <span>📍</span>
            <span>
              {locationEnabled
                ? "Géolocalisation activée"
                : "Activer la géolocalisation"}
            </span>
          </button>
        </div>

        {/* RIGHT SIDE - MAP */}
        <div className={styles.mapContainer}>
          <iframe
            className={styles.map}
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2624.896425321226!2d2.2922926!3d48.8589507!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47e66fec69c7ccc7%3A0x5f8e0a7e2e7e2e7e!2sParis%2C%20France!5e0!3m2!1sfr!2sfr!4v1234567890"
            allowFullScreen=""
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Carte de localisation"
          ></iframe>
        </div>
      </div>
    </section>
  );
};

export default LocationSearch;
