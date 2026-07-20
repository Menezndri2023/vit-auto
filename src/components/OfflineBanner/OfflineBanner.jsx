import { useEffect, useState } from "react";
import styles from "./OfflineBanner.module.css";

// Signale la perte de connexion — indispensable en app native où il n'y a
// pas de chrome navigateur (icône wifi barrée, etc.) pour le faire à notre place.
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className={styles.banner} role="status">
      📡 Pas de connexion internet — certaines fonctionnalités sont indisponibles.
    </div>
  );
}
