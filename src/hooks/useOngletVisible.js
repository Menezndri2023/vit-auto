import { useEffect } from "react";

// Barres d'onglets qui défilent horizontalement sur téléphone : l'onglet
// actif ouvert par lien (?tab=entreprises) ou situé à droite restait hors de
// l'écran — l'utilisateur ne voyait pas où il était. À chaque changement,
// l'onglet actif est amené au centre de la barre, sans faire défiler la page.
//
//   const barre = useRef(null);
//   useOngletVisible(barre, activeTab, ".actif");
export function useOngletVisible(refBarre, cle, selecteurActif) {
  useEffect(() => {
    const barre = refBarre.current;
    if (!barre || barre.scrollWidth <= barre.clientWidth) return;
    const actif = barre.querySelector(selecteurActif);
    if (!actif) return;
    const cible = actif.offsetLeft - (barre.clientWidth - actif.offsetWidth) / 2;
    try { barre.scrollTo({ left: Math.max(0, cible), behavior: "instant" }); } catch { barre.scrollLeft = Math.max(0, cible); }
  }, [refBarre, cle, selecteurActif]);
}
