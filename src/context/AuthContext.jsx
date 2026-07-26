import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

const KEY_USER    = "vit-auto-user";
const KEY_TOKEN   = "vit-auto-token";
const KEY_REFRESH = "vit-auto-refresh";

// Nettoyer les données sensibles (migration sécurité)
const sanitizeStorage = () => {
  try {
    localStorage.removeItem("vit-auto-users");
    const raw = localStorage.getItem(KEY_USER);
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.password) {
        const { password: _pw, ...clean } = u;
        localStorage.setItem(KEY_USER, JSON.stringify(clean));
      }
    }
  } catch { /* ignore */ }
};

const loadUser         = () => { try { sanitizeStorage(); const d = localStorage.getItem(KEY_USER); return d ? JSON.parse(d) : null; } catch { return null; } };
const loadToken        = () => { try { return localStorage.getItem(KEY_TOKEN)   || null; } catch { return null; } };
const loadRefreshToken = () => { try { return localStorage.getItem(KEY_REFRESH) || null; } catch { return null; } };

const saveUser         = (u)  => { try { u     ? localStorage.setItem(KEY_USER,    JSON.stringify(u)) : localStorage.removeItem(KEY_USER);    } catch { /* ignore */ } };
const saveToken        = (t)  => { try { t     ? localStorage.setItem(KEY_TOKEN,   t)                 : localStorage.removeItem(KEY_TOKEN);   } catch { /* ignore */ } };
const saveRefreshToken = (rt) => { try { rt    ? localStorage.setItem(KEY_REFRESH, rt)                : localStorage.removeItem(KEY_REFRESH); } catch { /* ignore */ } };

