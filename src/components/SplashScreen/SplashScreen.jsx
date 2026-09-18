import { useState, useEffect } from "react";
import VitAutoLogo from "../Logo/VitAutoLogo";
import styles from "./SplashScreen.module.css";

// Durée : le splash ne fait plus attendre pour rien. Il restait 3,5 s à
// heure fixe (2,8 s + 0,65 s de sortie) quelle que soit la vitesse de
// chargement — sur l'app iOS, après le splash natif, c'était 3,5 s de plus
// avant le premier écran (« le projet doit être beaucoup plus rapide »,
// exploitant, 2026-09-18). Désormais : un minimum de MIN_MS pour que le logo
// se pose, puis il s'efface dès que l'app est prête (`ready` : session
// validée) — ou au plus tard à MAX_MS si l'API tarde, l'écran d'attente
// discret prenant alors le relais.
const MIN_MS = 900;
const MAX_MS = 4000;
const SORTIE_MS = 450;

const SplashScreen = ({ onDone, persistent = false, ready = true }) => {
  const [phase, setPhase] = useState("visible");

  useEffect(() => {
    if (persistent) return;
    const debut = Date.now();
    let exitTimer, doneTimer;
    const sortir = () => {
      if (exitTimer) return;
      setPhase("exit");
      exitTimer = setTimeout(() => { setPhase("done"); onDone?.(); }, SORTIE_MS);
    };
    if (ready) {
      const reste = Math.max(0, MIN_MS - (Date.now() - debut));
      doneTimer = setTimeout(sortir, reste);
    } else {
      doneTimer = setTimeout(sortir, MAX_MS);
    }
    return () => { clearTimeout(exitTimer); clearTimeout(doneTimer); };
    // `ready` qui bascule relance l'effet : le minutage repart mais MIN_MS
    // est déjà écoulé dans le cas courant (session validée après 1 s).
  }, [onDone, persistent, ready]);

  if (phase === "done") return null;

  return (
    <div
      className={`${styles.splash} ${phase === "exit" ? styles.exit : ""} ${persistent ? styles.compact : ""}`}
      aria-hidden="true"
    >
      <div className={styles.ring1} />
      <div className={styles.ring2} />
      <div className={styles.ring3} />

      <div className={styles.content}>
        <div className={styles.logoBlock}>
          <div className={styles.logoIcon}>
            <VitAutoLogo iconSize={persistent ? 72 : 150} variant="white" />
          </div>

          {!persistent && (
            <div className={styles.textBlock}>
              <h1 className={styles.title}>VIT-AUTO</h1>
              <p className={styles.tagline1}>Achetez. Louez. Roulez.</p>
              <p className={styles.tagline2}>La mobilité en toute confiance.</p>
            </div>
          )}
        </div>

        <div className={styles.dots}>
          <div className={styles.dot} />
          <div className={styles.dot} />
          <div className={styles.dot} />
        </div>
      </div>

      {!persistent && <div className={styles.progress} />}
    </div>
  );
};

export default SplashScreen;
