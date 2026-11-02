import { useState, useCallback } from "react";

// Coûts d'import : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useCoutsImport({
  headers, setConfirm, showToast, token,
}) {
  const [costConfigs,      setCostConfigs]      = useState([]);
  const [laneRates,        setLaneRates]        = useState([]);
  const [importCostLoading, setImportCostLoading] = useState(false);
  const [costConfigForm,  setCostConfigForm]    = useState(null); // null = fermé, {} = nouveau, objet = édition
  const [laneForm,        setLaneForm]          = useState(null);

  // ── Import Cost Engine — barèmes pays + liaisons de fret ─────────────────────
  const loadImportCostData = useCallback(async () => {
    if (!token) return;
    setImportCostLoading(true);
    try {
      const [cRes, lRes] = await Promise.all([
        fetch("/api/import-cost/admin/configs", { headers }),
        fetch("/api/import-cost/admin/lanes",   { headers }),
      ]);
      if (cRes.ok) setCostConfigs((await cRes.json()).configs || []);
      if (lRes.ok) setLaneRates((await lRes.json()).lanes || []);
    } catch { /* ignore */ }
    setImportCostLoading(false);
  }, [token, headers]);

  const saveCostConfig = async () => {
    if (!costConfigForm?.country) { showToast("Pays requis", "error"); return; }
    try {
      const r = await fetch("/api/import-cost/admin/configs", {
        method: "POST", headers, body: JSON.stringify(costConfigForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Barème enregistré."); setCostConfigForm(null); loadImportCostData(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  // Fenêtre de confirmation du panneau : `confirm` y désigne son état, pas
  // window.confirm — l'appel levait « confirm is not a function » (2026-11-02).
  const deleteCostConfig = (id) => setConfirm({ message: "Supprimer ce barème ?", danger: true, action: () => deleteCostConfigConfirme(id) });
  const deleteCostConfigConfirme = async (id) => {
    // La réponse n'était pas vérifiée : un refus (droits insuffisants sur ce
    // scope, contrainte serveur) affichait quand même un message de succès, et
    // la ligne restait à l'écran après rechargement — l'admin croyait à un
    // bug d'affichage et recommençait.
    try {
      const r = await fetch(`/api/import-cost/admin/configs/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Barème supprimé.");
      loadImportCostData();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  const saveLaneRate = async () => {
    if (!laneForm?.sourceCountry || !laneForm?.destCountry || !laneForm?.seaFreightUSD) {
      showToast("Pays d'origine, destination et tarif de fret requis", "error"); return;
    }
    try {
      const isEdit = !!laneForm._id;
      const r = await fetch(isEdit ? `/api/import-cost/admin/lanes/${laneForm._id}` : "/api/import-cost/admin/lanes", {
        method: isEdit ? "PATCH" : "POST", headers, body: JSON.stringify(laneForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) { showToast("Liaison enregistrée."); setLaneForm(null); loadImportCostData(); }
      else showToast(d?.message || "Erreur", "error");
    } catch { showToast("Erreur réseau", "error"); }
  };

  // Fenêtre de confirmation du panneau : `confirm` y désigne son état, pas
  // window.confirm — l'appel levait « confirm is not a function » (2026-11-02).
  const deleteLaneRate = (id) => setConfirm({ message: "Supprimer cette liaison ?", danger: true, action: () => deleteLaneRateConfirme(id) });
  const deleteLaneRateConfirme = async (id) => {
    try {
      const r = await fetch(`/api/import-cost/admin/lanes/${id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        showToast(d?.message || "Suppression refusée par le serveur.", "error");
        return;
      }
      showToast("Liaison supprimée.");
      loadImportCostData();
    } catch { showToast("Erreur réseau — rien n'a été supprimé.", "error"); }
  };

  return {
    costConfigForm, costConfigs, deleteCostConfig, deleteLaneRate, importCostLoading,
    laneForm, laneRates, loadImportCostData, saveCostConfig, saveLaneRate,
    setCostConfigForm, setLaneForm,
  };
}
