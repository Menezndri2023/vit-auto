import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

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
  const { on } = useSocket();
  const navigate = useNavigate();
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

  // Polling — filet de secours si la connexion Socket.io tombe (voir écoute
  // temps réel ci-dessous, même principe que ChatContext.jsx).
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

  // Temps réel — le backend émet déjà "notification_new" (InternalChannel,
  // bookingController, etc.) mais rien ne l'écoutait côté client jusqu'ici, ce
  // qui obligeait à attendre jusqu'à 20s (prochain polling) pour voir une
  // notification. useSocket() ne lance jamais d'erreur si le Provider est
  // absent (NOOP_SOCKET), donc pas de risque de crash à l'ajouter ici.
  useEffect(() => {
    if (!authReady || !isAuthenticated || !token) return undefined;

    return on("notification_new", (payload) => {
      setNotifications((prev) => (
        prev.some((n) => n._id === payload._id) ? prev : [{ ...payload, lu: false }, ...prev]
      ));
      setUnreadCount((prev) => prev + 1);
      prevUnreadRef.current += 1;
      if (soundEnabled) playNotifSound();
    });
  }, [authReady, isAuthenticated, token, on, soundEnabled]);

  // Push natif (iOS/Android) — en plus du polling ci-dessus, jamais à sa place :
  // le polling/Socket.io reste le canal universel (web + natif), le push ne
  // sert qu'à réveiller l'app quand elle est fermée/en arrière-plan.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !authReady || !isAuthenticated || !token) return;

    let registrationListener, receivedListener, actionListener;

    (async () => {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        const req = await PushNotifications.requestPermissions();
        if (req.receive !== "granted") return;
      }

      registrationListener = await PushNotifications.addListener("registration", (t) => {
        fetch("/api/notifications/push-token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ token: t.value }),
        }).catch(() => {});
      });

      receivedListener = await PushNotifications.addListener("pushNotificationReceived", () => {
        fetchNotifications();
      });

      actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const lien = action.notification?.data?.lien;
        if (lien) navigate(lien);
      });

      await PushNotifications.register();
    })();

    return () => {
      registrationListener?.remove();
      receivedListener?.remove();
      actionListener?.remove();
    };
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

  const deleteNotification = useCallback(async (id) => {
    if (!token) return;
    const wasUnread = notifications.find((n) => n._id === id && !n.lu);
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      if (wasUnread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
        prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
      }
    } catch { /* ignore */ }
  }, [token, notifications]);

  const refresh = useCallback(() => fetchNotifications(), [fetchNotifications]);

  const value = {
    notifications,
    unreadCount,
    soundEnabled,
    toggleSound,
    markAsRead,
    markAllRead,
    markAllAsRead: markAllRead,
    deleteNotification,
    fetchNotifications: refresh,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
