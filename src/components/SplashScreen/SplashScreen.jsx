import { useState, useEffect } from "react";
import VitAutoLogo from "../Logo/VitAutoLogo";
import styles from "./SplashScreen.module.css";

/**
 * SplashScreen — s'affiche au démarrage, à chaque actualisation, et pendant les chargements.
 *
 * persistent=false (défaut) : s'auto-ferme après 2.5s (démarrage/actualisation)
 * persistent=true           : reste affiché jusqu'à démontage par React (chargements)
 */
const SplashScreen = ({ onDone, persistent = false }) => {
  const [phase, setPhase] = useState("visible");

  useEffect(() => {
    if (persistent) return;

    const exitTimer = setTimeout(() => setPhase("exit"), 2500);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      onDone?.();
    }, 3200);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, persistent]);

  if (phase === "done") return null;

  return (
    <div
      className={`${styles.splash} ${phase === "exit" ? styles.exit : ""} ${persistent ? styles.compact : ""}`}
      aria-hidden="true"
    >
      {/* Anneaux décoratifs d'arrière-plan */}
      <div className={styles.ring1} />
      <div className={styles.ring2} />
      <div className={styles.ring3} />

      <div className={styles.content}>

        {/* Logo complet : cercle VA + texte + taglines */}
        <div className={styles.logoBlock}>
          <div className={styles.logoIcon}>
            <VitAutoLogo iconSize={persistent ? 80 : 120} variant="white" />
          </div>

          {!persistent && (
            <div className={styles.textBlock}>
              <h1 className={styles.title}>VIT-AUTO</h1>
              <p className={styles.tagline1}>Achetez. Louez. Roulez.</p>
              <p className={styles.tagline2}>La mobilité en toute confiance.</p>
            </div>
          )}
        </div>

        {/* Points de chargement */}
        <div className={styles.dots}>
          <div className={styles.dot} />
          <div className={styles.dot} />
          <div className={styles.dot} />
        </div>
      </div>

      {/* Barre de progression (démarrage uniquement) */}
      {!persistent && <div className={styles.progress} />}
    </div>
  );
};

export default SplashScreen;
