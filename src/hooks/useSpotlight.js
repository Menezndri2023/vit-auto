import { useState, useEffect } from "react";
import { useCurrency } from "../context/CurrencyContext";

/**
 * Charge une vitrine composée par le serveur.
 *
 * L'interface ne décide plus de ce qui mérite d'être montré : elle demande un
 * emplacement, le moteur répond (voir server/services/spotlightEngine.js).
 * Chaque élément porte son `origine` — « epingle », « boost », « abonnement »
 * ou « merite » — pour qu'on puisse toujours expliquer pourquoi il est là.
 *
 * Le pays vient de la position du visiteur (CurrencyContext.catalogCountry,
 * déduite de son adresse IP). Le serveur replie sur une sélection mondiale si
 * ce pays ne donne rien — l'interface n'a pas à gérer ce cas.
 */
export function useSpotlight(emplacement, { type = null } = {}) {
  const { catalogCountry } = useCurrency();
  const [etat, setEtat] = useState({ chargement: true, items: [] });

  useEffect(() => {
    let annule = false;
    const params = new URLSearchParams();
    if (catalogCountry) params.set("country", catalogCountry);
    if (type) params.set("type", type);

    fetch(`/api/spotlight/${emplacement}?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (annule) return;
        setEtat({ chargement: false, items: d?.items || [], repliMondial: !!d?.repliMondial });
      })
      // Une vitrine indisponible ne doit jamais casser la page d'accueil :
      // la section se contente de ne pas s'afficher.
      .catch(() => { if (!annule) setEtat({ chargement: false, items: [] }); });

    return () => { annule = true; };
  }, [emplacement, catalogCountry, type]);

  return etat;
}
