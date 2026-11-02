import { useState, useCallback } from "react";

// Financement (leasing/crédit) : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useFinancement({
  headers, showToast, token,
}) {
  // Financement (leasing/crédit)
  const [financingRequests, setFinancingRequests] = useState([]);
  const [financingLoading,  setFinancingLoading]  = useState(false);
  const [financingModal,    setFinancingModal]    = useState(null); // { id, decision }
  const [financingNote,     setFinancingNote]     = useState("");
  const [financingSaving,   setFinancingSaving]   = useState(false);

  // ── Financement ──────────────────────────────────────────────────────────────
  const loadFinancing = useCallback(async () => {
    if (!token) return;
    setFinancingLoading(true);
    try {
      const r = await fetch("/api/bookings/admin/financing", { headers });
      if (r.ok) setFinancingRequests((await r.json()).requests || []);
    } catch { /* ignore */ }
    setFinancingLoading(false);
  }, [token, headers]);

  const submitFinancingDecision = async () => {
    if (!financingModal) return;
    setFinancingSaving(true);
    try {
      const r = await fetch(`/api/bookings/${financingModal.id}/financing-decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ decision: financingModal.decision, note: financingNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setFinancingModal(null);
      setFinancingNote("");
      loadFinancing();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFinancingSaving(false); }
  };

  return {
    financingLoading, financingModal, financingNote, financingRequests, financingSaving,
    loadFinancing, setFinancingModal, setFinancingNote, submitFinancingDecision,
  };
}
