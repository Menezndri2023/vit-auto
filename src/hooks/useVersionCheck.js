import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Un onglet ou une app PWA restée ouverte garde en mémoire le bundle JS chargé
// à l'ouverture — un nouveau déploiement ne lui parvient jamais tant qu'elle
// n'est pas rechargée. On compare périodiquement /version.json (toujours frais,
// cf vercel.json) au build actuellement chargé pour prévenir l'utilisateur.
export default function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;
    if (!currentVersion) return undefined;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.version && data.version !== currentVersion) {
          setUpdateAvailable(true);
        }
      } catch {
        // Réseau indisponible — on retentera au prochain cycle, rien à signaler.
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return updateAvailable;
}