export const AuthProvider = ({ children }) => {
  const [user,      setUser]      = useState(loadUser);
  const [token,     setToken]     = useState(loadToken);
  const [authReady, setAuthReady] = useState(!loadToken());

  // Éviter plusieurs refreshes simultanés
  const refreshingRef = useRef(false);
  const refreshQueue  = useRef([]);

  useEffect(() => { saveUser(user);   }, [user]);
  useEffect(() => { saveToken(token); }, [token]);

  // ── Rotation du refresh token ──────────────────────────────────────────────
  const doRefresh = async () => {
    const rt = loadRefreshToken();
    if (!rt) return null;

    try {
      const res  = await fetch("/api/auth/refresh-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        saveToken(data.token);
        if (data.refreshToken) saveRefreshToken(data.refreshToken);
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  };

  // ── fetch avec intercepteur automatique 401 → refresh → retry ─────────────
  const authFetch = async (url, options = {}) => {
    const currentToken = loadToken();
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    };

    let res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // Si un refresh est déjà en cours, attendre qu'il finisse
      if (refreshingRef.current) {
        return new Promise((resolve) => {
          refreshQueue.current.push(async (newToken) => {
            const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
            resolve(fetch(url, { ...options, headers: retryHeaders }));
          });
        });
      }

      refreshingRef.current = true;
      const newToken = await doRefresh();
      refreshingRef.current = false;

      // Vider la queue des requêtes en attente
      refreshQueue.current.forEach((cb) => cb(newToken));
      refreshQueue.current = [];

      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        res = await fetch(url, { ...options, headers: retryHeaders });
      } else {
        // Refresh échoué → déconnexion
        setUser(null);
        setToken(null);
        saveRefreshToken(null);
      }
    }

    return res;
  };

  // ── Écouter l'événement vit:logout émis par apiClient (session expirée) ──
  useEffect(() => {
    const handleForceLogout = () => {
      setUser(null);
      setToken(null);
      saveRefreshToken(null);
    };
    window.addEventListener("vit:logout", handleForceLogout);
    return () => window.removeEventListener("vit:logout", handleForceLogout);
  }, []);

  // ── Validation du token au démarrage ──────────────────────────────────────
  useEffect(() => {
    const storedToken = loadToken();
    if (!storedToken) { setAuthReady(true); return; }

    const validate = async (attemptsLeft = 8) => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${storedToken}` },
        });

        if (res.status === 401 || res.status === 403) {
          // Tenter un refresh avant de déconnecter
          const newToken = await doRefresh();
          if (newToken) {
            const res2 = await fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${newToken}` },
            });
            if (res2.ok) {
              const d = await res2.json().catch(() => null);
              if (d?.user) setUser(d.user);
            } else {
              setUser(null); setToken(null); saveRefreshToken(null);
            }
          } else {
            setUser(null); setToken(null); saveRefreshToken(null);
          }
        } else if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.user) setUser(data.user);
        }
        setAuthReady(true);
      } catch {
        if (attemptsLeft > 0) {
          setTimeout(() => validate(attemptsLeft - 1), 2000);
        } else {
          setAuthReady(true);
        }
      }
    };

    validate();
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Méthodes publiques ─────────────────────────────────────────────────────
  const register = async ({ firstName, lastName, email, password, phone, role, country, birthDate, activity, entityType }) => {
    // sellerType était silencieusement absent de ce payload depuis toujours : le
    // choix particulier/professionnel/entreprise fait à l'inscription (Register.jsx)
    // n'atteignait jamais le backend — createVehicle s'en sortait via un fallback
    // (amorçage au premier véhicule publié) qui masquait le vrai bug plutôt que de
    // le corriger. birthDate ajouté le 2026-07-16 (vérification d'âge). activity/
    // entityType (voir src/constants/partnerTaxonomy.js) remplacent sellerType.
    const res  = await fetch("/api/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ firstName, lastName, email, password, phone, role, country, birthDate, activity, entityType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erreur d'inscription.");
    const backendUser = { ...data.user };
    setUser(backendUser);
    if (data.token)        setToken(data.token);
    if (data.refreshToken) saveRefreshToken(data.refreshToken);
    return {
      ...backendUser,
      emailVerificationSent: data.emailVerificationSent,
    };
  };

  const login = async ({ identifier, email, password }) => {
    const res  = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ identifier: identifier || email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || "Identifiants invalides.");
      if (data.code)  err.code  = data.code;
      if (data.email) err.email = data.email;
      throw err;
    }
    // Bug réel trouvé en test E2E : cette fonction appelait setUser(data.user)
    // sans jamais vérifier data.requiresTwoFactor — un compte avec le 2FA activé
    // recevait donc un challengeToken (pas de session réelle) mais Login.jsx
    // affichait quand même "Connexion réussie" et redirigeait, sans aucun moyen
    // de saisir le code 2FA nulle part dans l'app. Voir oauthGoogle ci-dessous,
    // qui gérait déjà ce cas correctement — même pattern appliqué ici.
    if (data.requiresTwoFactor) return data; // { requiresTwoFactor, challengeToken }
    setUser(data.user);
    if (data.token)        setToken(data.token);
    if (data.refreshToken) saveRefreshToken(data.refreshToken);
    return data.user;
  };

  // Connexion / inscription Google — `birthDate`/`country`/`role`/`activity`/
  // `entityType` ne sont fournis que depuis Register.jsx (voir authController.js
  // oauthGoogle : sans birthDate, un compte inexistant renvoie OAUTH_NO_ACCOUNT
  // au lieu d'être créé).
  const oauthGoogle = async ({ credential, birthDate, country, role, activity, entityType }) => {
    const res  = await fetch("/api/auth/oauth/google", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ credential, birthDate, country, role, activity, entityType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || "Erreur d'authentification Google.");
      if (data.code) err.code = data.code;
      throw err;
    }
    if (data.requiresTwoFactor) return data; // { requiresTwoFactor, challengeToken }
    setUser(data.user);
    if (data.token)        setToken(data.token);
    if (data.refreshToken) saveRefreshToken(data.refreshToken);
    return data.user;
  };

  // Complète une connexion après le challenge 2FA (voir login/oauthGoogle
  // ci-dessus, qui renvoient { requiresTwoFactor, challengeToken } au lieu
  // d'ouvrir une session tant que ce code n'a pas été vérifié).
  const verifyTwoFactor = async ({ challengeToken, token }) => {
    const res  = await fetch("/api/auth/2fa/verify", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ challengeToken, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Code invalide.");
    setUser(data.user);
    if (data.token)        setToken(data.token);
    if (data.refreshToken) saveRefreshToken(data.refreshToken);
    return data.user;
  };

  // Hydrate la session à partir d'une réponse déjà authentifiée (ex: vérification
  // email réussie) sans repasser par /api/auth/login.
  const setSession = (sessionUser, jwtToken, refreshToken) => {
    setUser(sessionUser);
    if (jwtToken)     setToken(jwtToken);
    if (refreshToken) saveRefreshToken(refreshToken);
  };

  const logout = async () => {
    const rt = loadRefreshToken();
    if (rt) {
      fetch("/api/auth/revoke-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${loadToken()}` },
        body:    JSON.stringify({ refreshToken: rt }),
      }).catch(() => {}); // Non bloquant
    }
    setUser(null);
    setToken(null);
    saveRefreshToken(null);
  };

  const updateUser = (updates) => {
    const { password: _pw, ...safeUpdates } = updates || {};
    setUser((prev) => prev ? { ...prev, ...safeUpdates } : prev);
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user, authReady, authFetch, register, login, oauthGoogle, verifyTwoFactor, logout, updateUser, setSession }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token, authReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
