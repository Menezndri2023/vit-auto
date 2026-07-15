import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";

const FavoritesContext = createContext(null);

export const useFavorites = () => {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
};

const keyOf = (itemType, itemId) => `${itemType}:${itemId}`;

export const FavoritesProvider = ({ children }) => {
  const { isAuthenticated, authFetch } = useAuth();
  // Set de clés "itemType:itemId" — juste assez pour afficher le cœur "rempli"
  // partout sans recharger tous les documents complets à chaque carte.
  const [ids, setIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const loadIds = useCallback(async () => {
    if (!isAuthenticated) { setIds(new Set()); setLoaded(true); return; }
    try {
      const res = await authFetch("/api/favorites/ids");
      if (res.ok) {
        const d = await res.json();
        setIds(new Set(d.ids || []));
      }
    } catch { /* silencieux — le cœur reste simplement non-rempli */ }
    setLoaded(true);
  }, [isAuthenticated, authFetch]);

  useEffect(() => { loadIds(); }, [loadIds]);

  const isFavorite = useCallback((itemType, itemId) => ids.has(keyOf(itemType, itemId)), [ids]);

  const toggleFavorite = useCallback(async (itemType, itemId) => {
    if (!isAuthenticated) return { ok: false, needsAuth: true };
    const key = keyOf(itemType, itemId);
    const wasFavorite = ids.has(key);

    // Optimistic update — cohérent avec le reste du site (favoris n'a pas
    // besoin d'attendre le serveur pour se sentir instantané).
    setIds((prev) => {
      const next = new Set(prev);
      wasFavorite ? next.delete(key) : next.add(key);
      return next;
    });

    try {
      const res = wasFavorite
        ? await authFetch(`/api/favorites/${itemType}/${itemId}`, { method: "DELETE" })
        : await authFetch("/api/favorites", { method: "POST", body: JSON.stringify({ itemType, itemId }) });
      if (!res.ok) throw new Error("Échec");
      return { ok: true, isFavorite: !wasFavorite };
    } catch {
      // Rollback si le serveur a refusé
      setIds((prev) => {
        const next = new Set(prev);
        wasFavorite ? next.add(key) : next.delete(key);
        return next;
      });
      return { ok: false };
    }
  }, [isAuthenticated, authFetch, ids]);

  const value = useMemo(() => ({ isFavorite, toggleFavorite, loaded, count: ids.size }), [isFavorite, toggleFavorite, loaded, ids.size]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};
