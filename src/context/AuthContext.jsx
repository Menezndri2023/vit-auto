import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { refreshAccessTokenOnce } from "../utils/tokenRefreshLock.js";

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

  useEffect(() => { saveUser(user);   }, [user]);
  useEffect(() => { saveToken(token); }, [token]);

  const navigate = useNavigate();

  // ── Fin de session (unique point de sortie) ────────────────────────────────
  // TOUTE déconnexion ramène à l'accueil : le bouton "Déconnexion", la
  // désactivation de compte, et la session expirée (échec de refresh, événement
  // "vit:logout" d'apiClient). Avant, chaque appelant décidait seul : la navbar
  // et la barre du bas ne naviguaient nulle part (l'utilisateur restait sur une
  // page protégée devenue vide, le temps que la garde de route réagisse),
  // l'admin allait à "/", le profil à "/login". `replace` pour que le bouton
  // Retour ne ramène pas sur la page protégée qu'on vient de quitter.
  const clearSession = useCallback(({ redirectHome = true } = {}) => {
    setUser(null);
    setToken(null);
    saveRefreshToken(null);
    if (redirectHome) navigate("/", { replace: true });
  }, [navigate]);

  // ── Rotation du refresh token ──────────────────────────────────────────────
  // Bug réel corrigé (audit) : délègue désormais à refreshAccessTokenOnce()
  // (tokenRefreshLock.js), verrou VRAIMENT global partagé avec apiClient.js —
  // avant ce correctif, AuthContext avait son propre verrou local
  // (refreshingRef, par instance) totalement indépendant de celui
  // d'apiClient.js, et le contrôle de démarrage ci-dessous ne le respectait
  // même pas. Le refresh token étant à usage unique côté serveur (rotation
  // stricte), deux appels concurrents provoquaient une déconnexion/erreur
  // pourtant juste après une (re)connexion réussie.
  const doRefresh = async () => {
    const newToken = await refreshAccessTokenOnce();
    if (newToken) setToken(newToken);
    return newToken;
  };

  // ── fetch avec intercepteur automatique 401 → refresh → retry ─────────────
  const authFetch = async (url, options = {}) => {
    // localStorage D'ABORD, l'état React en repli — l'ordre compte.
    // localStorage porte toujours le jeton courant, y compris après un
    // rafraîchissement ; l'état `token` est celui de la fermeture, donc périmé
    // chez un composant qui a capturé un ancien authFetch. Le préférer envoyait
    // un jeton révoqué, le serveur y voyait un rejeu et révoquait la session
    // entière : 401 en cascade sur tout le panneau d'administration (garde
    // avant push, 2026-09-12).
    // Le repli sur l'état ne sert qu'à la connexion : le jeton n'atteint
    // localStorage que par un effet de CE fournisseur, exécuté APRÈS les effets
    // des fournisseurs enfants — les favoris demandaient déjà leurs
    // identifiants sans jeton, 401, puis un rafraîchissement pour rien.
    const currentToken = loadToken() || token;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    };

    let res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      const newToken = await doRefresh();

      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        res = await fetch(url, { ...options, headers: retryHeaders });
      } else {
        // Refresh échoué → déconnexion
        clearSession();
      }
    }

    return res;
  };

  // ── Écouter l'événement vit:logout émis par apiClient (session expirée) ──
  useEffect(() => {
    const handleForceLogout = () => clearSession();
    window.addEventListener("vit:logout", handleForceLogout);
    return () => window.removeEventListener("vit:logout", handleForceLogout);
  }, [clearSession]);

  // ── Rafraîchissement PRÉVENTIF du jeton d'accès ───────────────────────────
  // Le jeton d'accès est passé de 7 jours à 1 heure (audit sécurité 2026-09) :
  // il vit dans le localStorage, donc sa durée de vie est exactement la fenêtre
  // pendant laquelle un jeton volé reste exploitable.
  //
  // apiClient rafraîchit bien sur 401 et rejoue la requête, mais une grande
  // partie des écrans (tableaux de bord admin et partenaire) appelle l'API
  // directement, sans passer par lui : au bout d'une heure, ces écrans
  // commenceraient à échouer alors que la session est parfaitement valide.
  // On renouvelle donc en avance, à intervalle régulier — l'utilisateur ne voit
  // jamais l'expiration, et le vol de jeton reste limité à une heure.
  // refreshAccessTokenOnce() est mutualisé : aucun appel concurrent possible.
  useEffect(() => {
    if (!token) return;
    const REFRESH_INTERVAL_MS = 45 * 60 * 1000; // avant l'expiration (1 h)
    const id = setInterval(() => {
      refreshAccessTokenOnce().then((t) => { if (t) setToken(t); }).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token]);

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
  const register = async ({ firstName, lastName, email, password, phone, role, country, birthDate, activity, entityType, rccm, referralCode }) => {
    // sellerType était silencieusement absent de ce payload depuis toujours : le
    // choix particulier/professionnel/entreprise fait à l'inscription (Register.jsx)
    // n'atteignait jamais le backend — createVehicle s'en sortait via un fallback
    // (amorçage au premier véhicule publié) qui masquait le vrai bug plutôt que de
    // le corriger. birthDate ajouté le 2026-07-16 (vérification d'âge). activity/
    // entityType (voir src/constants/partnerTaxonomy.js) remplacent sellerType.
    const res  = await fetch("/api/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      // Ce payload est une liste BLANCHE : tout champ absent d'ici est
      // silencieusement perdu, même s'il est correctement saisi et validé côté
      // formulaire. C'est exactement ce qui était arrivé à sellerType — un
      // champ obligatoire qui n'atteignait jamais le serveur. `rccm` ajouté le
      // 2026-09-09 (Registre de Commerce exigé des entités professionnelles).
      body:    JSON.stringify({ firstName, lastName, email, password, phone, role, country, birthDate, activity, entityType, rccm, referralCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      // `code` (ex: EMAIL_ALREADY_USED/PHONE_ALREADY_USED) propagé pour que
      // Register.jsx puisse proposer un lien direct vers /login plutôt qu'un
      // simple message d'erreur — perdu auparavant, `throw new Error(...)`
      // ne conservait que le texte.
      const err = new Error(data.message || "Erreur d'inscription.");
      err.code = data.code;
      throw err;
    }
    const backendUser = { ...data.user };
    setUser(backendUser);
    if (data.token)        setToken(data.token);
    if (data.refreshToken) saveRefreshToken(data.refreshToken);
    return {
      ...backendUser,
      emailVerificationSent: data.emailVerificationSent,
      emailVerificationCodeRequired: data.emailVerificationCodeRequired,
    };
  };

  // Code de confirmation e-mail (voir Register.jsx) — bloquant : tant que ceci
  // n'a pas réussi, l'inscription reste considérée comme incomplète côté UI.
  const verifyEmailCode = async (code) => {
    const res  = await authFetch("/api/auth/verify-email-code", {
      method: "POST",
      body:   JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Code incorrect.");
    if (data.user) setUser(data.user);
    if (data.token) setToken(data.token);
    return data;
  };

  const resendEmailCode = async () => {
    const res  = await authFetch("/api/auth/resend-email-code", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Impossible d'envoyer un nouveau code.");
    return data;
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
  const oauthGoogle = async ({ credential, birthDate, country, role, activity, entityType, rccm }) => {
    const res  = await fetch("/api/auth/oauth/google", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      // Liste blanche, comme register() ci-dessus : un champ oublié ici est
      // perdu en silence.
      body:    JSON.stringify({ credential, birthDate, country, role, activity, entityType, rccm }),
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
    clearSession();
  };

  const updateUser = (updates) => {
    const { password: _pw, ...safeUpdates } = updates || {};
    setUser((prev) => prev ? { ...prev, ...safeUpdates } : prev);
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user && !!token, authReady, authFetch, register, login, oauthGoogle, verifyTwoFactor, verifyEmailCode, resendEmailCode, logout, updateUser, setSession }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token, authReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
