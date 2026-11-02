import { useState, useCallback } from "react";

// Reversements partenaire : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useReversements({
  fetchPaged, headers, showToast, token,
}) {
  // Reversements partenaire (suivi dû vs déjà versé — voir commissionLedger.js)
  const [payoutsList,      setPayoutsList]      = useState([]);
  const [payoutsTotal,     setPayoutsTotal]     = useState(0);
  const [payoutsPendingCount, setPayoutsPendingCount] = useState(0);
  const [payoutsLoading,   setPayoutsLoading]   = useState(false);
  const [payoutsFilter,    setPayoutsFilter]    = useState("pending");
  const [payoutMarkingId,  setPayoutMarkingId]  = useState(null);

  // ── Reversements partenaire ────────────────────────────────────────────────
  const loadPayouts = useCallback(async () => {
    if (!token) return;
    setPayoutsLoading(true);
    try {
      // sens=reversements : ce que VIT AUTO doit aux partenaires, sans les
      // commissions de vente qu'ILS doivent (platform_fee) — audit 2026-10-05.
      const params = new URLSearchParams({ sens: "reversements" });
      if (payoutsFilter) params.set("status", payoutsFilter);
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items, total } = await fetchPaged(`/api/commission-ledger/admin?${params}`, { limit: 5000, pageSize: 200, key: "entries" });
      setPayoutsList(items); setPayoutsTotal(total || 0);
      const rPending = await fetch(`/api/commission-ledger/admin?status=pending&limit=1&sens=reversements`, { headers });
      if (rPending.ok) setPayoutsPendingCount((await rPending.json()).total || 0);
    } catch { /* ignore */ }
    setPayoutsLoading(false);
  }, [token, headers, payoutsFilter, fetchPaged]);

  const markPayoutPaid = async (id) => {
    if (payoutMarkingId) return;
    const paidViaTxId = window.prompt("Référence du virement (optionnel — banque/mobile money) :", "");
    if (paidViaTxId === null) return; // annulé
    setPayoutMarkingId(id);
    try {
      const r = await fetch(`/api/commission-ledger/admin/${id}/mark-paid`, {
        method: "PATCH", headers, body: JSON.stringify({ paidViaTxId: paidViaTxId || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Reversement marqué comme payé", "success");
      loadPayouts();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setPayoutMarkingId(null); }
  };

  return {
    loadPayouts, markPayoutPaid, payoutMarkingId, payoutsFilter, payoutsList,
    payoutsLoading, payoutsPendingCount, payoutsTotal, setPayoutsFilter,
  };
}
