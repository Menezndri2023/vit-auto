import { useState, useCallback } from "react";

// Publicités & campagnes : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function usePublicites({
  headers, showToast, token,
}) {
  // Publicités & Campagnes
  const [adsList,        setAdsList]        = useState([]);
  const [adsLoading,     setAdsLoading]     = useState(false);
  const [adForm,         setAdForm]         = useState(null); // objet en édition/création, null = fermé
  const [adSaving,       setAdSaving]       = useState(false);

  // ── Publicités & Campagnes ───────────────────────────────────────────────────
  const loadAds = useCallback(async () => {
    if (!token) return;
    setAdsLoading(true);
    try {
      const r = await fetch("/api/ads/all", { headers });
      if (r.ok) setAdsList(await r.json());
    } catch { /* ignore */ }
    setAdsLoading(false);
  }, [token, headers]);

  const saveAd = async () => {
    if (!adForm?.title?.trim()) { showToast("Titre requis", "error"); return; }
    setAdSaving(true);
    try {
      const isNew = !adForm._id;
      const r = await fetch(isNew ? "/api/ads" : `/api/ads/${adForm._id}`, {
        method: isNew ? "POST" : "PUT", headers,
        body: JSON.stringify(adForm),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast(isNew ? "Annonce créée." : "Annonce mise à jour.", "success");
      setAdForm(null);
      loadAds();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setAdSaving(false); }
  };

  const toggleAdActive = async (ad) => {
    try {
      const r = await fetch(`/api/ads/${ad._id}`, {
        method: "PUT", headers,
        body: JSON.stringify({ active: !ad.active }),
      });
      if (r.ok) loadAds();
    } catch { showToast("Erreur réseau", "error"); }
  };

  const deleteAd = async (id) => {
    if (!window.confirm("Supprimer définitivement cette annonce ?")) return;
    try {
      const r = await fetch(`/api/ads/${id}`, { method: "DELETE", headers });
      if (r.ok) { showToast("Annonce supprimée.", "success"); loadAds(); }
    } catch { showToast("Erreur réseau", "error"); }
  };

  return {
    adForm, adSaving, adsList, adsLoading, deleteAd,
    loadAds, saveAd, setAdForm, toggleAdActive,
  };
}
