import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import VehicleCard from "../VehicleCard/VehicleCard";
import { useVehicles } from "../../context/VehicleContext";
import styles from "../VehicleList/VehicleList.module.css";

const VISIBLE = 4; // cartes visibles à la fois sur desktop

const VehicleList = () => {
  // Bug réel corrigé (audit) : cette section affichait jusqu'ici les
  // premiers véhicules disponibles du catalogue général (page 1, triés par
  // date), jamais une vraie sélection admin — n'importe quelle annonce
  // approuvée pouvait s'y retrouver sans validation explicite. `featured`
  // (voir VehicleContext.loadFeaturedVehicles) ne contient QUE les annonces
  // explicitement marquées par un admin (bouton "⭐", AdminPanel.jsx).
  const { featuredVehicles } = useVehicles();
  const featured = featuredVehicles.slice(0, 8);
  const total = featured.length;

  const [start, setStart]       = useState(0);
  const [animDir, setAnimDir]   = useState(""); // "left" | "right"

  const maxStart = Math.max(0, total - VISIBLE);

  const goNext = useCallback(() => {
    setAnimDir("left");
    setStart((s) => (s + VISIBLE >= total ? 0 : s + VISIBLE));
    setTimeout(() => setAnimDir(""), 400);
  }, [total]);

  const goPrev = useCallback(() => {
    setAnimDir("right");
    setStart((s) => (s - VISIBLE < 0 ? maxStart : s - VISIBLE));
    setTimeout(() => setAnimDir(""), 400);
  }, [maxStart]);

  // Auto-défilement toutes les 3 secondes
  useEffect(() => {
    if (total <= VISIBLE) return;
    const timer = setInterval(goNext, 3000);
    return () => clearInterval(timer);
  }, [goNext, total]);

  const visible = featured.slice(start, start + VISIBLE);
  // compléter avec wrap-around si nécessaire
  const extraNeeded = VISIBLE - visible.length;
  const displayCards = extraNeeded > 0 && total > VISIBLE
    ? [...visible, ...featured.slice(0, extraNeeded)]
    : visible;

  const pageCount = Math.ceil(total / VISIBLE);
  const currentPage = Math.floor(start / VISIBLE);

  // Rien à afficher tant qu'aucun admin n'a mis d'annonce en avant — jamais
  // de repli sur des véhicules non curatés (voir commentaire ci-dessus).
  if (total === 0) return null;

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div>
          <span className={styles.tag}>🔒 SÉLECTION DU MOMENT</span>
          <h2>Véhicules en vedette</h2>
        </div>
        <Link to="/catalogue" className={styles.ctaLink}>
          Voir tout le catalogue →
        </Link>
      </div>

      <div className={styles.carouselWrapper}>
        {/* Bouton précédent */}
        {total > VISIBLE && (
          <button
            type="button"
            className={`${styles.carouselBtn} ${styles.carouselPrev}`}
            onClick={goPrev}
            aria-label="Précédent"
          >
            ‹
          </button>
        )}

        {/* Grille de cartes */}
        <div className={`${styles.grid} ${animDir === "left" ? styles.animLeft : animDir === "right" ? styles.animRight : ""}`}>
          {displayCards.map((car, i) => (
            <VehicleCard key={`${car._id || car.id}-${i}`} car={car} compact />
          ))}
        </div>

        {/* Bouton suivant */}
        {total > VISIBLE && (
          <button
            type="button"
            className={`${styles.carouselBtn} ${styles.carouselNext}`}
            onClick={goNext}
            aria-label="Suivant"
          >
            ›
          </button>
        )}
      </div>

      {/* Dots pagination */}
      {pageCount > 1 && (
        <div className={styles.dots}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.dot} ${i === currentPage ? styles.dotActive : ""}`}
              onClick={() => setStart(i * VISIBLE)}
              aria-label={`Page ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default VehicleList;
