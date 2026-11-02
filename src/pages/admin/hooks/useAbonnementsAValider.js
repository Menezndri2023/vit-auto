import { useState, useCallback } from "react";

// Abonnements et boosts à confirmer : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useAbonnementsAValider({
  headers, showToast, token,
}) {
  // Abonnements Pro / Boosts en attente de confirmation manuelle de paiement
  const [subRequests,      setSubRequests]      = useState([]);
  const [subLoading,       setSubLoading]       = useState(false);
  const [subActioning,     setSubActioning]     = useState(null);

  // ── Abonnements Pro / Boosts (paiements en attente de confirmation) ─────────
  const loadSubRequests = useCallback(async () => {
    if (!token) return;
    setSubLoading(true);
    try {
      const r = await fetch("/api/subscriptions/admin/pending", { headers });
      if (r.ok) setSubRequests((await r.json()).subscriptions || []);
    } catch { /* ignore */ }
    setSubLoading(false);
  }, [token, headers]);

  const subAction = async (path, subId, itemId) => {
    const key = `${subId}:${itemId}`;
    if (subActioning) return;
    setSubActioning(key);
    try {
      const r = await fetch(`/api/subscriptions/admin/${subId}/${path}`, { method: "PATCH", headers });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast(d?.message || "Effectué."); loadSubRequests(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSubActioning(null); }
  };

  return {
    loadSubRequests, subAction, subActioning, subLoading, subRequests,
  };
}
