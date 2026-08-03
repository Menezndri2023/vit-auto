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

async function doRefreshRequest() {
  const rt = getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetch("/api/auth/refresh-token", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.token) return null;
    setToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return data.token;
  } catch {
    return null;
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
