import { useState, useCallback } from "react";

// Assurance : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useAssurance({
  headers, showToast, token,
}) {
  // Assurance
  const [insuranceList,    setInsuranceList]    = useState([]);

  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceModal,   setInsuranceModal]   = useState(null); // { id, status }
  const [insurancePremium, setInsurancePremium] = useState("");
  const [insuranceNote,    setInsuranceNote]    = useState("");

  const [insuranceSaving,  setInsuranceSaving]  = useState(false);

  // ── Assurance ────────────────────────────────────────────────────────────────
  const loadInsurance = useCallback(async () => {
    if (!token) return;
    setInsuranceLoading(true);
    try {
      const r = await fetch("/api/insurance/admin/list", { headers });
      if (r.ok) setInsuranceList((await r.json()).requests || []);
    } catch { /* ignore */ }
    setInsuranceLoading(false);
  }, [token, headers]);

  const submitInsuranceDecision = async () => {
    if (!insuranceModal) return;
    setInsuranceSaving(true);
    try {
      const r = await fetch(`/api/insurance/${insuranceModal.id}/decision`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status: insuranceModal.status, premium: insurancePremium, note: insuranceNote }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Décision enregistrée — client notifié", "success");
      setInsuranceModal(null);
      setInsurancePremium("");
      setInsuranceNote("");
      loadInsurance();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setInsuranceSaving(false); }
  };

  return {
    insuranceList, insuranceLoading, insuranceModal, insuranceNote, insurancePremium,
    insuranceSaving, loadInsurance, setInsuranceModal, setInsuranceNote, setInsurancePremium,
    submitInsuranceDecision,
  };
}
