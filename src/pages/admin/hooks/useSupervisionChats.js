import { useState, useCallback, useEffect } from "react";

// Supervision des chats client ↔ partenaire : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useSupervisionChats({
  activeTab, headers, token,
}) {
  const [cpChats,        setCpChats]        = useState([]);
  const [cpChatsLoading, setCpChatsLoading] = useState(false);
  const [cpActive,       setCpActive]       = useState(null);
  const [cpMessages,     setCpMessages]     = useState([]);
  const [cpMsgLoading,   setCpMsgLoading]   = useState(false);

  // ── Supervision chats client_partner (lecture seule, audit 2026-08) ─────
  const loadClientPartnerChats = useCallback(async () => {
    if (!token) return;
    setCpChatsLoading(true);
    try {
      const r = await fetch("/api/chats/admin/client-partner", { headers });
      if (r.ok) setCpChats((await r.json()).chats || []);
    } catch { /* ignore */ }
    setCpChatsLoading(false);
  }, [token, headers]);

  const openClientPartnerChat = useCallback(async (chat) => {
    setCpActive(chat);
    setCpMsgLoading(true);
    setCpMessages([]);
    try {
      const r = await fetch(`/api/chats/admin/client-partner/${chat._id}`, { headers });
      if (r.ok) setCpMessages((await r.json()).messages || []);
    } catch { /* ignore */ }
    setCpMsgLoading(false);
  }, [headers]);

  // Même logique de polling pour la supervision chats client_partner (audit 2026-08).
  useEffect(() => {
    if (activeTab !== "chat_supervision") return undefined;
    const t = setInterval(loadClientPartnerChats, 15_000);
    return () => clearInterval(t);
  }, [activeTab, loadClientPartnerChats]);

  return {
    cpActive, cpChats, cpChatsLoading, cpMessages, cpMsgLoading,
    loadClientPartnerChats, openClientPartnerChat, setCpMessages,
  };
}
