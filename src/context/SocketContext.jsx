import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

/**
 * SocketProvider — initialise une connexion Socket.io par utilisateur connecté.
 * Reconnexion automatique si le token change (re-login).
 * Déconnexion propre au logout.
 */
export function SocketProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const socketRef  = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Pas de connexion si non authentifié
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Éviter de recréer si même token
    if (socketRef.current?.auth?.token === token) return;

    // Fermer l'ancienne connexion si elle existe
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // En dev, le backend Socket.io est sur :5001 (pas sur :5173 Vite). En prod, si
    // VITE_API_URL n'est pas configurée dans les variables d'environnement Vercel, ne
    // JAMAIS retomber sur localhost:5001 (inutilisable pour un vrai visiteur) — utiliser
    // à la place le domaine courant : /socket.io est réécrit vers le backend par
    // vercel.json (même mécanisme que /api), donc ce repli reste valide même après
    // une migration de backend (Railway→Render 2026-07-20) sans jamais coder l'URL
    // du backend en dur ici — piège rencontré une première fois avec Railway.
    // VITE_API_URL n'est utilisable ici que si c'est une URL ABSOLUE : le CI du
    // projet a pour valeur par défaut "/api", que socket.io-client interpréterait
    // comme un NAMESPACE et non une adresse — le REST continuerait de marcher
    // (les appels du front sont relatifs) mais chat et notifications seraient
    // morts, sans le moindre symptôme visible. Le repli sur l'origine courante
    // est le cas sûr (/socket.io est réécrit vers le backend, voir vercel.json).
    const envUrl = import.meta.env.VITE_API_URL;
    const SOCKET_URL = /^https?:\/\//i.test(envUrl || "")
      ? envUrl
      : (import.meta.env.PROD ? window.location.origin : "http://localhost:5001");

    const socket = io(SOCKET_URL, {
      auth:                { token },
      transports:          ["websocket", "polling"],
      // Reconnexion indéfinie (avec back-off) au lieu d'abandonner après 5
      // essais / 15 s : quand l'API se met en veille (plan Render free) ou
      // qu'un déploiement passe, un partenaire dont l'onglet reste ouvert
      // perdait DÉFINITIVEMENT ses notifications temps réel jusqu'à ce qu'il
      // pense à recharger la page.
      reconnectionAttempts: Infinity,
      reconnectionDelay:    2000,
      reconnectionDelayMax: 30000,
      timeout:              10000,
    });

    socketRef.current = socket;

    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err) => {
      console.warn("[Socket] Connexion échouée :", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, isAuthenticated]);

  // Écouter un événement — retourne une fonction cleanup
  const on = useCallback((event, handler) => {
    const s = socketRef.current;
    if (!s) return () => {};
    s.on(event, handler);
    return () => s.off(event, handler);
  }, []);

  // Retirer un listener manuellement
  const off = useCallback((event, handler) => {
    socketRef.current?.off(event, handler);
  }, []);

  // Émettre un événement depuis le client
  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const value = { socket: socketRef, connected, on, off, emit };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

const NOOP_SOCKET = {
  socket:    { current: null },
  connected: false,
  on:        () => () => {},
  off:       () => {},
  emit:      () => {},
};

export function useSocket() {
  const ctx = useContext(SocketContext);
  return ctx || NOOP_SOCKET; // Ne jamais lancer d'erreur
}

export default SocketContext;
