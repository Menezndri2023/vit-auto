import { useState, useCallback } from "react";

// Bot WhatsApp partenaires : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useWhatsapp({
  headers, showToast, token,
}) {
  // Bot WhatsApp partenaires — conversations à reprendre (status="escalated")
  const [waConversations, setWaConversations] = useState([]);
  const [waLoading,       setWaLoading]       = useState(false);
  const [waFilter,        setWaFilter]        = useState("escalated");
  const [waActive,        setWaActive]        = useState(null);   // conversation ouverte (détail complet)
  const [waReply,         setWaReply]         = useState("");

  const loadWaConversations = useCallback(async () => {
    if (!token) return;
    setWaLoading(true);
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations?status=${waFilter}`, { headers });
      if (r.ok) { const d = await r.json(); setWaConversations(d.conversations || []); }
    } catch { /* ignore */ }
    setWaLoading(false);
  }, [token, headers, waFilter]);

  const openWaConversation = async (conv) => {
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${conv._id}`, { headers });
      if (r.ok) { const d = await r.json(); setWaActive(d.conversation); }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const sendWaReply = async () => {
    if (!waReply.trim() || !waActive) return;
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${waActive._id}/reply`, {
        method: "POST", headers, body: JSON.stringify({ message: waReply.trim() }),
      });
      const d = await r.json();
      if (r.ok) { setWaActive(d.conversation); setWaReply(""); loadWaConversations(); }
      else showToast(d.message || "Échec d'envoi.", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  const waSetStatus = async (id, status) => {
    try {
      const r = await fetch(`/api/whatsapp/admin/conversations/${id}/status`, {
        method: "PATCH", headers, body: JSON.stringify({ status }),
      });
      if (r.ok) {
        showToast(status === "bot" ? "Rendu au bot." : "Conversation clôturée.");
        setWaActive(null);
        loadWaConversations();
      }
    } catch { showToast("Erreur réseau", "error"); }
  };

  return {
    loadWaConversations, openWaConversation, sendWaReply, setWaFilter, setWaReply,
    waActive, waConversations, waFilter, waLoading, waReply,
    waSetStatus,
  };
}
