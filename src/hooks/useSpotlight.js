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
 * Le pays vient de la position du visiteur (CurrencyContext.catalogCountry),
 * ou de celui qu'il a choisi avec le filtre. Depuis le 2026-10-09, plus de
 * repli mondial : un pays sans mise en avant reçoit une vitrine vide, que la
 * section n'affiche pas. Rien n'est demandé avant que le pays soit connu
 * (paysPret) — sinon une vitrine étrangère s'affichait une seconde.
 */
export function useSpotlight(emplacement, { type = null } = {}) {
  const { catalogCountry, paysPret } = useCurrency();
  const [etat, setEtat] = useState({ chargement: true, items: [] });

  useEffect(() => {
    if (!paysPret) return undefined;
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
  }, [emplacement, catalogCountry, type, paysPret]);

  return etat;
}
