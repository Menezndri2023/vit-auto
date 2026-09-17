// ── Rafraîchissement de session pour TOUTES les requêtes /api ──────────────
//
// Le jeton d'accès vit une heure. Un partenaire qui remplit une publication
// (7 étapes, photos) plus d'une heure après sa connexion recevait « Token
// invalide ou expiré » au clic final (2026-09-17) : VehicleContext.addVehicle,
// comme 150 autres appels du front, envoie `fetch` directement avec le jeton
// lu dans l'état React — jeton qui n'est jamais mis à jour par le
// rafraîchissement préventif (seul localStorage l'est), et sans reprise sur
// 401. Seuls apiClient.js et AuthContext.authFetch savaient reprendre.
//
// Plutôt que de réécrire chaque appel, ce module enveloppe `window.fetch` une
// fois au démarrage : toute requête vers /api portant un « Bearer » part avec
// le jeton COURANT (localStorage), et sur 401 elle est rejouée une fois avec
// un jeton rafraîchi (refreshAccessTokenOnce — un seul appel en vol, verrou
// entre onglets). Si le rafraîchissement échoue, la réponse 401 d'origine est
// rendue telle quelle : l'appelant garde son traitement, AuthContext sa
// déconnexion. Les routes d'authentification elles-mêmes ne sont jamais
// rejouées (un 401 y est une réponse, pas une session périmée).
import { refreshAccessTokenOnce } from "./tokenRefreshLock.js";

const KEY_TOKEN = "vit-auto-token";
const SANS_REPRISE = /\/api\/auth\/(login|register|refresh-token|revoke-token|logout|verify-2fa|oauth)/;

const jetonCourant = () => { try { return localStorage.getItem(KEY_TOKEN) || ""; } catch { return ""; } };

export function estRequeteApiAuthentifiee(url, headers) {
  const chemin = String(url || "");
  if (!/^(?:https?:\/\/[^/]+)?\/api\//.test(chemin)) return false;
  if (SANS_REPRISE.test(chemin)) return false;
  return (headers.get("Authorization") || "").startsWith("Bearer ");
}

export function installerRafraichissementSession(fetchOriginal = window.fetch) {
  if (typeof window === "undefined" || window.__vitFetchSession) return;
  window.__vitFetchSession = true;
  const original = fetchOriginal.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const headers = new Headers(init.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
    if (!estRequeteApiAuthentifiee(url, headers)) return original(input, init);

    // Jeton périmé lu dans un état React : remplacé par le jeton courant.
    const courant = jetonCourant();
    if (courant && headers.get("Authorization") !== `Bearer ${courant}`) headers.set("Authorization", `Bearer ${courant}`);
    let res = await original(input, { ...init, headers });
    if (res.status !== 401) return res;

    const nouveau = await refreshAccessTokenOnce();
    if (!nouveau) return res;
    headers.set("Authorization", `Bearer ${nouveau}`);
    return original(input, { ...init, headers });
  };
}
