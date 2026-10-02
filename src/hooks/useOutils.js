import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// Verdict des outils d'abonnement pour le compte connecté
// (GET /api/subscriptions/outils — même règle que la garde serveur
// `exigeOutil` : palier, fondateur, membre d'équipe, administrateur).
//
// Avant lui, l'interface IGNORAIT le palier réel : un partenaire non abonné
// remplissait un formulaire de promotions pour apprendre, à l'enregistrement,
// qu'il ne pouvait pas s'en servir. Afficher un cadenas demande de LIRE le
// palier, pas de le deviner.
//
// Échec de lecture = aucun cadenas : on retombe sur le comportement d'avant
// (refus explicite du serveur au clic), jamais sur un outil fermé à tort à
// quelqu'un qui le paie. `ferme()` ne répond vrai que sur un refus EXPLICITE.
//
// Un seul appel par compte et par chargement de page : le tableau de bord et
// les sections du PMS posent la même question plusieurs fois.
const cache = new Map(); // clé = token → Promise<{ plan, outils }>

export function oublierOutils() { cache.clear(); }

export function useOutils() {
  const { token } = useAuth();
  const [outils, setOutils] = useState(null);

  useEffect(() => {
    if (!token) { setOutils(null); return undefined; }
    let annule = false;
    if (!cache.has(token)) {
      cache.set(token, fetch("/api/subscriptions/outils", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.outils || null)
        .catch(() => null)
        .then((o) => { if (!o) cache.delete(token); return o; }));
    }
    cache.get(token).then((o) => { if (!annule) setOutils(o); });
    return () => { annule = true; };
  }, [token]);

  const ferme = (feature) => outils?.[feature]?.ouvert === false;
  const planRequis = (feature) => (ferme(feature) ? outils[feature].planRequis : null);
  return { ferme, planRequis, charge: outils !== null };
}
