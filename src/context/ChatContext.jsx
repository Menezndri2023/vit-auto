import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";

const ChatContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
};

export const ChatProvider = ({ children }) => {
  const { token, isAuthenticated, authReady } = useAuth();
  const [chats,       setChats]       = useState([]);
  const [activeChat,  setActiveChat]  = useState(null); // { _id, other, type, ... }
  const [messages,    setMessages]    = useState([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const pollRef = useRef(null);

  const fetchChats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/chats", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const { chats: list } = await res.json();
      setChats(list || []);
      const total = (list || []).reduce((s, c) => s + (c.unread || 0), 0);
      setUnreadTotal(total);
    } catch { /* backend unavailable */ }
  }, [token]);

  const fetchMessages = useCallback(async (chatId) => {
    if (!token || !chatId) return;
    try {
      const res = await fetch(`/api/chats/${chatId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const { messages: msgs } = await res.json();
      setMessages(msgs || []);
      // Mettre à jour le compteur non-lu pour ce chat
      setChats((prev) => prev.map((c) => c._id === chatId ? { ...c, unread: 0 } : c));
      setUnreadTotal((prev) => Math.max(0, prev - (chats.find((c) => c._id === chatId)?.unread || 0)));
    } catch { /* ignore */ }
  }, [token, chats]);

  // Retourne { ok, chat?, message? } plutôt que null en cas d'échec : sans ça,
  // l'appelant (Chat.jsx) n'avait aucun moyen de distinguer "aucun agent
  // disponible" ou une session expirée d'un simple clic ignoré, et n'affichait
  // donc jamais d'erreur à l'utilisateur.
  const openOrCreateChat = useCallback(async (type, targetUserId = null, bookingId = null) => {
    if (!token) return { ok: false, message: "Vous devez être connecté." };
    setLoading(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, targetUserId, bookingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoading(false); return { ok: false, message: data.message || "Impossible d'ouvrir la conversation." }; }
      setActiveChat(data.chat);
      await fetchMessages(data.chat._id);
      setOpen(true);
      setLoading(false);
      return { ok: true, chat: data.chat };
    } catch {
      setLoading(false);
      return { ok: false, message: "Erreur réseau. Réessayez." };
    }
  }, [token, fetchMessages]);

  // Retourne { ok, message? } — voir openOrCreateChat ci-dessus pour la même
  // raison : un échec d'envoi (rate limit, conversation supprimée, session
  // expirée...) doit remonter jusqu'à l'UI, pas disparaître silencieusement
  // avec le message déjà effacé de la zone de saisie.
  const sendMessage = useCallback(async (content) => {
    if (!token || !activeChat || !content.trim()) return { ok: false, message: "Message vide." };
    try {
      const res = await fetch(`/api/chats/${activeChat._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data.message || "Échec de l'envoi." };
      setMessages((prev) => [...prev, data.message]);
      setChats((prev) => prev.map((c) =>
        c._id === activeChat._id
          ? { ...c, lastMessage: content.substring(0, 80), lastMessageAt: new Date().toISOString() }
          : c
      ));
      return { ok: true };
    } catch {
      return { ok: false, message: "Erreur réseau. Réessayez." };
    }
  }, [token, activeChat]);

  const selectChat = useCallback(async (chat) => {
    setActiveChat(chat);
    await fetchMessages(chat._id);
  }, [fetchMessages]);

  const closeChat = useCallback(() => {
    setOpen(false);
    setActiveChat(null);
    setMessages([]);
  }, []);

  // Polling messages du chat actif toutes les 5s
  useEffect(() => {
    if (!activeChat || !open) {
      clearInterval(pollRef.current);
      return;
    }
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchMessages(activeChat._id), 5000);
    return () => clearInterval(pollRef.current);
  }, [activeChat, open, fetchMessages]);

  // Polling liste des chats toutes les 20s
  useEffect(() => {
    if (!authReady || !isAuthenticated || !token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChats([]);
      setUnreadTotal(0);
      return;
    }
    fetchChats();
    const t = setInterval(fetchChats, 20_000);
    return () => clearInterval(t);
  }, [authReady, isAuthenticated, token, fetchChats]);

  return (
    <ChatContext.Provider value={{
      chats, activeChat, messages, unreadTotal,
      open, setOpen, loading,
      openOrCreateChat, sendMessage, selectChat, closeChat, fetchChats,
    }}>
      {children}
    </ChatContext.Provider>
  );
};
