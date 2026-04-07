import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

const STORAGE_KEY_USER = "vit-auto-user";
const STORAGE_KEY_USERS = "vit-auto-users";
const STORAGE_KEY_TOKEN = "vit-auto-token";

const loadUser = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_USER);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const loadToken = () => {
  try {
    return localStorage.getItem(STORAGE_KEY_TOKEN) || null;
  } catch {
    return null;
  }
};

const loadUsers = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY_USERS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveUser = (user) => {
  try {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  } catch {
    // ignore
  }
};

const saveUsers = (users) => {
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  } catch {
    // ignore
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(loadUser());
  const [token, setToken] = useState(loadToken());

  useEffect(() => {
    saveUser(user);
    if (token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }, [user, token]);

  const register = async ({ firstName, lastName, email, password, phone, role }) => {
    const existingUsers = loadUsers();
    if (existingUsers.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("Un compte existe déjà pour cet e-mail.");
    }

    const newUser = {
      id: Date.now(),
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      password,
      role: role || "client",
      createdAt: new Date().toISOString(),
    };

    const nextUsers = [...existingUsers, newUser];
    saveUsers(nextUsers);
    setUser({ ...newUser, password: undefined });
    setToken(null);

    let backendToken = null;
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.token) backendToken = data.token;
      }
    } catch {
      // ignore network errors in offline mode
    }

    if (backendToken) setToken(backendToken);

    return newUser;
  };

  const login = async ({ email, password }) => {
    const existingUsers = loadUsers();
    const matched = existingUsers.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

    if (!matched) {
      throw new Error("Identifiants invalides.");
    }

    let loggedUser = { ...matched, password: undefined };
    let authToken = null;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.user) loggedUser = data.user;
        if (data.token) authToken = data.token;
      }
    } catch {
      // ignore
    }

    setUser(loggedUser);
    if (authToken) setToken(authToken);

    return loggedUser;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!user, register, login, logout }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
