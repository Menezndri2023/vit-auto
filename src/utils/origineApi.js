// ── Où joindre l'API quand l'interface est EMBARQUÉE dans l'app ────────────
//
// Sur le web, le front est servi par le même domaine que l'API : un chemin
// relatif « /api/… » suffit, et les 507 appels du projet en profitent.
//
// Dans l'app native, le paquet est servi depuis un serveur LOCAL
// (`vitauto://localhost` sur iOS, `https://localhost` sur Android). « /api/… »
// y désigne le paquet embarqué, pas l'API : sans réécriture, chaque appel
// répondrait 404 depuis un serveur qui n'a jamais entendu parler de /api. La
// réécriture se fait en un seul endroit — l'enrobage de `window.fetch` posé par
// fetchSession.js — plutôt qu'en 507.
//
// On vise `https://vit-auto.com` et NON l'adresse du backend. C'est la leçon
// déjà écrite dans SocketContext.jsx : coder l'hébergeur en dur s'est retourné
// contre le projet à la migration Railway → Render. `vit-auto.com` redirige
// /api et /socket.io vers le backend courant (vercel.json) ; une prochaine
// migration ne demandera donc aucune nouvelle version de l'app — ce qui compte
// double ici, puisqu'une version d'app passe par une vérification Apple de
// plusieurs jours.
import { Capacitor } from "@capacitor/core";

const ORIGINE_PAR_DEFAUT = "https://vit-auto.com";

const depuisEnv = () => {
  const v = import.meta.env?.VITE_API_URL;
  // Absolue uniquement : la valeur « /api » du CI ferait une URL invalide.
  return /^https?:\/\//i.test(v || "") ? String(v).replace(/\/+$/, "") : null;
};

/** Préfixe à poser devant les chemins d'API. Chaîne vide sur le web. */
export const ORIGINE_API = Capacitor.isNativePlatform()
  ? (depuisEnv() || ORIGINE_PAR_DEFAUT)
  : "";

/**
 * Rend absolu un chemin d'API si — et seulement si — on tourne dans l'app.
 * Laisse passer tout le reste sans y toucher : URLs déjà absolues (ImageKit,
 * OpenStreetMap), fichiers du paquet embarqué, `blob:`, `data:`.
 */
const EST_CHEMIN_API = /^\/(api|socket\.io)(\/|$|\?)/;

export function absolutiserApi(url) {
  if (!ORIGINE_API) return url;
  const chemin = String(url ?? "");
  if (EST_CHEMIN_API.test(chemin)) return ORIGINE_API + chemin;

  // URL DÉJÀ absolue mais qui vise le paquet embarqué. C'est le cas de tout
  // objet `Request` : son `.url` est toujours résolu contre la page, donc
  // « /api/x » y devient « vitauto://localhost/api/x » et le test ci-dessus ne
  // le reconnaîtrait jamais.
  const local = typeof window !== "undefined" ? window.location?.origin : null;
  if (local && chemin.startsWith(`${local}/`)) {
    const reste = chemin.slice(local.length);
    if (EST_CHEMIN_API.test(reste)) return ORIGINE_API + reste;
  }
  return url;
}

// ── Liens DESTINÉS À SORTIR DE L'APP ───────────────────────────────────────
// Parrainage, invitation partenaire, partage d'une annonce : ces adresses sont
// copiées, envoyées par message, ouvertes par quelqu'un d'autre. Construites sur
// `window.location.origin`, elles valaient `vitauto://localhost/register?ref=…`
// dans l'app — un lien que personne ne peut ouvrir, et une fonctionnalité de
// croissance silencieusement morte. Elles doivent TOUJOURS viser le site public.
export const ORIGINE_SITE = Capacitor.isNativePlatform()
  ? ORIGINE_PAR_DEFAUT
  : (typeof window !== "undefined" ? window.location.origin : ORIGINE_PAR_DEFAUT);

/** Lien public partageable, à partir d'un chemin (« /register?ref=X »). */
export const lienPublic = (chemin = "/") => `${ORIGINE_SITE}${chemin}`;

/** Lien public de la page COURANTE — remplace `window.location.href`. */
export const lienPublicCourant = () =>
  typeof window === "undefined"
    ? ORIGINE_SITE
    : `${ORIGINE_SITE}${window.location.pathname}${window.location.search}`;
