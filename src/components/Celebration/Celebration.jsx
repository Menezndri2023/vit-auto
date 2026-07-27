import { useEffect, useRef } from "react";
import styles from "./Celebration.module.css";

// Confetti canvas vanille (aucune dépendance ajoutée — voir package.json,
// aucune lib d'animation n'est installée dans ce projet). Brûle ~2.4s de
// particules puis se nettoie tout seul ; pointer-events:none partout sauf
// la carte, pour ne jamais bloquer la page en dessous ("pas encombrant").
const COLORS = ["#ff4d2d", "#0f1b3f", "#2563eb", "#10b981", "#f59e0b", "#ffffff"];
const DURATION_MS = 2400;

function runConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const count = window.innerWidth < 640 ? 70 : 140;
  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 10,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    speedY: 2.5 + Math.random() * 3.5,
    speedX: (Math.random() - 0.5) * 2.5,
    rotation: Math.random() * 360,
    spin: (Math.random() - 0.5) * 12,
  }));

  const start = performance.now();
  let raf;

  const frame = (now) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const fadeOut = elapsed > DURATION_MS - 500 ? Math.max(0, (DURATION_MS - elapsed) / 500) : 1;

    for (const p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.spin;
      ctx.save();
      ctx.globalAlpha = fadeOut;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (elapsed < DURATION_MS) {
      raf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// `celebration` : { title, message, emoji? } | null — voir NotificationContext
// (déclenché par un événement socket "celebrate" ou un appel direct côté page,
// ex: première réservation confirmée).
export default function Celebration({ celebration, onDismiss }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!celebration || !canvasRef.current) return undefined;
    const stop = runConfetti(canvasRef.current);
    // Se ferme seule — jamais besoin d'un clic pour continuer sa navigation.
    const timer = setTimeout(onDismiss, 5000);
    return () => { stop(); clearTimeout(timer); };
  }, [celebration, onDismiss]);

  if (!celebration) return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.card}>
        <button className={styles.close} onClick={onDismiss} aria-label="Fermer">×</button>
        <div className={styles.emoji}>{celebration.emoji || "🎉"}</div>
        <h3 className={styles.title}>{celebration.title}</h3>
        {celebration.message && <p className={styles.message}>{celebration.message}</p>}
      </div>
    </div>
  );
}
