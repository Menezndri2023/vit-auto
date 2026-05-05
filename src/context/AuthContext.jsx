import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

const KEY_USER  = "vit-auto-user";
const KEY_TOKEN = "vit-auto-token";

// Nettoyer les anciens mots de passe stockés en clair (migration sécurité)
const sanitizeStorage = () => {
  try {
    // Supprimer l'ancienne liste d'utilisateurs avec mots de passe en clair
    localStorage.removeItem("vit-auto-users");
    // Nettoyer le user stocké si il contient un mot de passe
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

const loadUser = () => {
  try {
    sanitizeStorage();
    const data = localStorage.getItem(KEY_USER);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
};

const loadToken = () => {
  try { return localStorage.getItem(KEY_TOKEN) || null; }
  catch { return null; }
};

const saveUser  = (user)  => { try { user ? localStorage.setItem(KEY_USER, JSON.stringify(user)) : localStorage.removeItem(KEY_USER); } catch { /* ignore */ } };
const saveToken = (token) => { try { token ? localStorage.setItem(KEY_TOKEN, token) : localStorage.removeItem(KEY_TOKEN); } catch { /* ignore */ } };

export const AuthProvider = ({ children }) => {
  const [user,        setUser]        = useState(loadUser);
  const [token,       setToken]       = useState(loadToken);
  const [authReady,   setAuthReady]   = useState(!loadToken()); // true immédiatement si pas de token

  useEffect(() => { saveUser(user);   }, [user]);
  useEffect(() => { saveToken(token); }, [token]);

  // Valider le token au démarrage avec retry (backend peut démarrer après le frontend)
  useEffect(() => {
    const storedToken = loadToken();
    if (!storedToken) {
      setAuthReady(true);
      return;
    }

    const validate = async (attemptsLeft = 8) => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (res.status === 401 || res.status === 403) {
          // Token invalide ou expiré → déconnexion silencieuse
          setUser(null);
          setToken(null);
        } else if (res.ok) {
          // Synchroniser les données utilisateur depuis le serveur (rôle, profil, etc.)
          const data = await res.json().catch(() => null);
          if (data?.user) setUser(data.user);
        }
        setAuthReady(true);
      } catch {
        // Backend pas encore prêt → réessayer dans 2 secondes
        if (attemptsLeft > 0) {
          setTimeout(() => validate(attemptsLeft - 1), 2000);
        } else {
          setAuthReady(true); // On continue même si le backend ne répond pas
        }
      }
    };

    validate();
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const register = async ({ firstName, lastName, email, password, phone, role }) => {
    const response = await fetch("/api/auth/register", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ firstName, lastName, email, password, phone, role }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Erreur d'inscription.");
    // Ne PAS stocker le mot de passe — stocker uniquement profil public + token
    const backendUser = { ...data.user };
    setUser(backendUser);
    if (data.token) setToken(data.token);
    return { ...backendUser, emailVerificationSent: data.emailVerificationSent };
  };

  const login = async ({ email, password }) => {
    const response = await fetch("/api/auth/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.message || "Identifiants invalides.");
      if (data.code)  err.code  = data.code;
      if (data.email) err.email = data.email;
      throw err;
    }
    // Stocker uniquement le profil public (jamais le password)
    setUser(data.user);
    if (data.token) setToken(data.token);
    return data.user;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
  };

  const updateUser = (updates) => {
    // Ne jamais écraser avec un mot de passe
    const { password: _pw, ...safeUpdates } = updates || {};
    setUser((prev) => prev ? { ...prev, ...safeUpdates } : prev);
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user, authReady, register, login, logout, updateUser }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token, authReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
