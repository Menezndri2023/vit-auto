import { useState, useCallback, useEffect } from "react";

// Support client : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useSupportClient({
  activeTab, headers, showToast, token,
}) {
  // Support Client (inbox chats client_support / partner_support)
  const [supportChats,    setSupportChats]    = useState([]);

  const [supportLoading,  setSupportLoading]  = useState(false);
  const [supportActive,   setSupportActive]   = useState(null);   // chat sélectionné (résumé liste)
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportMsgLoading, setSupportMsgLoading] = useState(false);
  const [supportReply,    setSupportReply]    = useState("");
  const [supportSending,  setSupportSending]  = useState(false);

  const loadSupportChats = useCallback(async () => {
    if (!token) return;
    setSupportLoading(true);
    try {
      const r = await fetch("/api/chats/support", { headers });
      if (r.ok) { const d = await r.json(); setSupportChats(d.chats || []); }
    } catch { /* ignore */ }
    setSupportLoading(false);
  }, [token, headers]);

  const openSupportChat = useCallback(async (chat) => {
    setSupportActive(chat);
    setSupportMsgLoading(true);
    setSupportMessages([]);
    try {
      const r = await fetch(`/api/chats/${chat._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setSupportMessages(d.messages || []);
        setSupportChats((prev) => prev.map((c) => c._id === chat._id ? { ...c, unread: 0, needsReply: false } : c));
      }
    } catch { /* ignore */ }
    setSupportMsgLoading(false);
  }, [headers]);

  const sendSupportReply = useCallback(async () => {
    const content = supportReply.trim();
    if (!content || !supportActive) return;
    setSupportSending(true);
    try {
      const r = await fetch(`/api/chats/${supportActive._id}`, {
        method: "POST", headers, body: JSON.stringify({ content }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSupportMessages((prev) => [...prev, d.message]);
        setSupportReply("");
        setSupportChats((prev) => prev.map((c) =>
          c._id === supportActive._id
            ? { ...c, lastMessage: content.slice(0, 100), lastMessageAt: new Date().toISOString(), needsReply: false }
            : c
        ));
      } else {
        showToast(d.message || "Erreur lors de l'envoi.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
    setSupportSending(false);
  }, [headers, supportReply, supportActive, showToast]);

  // Rafraîchissement périodique de la liste support (nouvelles demandes) tant que
  // l'onglet est affiché — même logique de polling que le widget chat public.
  useEffect(() => {
    if (activeTab !== "support") return undefined;
    const t = setInterval(loadSupportChats, 15_000);
    return () => clearInterval(t);
  }, [activeTab, loadSupportChats]);

  return {
    loadSupportChats, openSupportChat, sendSupportReply, setSupportMessages, setSupportReply,
    supportActive, supportChats, supportLoading, supportMessages, supportMsgLoading,
    supportReply, supportSending,
  };
}
