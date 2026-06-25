import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";

const NotificationContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
};

// Son de notification via Web Audio API
function playNotifSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const makeNote = (freq, start, duration) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.22, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.start(now + start);
      osc.stop(now + start + duration);
    };
    makeNote(880, 0,    0.12);
    makeNote(1100, 0.13, 0.18);
  } catch { /* Audio non disponible */ }
}

export const NotificationProvider = ({ children }) => {
  const { token, isAuthenticated, authReady } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [soundEnabled,  setSoundEnabled]  = useState(() => {
    try { return localStorage.getItem("vit-notif-sound") !== "false"; } catch { return true; }
  });
  const prevUnreadRef = useRef(0);
  const intervalRef   = useRef(null);
  const isFirstFetch  = useRef(true);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("vit-notif-sound", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data     = await res.json();
      const newList  = data.notifications || [];
      const newCount = data.nonLues || 0;

      setNotifications(newList);
      setUnreadCount(newCount);

      if (!isFirstFetch.current && soundEnabled && newCount > prevUnreadRef.current) {
        playNotifSound();
      }
      prevUnreadRef.current = newCount;
      isFirstFetch.current  = false;
    } catch { /* backend indisponible */ }
  }, [token, soundEnabled]);

  // Polling simple — pas de dépendance Socket.io pour éviter les crashs
  useEffect(() => {
    if (!authReady || !isAuthenticated || !token) {
      setNotifications([]);
      setUnreadCount(0);
      prevUnreadRef.current = 0;
      isFirstFetch.current  = true;
      return;
    }

    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 20_000); // toutes les 20s

    return () => clearInterval(intervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isAuthenticated, token]);

  const markAsRead = useCallback(async (id) => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, lu: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
    } catch { /* ignore */ }
  }, [token]);

  const markAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
      setUnreadCount(0);
      prevUnreadRef.current = 0;
    } catch { /* ignore */ }
  }, [token]);

  const refresh = useCallback(() => fetchNotifications(), [fetchNotifications]);

  const value = {
    notifications,
    unreadCount,
    soundEnabled,
    toggleSound,
    markAsRead,
    markAllRead,
    fetchNotifications: refresh,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
