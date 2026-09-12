// Verrou de rafraîchissement de token partagé par TOUT le front (AuthContext.jsx
// ET apiClient.js) — bug réel corrigé (audit) : les deux fichiers avaient
// chacun leur propre verrou "anti-refresh-concurrent" (isRefreshing module-
// level dans apiClient.js, refreshingRef par instance dans AuthContext.jsx),
// jamais coordonnés entre eux, et le contrôle de démarrage d'AuthContext
// (validation du token à chaque montage — donc à CHAQUE reconnexion) appelait
// même doRefresh() sans passer par son propre verrou. Le refresh token est à
// usage unique côté serveur (rotation stricte, voir authController.refreshToken)
// : deux appels concurrents utilisant le même refresh token font que le
// second échoue avec "Refresh token révoqué ou invalide" et déconnecte
// l'utilisateur, alors qu'il vient pourtant de se (re)connecter avec succès.
// Ce module garantit qu'un seul appel HTTP de rafraîchissement est jamais en
// vol à la fois, quel que soit le code qui le déclenche — tous les appelants
// concurrents partagent la même promesse et reçoivent le même résultat.

const KEY_TOKEN   = "vit-auto-token";
const KEY_REFRESH = "vit-auto-refresh";

const getRefreshToken = () => { try { return localStorage.getItem(KEY_REFRESH) || ""; } catch { return ""; } };
const setToken        = (t)  => { try { t  ? localStorage.setItem(KEY_TOKEN,   t)  : localStorage.removeItem(KEY_TOKEN);   } catch { /* ignore */ } };
const setRefreshToken = (rt) => { try { rt ? localStorage.setItem(KEY_REFRESH, rt) : localStorage.removeItem(KEY_REFRESH); } catch { /* ignore */ } };

let inFlight = null;

// ── Verrou ENTRE ONGLETS ────────────────────────────────────────────────────
// `inFlight` ne vaut que pour un onglet. Deux onglets du même site partagent
// le même refresh token dans localStorage et ont chacun leur minuteur de
// rafraîchissement préventif, synchronisés s'ils ont été ouverts ensemble :
// ils envoyaient le MÊME jeton au même instant. Le second passait pour un
// rejeu, et le serveur fermait toutes les sessions du compte — déconnexion
// « au hasard » des deux onglets (bug réel, 2026-09-12).
// Le verrou est posé dans localStorage, partagé par les onglets : celui qui
// le trouve frais attend que l'autre ait écrit le nouveau jeton, et le reprend
// tel quel au lieu de rafraîchir à son tour.
const KEY_LOCK    = "vit-auto-refresh-lock";
const LOCK_TTL_MS = 10_000;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const getToken = () => { try { return localStorage.getItem(KEY_TOKEN) || ""; } catch { return ""; } };
function poserVerrou() {
  try {
    const existant = Number(localStorage.getItem(KEY_LOCK) || 0);
    if (Date.now() - existant < LOCK_TTL_MS) return false;
    localStorage.setItem(KEY_LOCK, String(Date.now()));
    return true;
  } catch { return true; }   // stockage indisponible : un seul onglet possible
}
function leverVerrou() { try { localStorage.removeItem(KEY_LOCK); } catch { /* ignore */ } }

async function doRefreshRequest() {
  const rt = getRefreshToken();
  if (!rt) return null;
  if (!poserVerrou()) {
    // Un autre onglet rafraîchit : on attend qu'il ait écrit le nouveau jeton
    // d'accès (jusqu'au TTL du verrou), puis on le réutilise tel quel.
    const avant = getToken();
    for (let i = 0; i < LOCK_TTL_MS / 250; i++) {
      await attendre(250);
      const maintenant = getToken();
      if (maintenant && maintenant !== avant) return maintenant;
      let verrou = null; try { verrou = localStorage.getItem(KEY_LOCK); } catch { /* ignore */ }
      if (!verrou) break;
    }
    // L'autre onglet n'a rien écrit : on tente à notre tour.
    if (!poserVerrou()) return getToken() || null;
  }
  // Relu APRÈS l'attente : l'autre onglet a pu faire tourner le refresh token.
  const rtCourant = getRefreshToken();
  if (!rtCourant) { leverVerrou(); return null; }
  try {
    const res = await fetch("/api/auth/refresh-token", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refreshToken: rtCourant }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.token) return null;
    setToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return data.token;
  } catch {
    return null;
  } finally {
    leverVerrou();
  }
}

// Retourne le nouveau token d'accès, ou null si le refresh a échoué. Si un
// refresh est déjà en cours, retourne la promesse existante au lieu d'en
// démarrer un second — c'est la garantie anti-race.
export function refreshAccessTokenOnce() {
  if (!inFlight) {
    inFlight = doRefreshRequest().finally(() => { inFlight = null; });
  }
  return inFlight;
}
