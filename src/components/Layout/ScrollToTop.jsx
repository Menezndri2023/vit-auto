import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * ScrollToTop — remet la vue en haut à chaque changement de route.
 * Placé dans le Layout pour couvrir toutes les pages.
 * Exception : les liens avec un hash (#section) défilent vers l'ancre.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // Si l'URL contient un ancre (#section), défiler vers l'élément
      const el = document.querySelector(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        return;
      }
    }
    // Remonter instantanément en haut à chaque changement de page
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return null;
}
