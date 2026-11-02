import { useState, useCallback } from "react";

// Vérification partenaires : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useVerificationPartenaires({
  headers, token,
}) {
  // Partner Verification System
  const [pvList,            setPvList]            = useState([]);
  const [pvStats,           setPvStats]           = useState(null);
  const [pvLoading,         setPvLoading]         = useState(false);
  const [pvFilter,          setPvFilter]          = useState({ status: "", trustLevel: "", companyType: "", search: "" });
  const [pvDetail,          setPvDetail]          = useState(null);
  const [pvCreateModal,     setPvCreateModal]     = useState(false);
  const [pvCreateForm,      setPvCreateForm]      = useState({ userId: "", companyName: "", companyType: "importateur", country: "", city: "", website: "", phone: "", email: "", description: "", exportCountries: [], importCountries: [], vehicleCategories: [], yearsExperience: 0, annualVolume: "", adminNote: "" });
  const [pvSaving,          setPvSaving]          = useState(false);
  const [pvCriterionLoading,setPvCriterionLoading]= useState("");

  // ── Partner Verification ───────────────────────────────────────────────────
  const loadPartnerVerif = useCallback(async () => {
    if (!token) return;
    setPvLoading(true);
    try {
      const params = new URLSearchParams();
      if (pvFilter.status)      params.set("status",      pvFilter.status);
      if (pvFilter.trustLevel)  params.set("trustLevel",  pvFilter.trustLevel);
      if (pvFilter.companyType) params.set("companyType", pvFilter.companyType);
      if (pvFilter.search)      params.set("search",      pvFilter.search);
      params.set("limit", "100");
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/partner-verif/admin/list?${params}`, { headers }),
        fetch("/api/partner-verif/admin/stats",          { headers }),
      ]);
      if (listRes.ok)  setPvList((await listRes.json()).verifications || []);
      if (statsRes.ok) setPvStats(await statsRes.json());
    } catch { /* ignore */ }
    setPvLoading(false);
  }, [token, headers, pvFilter]);

  return {
    loadPartnerVerif, pvCreateForm, pvCreateModal, pvCriterionLoading, pvDetail,
    pvFilter, pvList, pvLoading, pvSaving, pvStats,
    setPvCreateForm, setPvCreateModal, setPvCriterionLoading, setPvDetail, setPvFilter,
    setPvSaving,
  };
}
