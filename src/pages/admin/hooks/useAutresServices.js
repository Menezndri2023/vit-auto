import { useState, useCallback } from "react";

// Autres services (transport, transit, douanes…) : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useAutresServices({
  headers, showToast, token,
}) {
  // Demandes de services génériques (transport/transit/douanes/immatriculation/
  // garantie/financement/change de devises) — voir server/models/ServiceRequest.js
  const [svcReqList,       setSvcReqList]       = useState([]);
  const [svcReqLoading,    setSvcReqLoading]    = useState(false);
  const [svcReqCategory,   setSvcReqCategory]   = useState("");
  const [svcReqModal,      setSvcReqModal]      = useState(null); // { id, status }
  const [svcReqAmount,     setSvcReqAmount]     = useState("");
  const [svcReqNote,       setSvcReqNote]       = useState("");
  const [svcReqSaving,     setSvcReqSaving]     = useState(false);

  // ── Demandes de services génériques ──────────────────────────────────────────
  const loadServiceRequests = useCallback(async () => {
    if (!token) return;
    setSvcReqLoading(true);
    try {
      const params = svcReqCategory ? `?category=${svcReqCategory}` : "";
      const r = await fetch(`/api/service-requests/admin/list${params}`, { headers });
      if (r.ok) setSvcReqList((await r.json()).requests || []);
    } catch { /* ignore */ }
    setSvcReqLoading(false);
  }, [token, headers, svcReqCategory]);

  const submitServiceRequestDecision = async () => {
    if (!svcReqModal) return;
    setSvcReqSaving(true);
    try {
      const r = await fetch(`/api/service-requests/${svcReqModal.id}/decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: svcReqModal.status, quotedAmountUSD: svcReqAmount, note: svcReqNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setSvcReqModal(null);
      setSvcReqAmount("");
      setSvcReqNote("");
      loadServiceRequests();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setSvcReqSaving(false); }
  };

  return {
    loadServiceRequests, setSvcReqAmount, setSvcReqCategory, setSvcReqModal, setSvcReqNote,
    submitServiceRequestDecision, svcReqAmount, svcReqCategory, svcReqList, svcReqLoading,
    svcReqModal, svcReqNote, svcReqSaving,
  };
}
